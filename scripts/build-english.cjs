// Keep full, reviewed translations editable separately from the Railway HTML.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),target=path.join(root,'app/index.html');
let html=fs.readFileSync(target,'utf8');
const translations=JSON.parse(fs.readFileSync(path.join(root,'content/english-translations.json'),'utf8'));
const pool=vm.runInNewContext(html.slice(html.indexOf('const englishPassages='),html.indexOf('const ENGLISH_REFERENCE_ZH='))+';englishPassages');
const extra=JSON.parse(html.match(/const V4_EXTRA_ENGLISH=(.*);/)[1]);
const sources=Object.values(pool).flat().map(p=>p.x).concat(Object.values(extra).flat().map(p=>p[1]));
const key=s=>s.normalize('NFKC').replace(/\s+/g,' ').trim();
const map=new Map(translations.map(p=>[key(p.source),p.zh]));
if(map.size!==translations.length||sources.length!==map.size||sources.some(s=>!map.get(key(s))))throw new Error('English translation source coverage mismatch');
if(translations.some(p=>!p.title||!/[\u3400-\u9fff]/.test(p.zh)||/請對照原文|尚未取得/.test(p.zh)))throw new Error('Incomplete translation');
const bundle='// ENGLISH_TRANSLATIONS_START\nconst ENGLISH_TRANSLATIONS='+JSON.stringify(translations).replace(/</g,'\\u003c')+';\n// ENGLISH_TRANSLATIONS_END';
if(html.includes('// ENGLISH_TRANSLATIONS_START'))html=html.replace(/\/\/ ENGLISH_TRANSLATIONS_START[\s\S]*?\/\/ ENGLISH_TRANSLATIONS_END/,()=>bundle);
else html=html.replace('function englishSourceKey(text)',bundle+'\nfunction englishSourceKey(text)');
if(process.argv.includes('--check')){if(html!==fs.readFileSync(target,'utf8'))throw new Error('Run node scripts/build-english.cjs');}
else fs.writeFileSync(target,html);
console.log('Full English translations:',map.size);
