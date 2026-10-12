import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

const PORT = Number(Bun.env.PORT || 3000);
const BUCKET = Bun.env.S3_BUCKET || "";
const REGION = Bun.env.S3_REGION || "auto";
const ENDPOINT = Bun.env.S3_ENDPOINT || "";
const ACCESS_KEY_ID = Bun.env.S3_ACCESS_KEY_ID || "";
const SECRET_ACCESS_KEY = Bun.env.S3_SECRET_ACCESS_KEY || "";
const APP_URL = "https://raw.githubusercontent.com/milou930915/milou/main/app/index.html";
const CODE_RE = /^[A-Za-z0-9_-]{16,128}$/;

const s3 = new S3Client({
  region: REGION,
  endpoint: ENDPOINT,
  forcePathStyle: true,
  credentials: { accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_ACCESS_KEY }
});

let appCache = "";
let appCacheAt = 0;

function headers(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
    "Permissions-Policy": "microphone=(self)",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "SAMEORIGIN"
  };
}
function json(req: Request, status: number, obj: any, extra: Record<string,string> = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",...headers(req),...extra}
  });
}
async function sha256Hex(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d)).map(b=>b.toString(16).padStart(2,"0")).join("");
}
async function getObjectText(key: string) {
  const out = await s3.send(new GetObjectCommand({Bucket:BUCKET,Key:key}));
  if (!out.Body) throw new Error("empty object");
  return await out.Body.transformToString();
}
async function putObjectText(key: string, body: string) {
  await s3.send(new PutObjectCommand({
    Bucket:BUCKET,Key:key,Body:body,
    ContentType:"application/json; charset=utf-8",
    CacheControl:"no-store"
  }));
}
async function getAppHtml(force=false) {
  if (!force && appCache && Date.now()-appCacheAt < 300000) return appCache;
  // Refresh GitHub's CDN as well as this process cache. Ordinary loads share a five-minute URL.
  const revision = force ? String(Date.now()) : String(Math.floor(Date.now()/300000));
  const r = await fetch(APP_URL+"?revision="+revision,{headers:{"User-Agent":"grad-interview-web/21","Cache-Control":"no-cache"}});
  if (!r.ok) throw new Error("GitHub app fetch failed: "+r.status);
  const html = await r.text();
  if (!html.includes("研究所模擬面試") || html.length < 100000) throw new Error("invalid app payload");
  appCache = html; appCacheAt = Date.now();
  return html;
}

const manifest = JSON.stringify({
  name:"研究所模擬面試",short_name:"模擬面試",start_url:"/",display:"standalone",
  background_color:"#fbfaf7",theme_color:"#13233f",lang:"zh-TW"
});
const sw = `
const CACHE='grad-interview-v21-web-1';
const CORE=['/','/manifest.webmanifest'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
 const u=new URL(e.request.url);
 if(u.pathname.startsWith('/api/')){e.respondWith(fetch(e.request));return;}
 e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)));
});
`;

Bun.serve({
  port:PORT, hostname:"0.0.0.0",
  async fetch(req) {
    const url = new URL(req.url), path = url.pathname;
    if (req.method==="OPTIONS") return new Response(null,{status:204,headers:headers(req)});
    if (path==="/api/health") {
      let appReady=false, storageReady=false, appError="", storageError="";
      try { await getAppHtml(); appReady=true; } catch(e:any) { appError=String(e?.message||e); }
      try {
        const probe="health/"+Date.now()+".json";
        await putObjectText(probe,JSON.stringify({ok:true,time:Date.now()}));
        await getObjectText(probe); storageReady=true;
      } catch(e:any) { storageError=String(e?.message||e); }
      return json(req,appReady&&storageReady?200:503,{ok:appReady&&storageReady,version:"21-web",appReady,storageReady,appError,storageError,time:Date.now()});
    }
    if (path==="/api/config") return json(req,200,{sync:true,microphoneSecureContextExpected:true,questionUpdateDays:2,version:"21-web"});
    if (path==="/api/question-updates" || path==="/question_updates.json") return json(req,200,{version:"2026-10-12-v21",questions:[]},{"Cache-Control":"public, max-age=300"});
    if (path==="/manifest.webmanifest") return new Response(manifest,{headers:{"Content-Type":"application/manifest+json",...headers(req)}});
    if (path==="/sw.js") return new Response(sw,{headers:{"Content-Type":"application/javascript; charset=utf-8","Cache-Control":"no-cache",...headers(req)}});
    if (path.startsWith("/api/sync/")) {
      const code = decodeURIComponent(path.slice(10)).replace(/\/+$/,"");
      if (!CODE_RE.test(code)) return json(req,400,{error:"invalid sync code"});
      const key = "sync/"+await sha256Hex(code)+".json";
      if (req.method==="GET") {
        try { return new Response(await getObjectText(key),{headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",...headers(req)}}); }
        catch { return json(req,404,{error:"not found"}); }
      }
      if (req.method==="PUT") {
        const body = await req.text();
        if (!body || body.length>8000000) return json(req,413,{error:"payload too large"});
        let obj:any; try { obj=JSON.parse(body); } catch { return json(req,400,{error:"invalid json"}); }
        if (!obj?.data || typeof obj.data!=="object") return json(req,400,{error:"invalid payload"});
        obj.serverUpdatedAt=Date.now();
        await putObjectText(key,JSON.stringify(obj));
        return json(req,200,{ok:true,updatedAt:obj.serverUpdatedAt});
      }
      return json(req,405,{error:"method not allowed"});
    }
    if (path==="/" || path==="/index.html" || path==="/grad_interview_simulator_v20.html") {
      try {
        const html=await getAppHtml(url.searchParams.get("refresh")==="1");
        return new Response(html,{headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-cache, no-store, must-revalidate",...headers(req)}});
      } catch(e:any) {
        return new Response("<!doctype html><meta charset='utf-8'><title>研究所模擬面試</title><h1>網站暫時無法載入</h1><p>"+String(e?.message||e)+"</p>",{status:503,headers:{"Content-Type":"text/html; charset=utf-8",...headers(req)}});
      }
    }
    return new Response("Not found",{status:404,headers:headers(req)});
  }
});