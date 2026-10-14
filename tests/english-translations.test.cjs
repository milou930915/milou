// Translation regressions use isolated storage and mocked network responses only.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const corpus=require('../content/english-translations.json');
const html=fs.readFileSync(path.join(__dirname,'../app/index.html'),'utf8');
const script=new vm.Script(html.match(/<script>([\s\S]*)<\/script>/)[1]);
function boot(saved){
 const nodes=new Map(),storage=new Map();if(saved)storage.set('gradInterviewState',JSON.stringify({records:[],seenQuestions:{},seenPapers:[],prefs:{keepRecentAudio:0,answerMode:'text'},stats:{sessions:0},sync:{enabled:false},...saved}));
 const node=key=>{if(!nodes.has(key))nodes.set(key,{innerHTML:'',textContent:'',value:'',style:{},dataset:{},classList:{add(){},remove(){},toggle(){},contains(){return false}},addEventListener(){},insertAdjacentHTML(_position,text){this.innerHTML+=text},focus(){}});return nodes.get(key);};
 const ctx=vm.createContext({document:{querySelector:node,querySelectorAll:()=>[],getElementById:id=>nodes.get('#'+id)||null},navigator:{},location:{protocol:'https:',hostname:'test.invalid',origin:'https://test.invalid'},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},console,URL,Blob,TextEncoder,AbortController,crypto:require('node:crypto').webcrypto,setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},fetch:async()=>({ok:true,json:async()=>({questions:[]})})});
 ctx.window=ctx;ctx.addEventListener=()=>{};script.runInContext(ctx);
 return {run:code=>vm.runInContext(code,ctx),node,storage,ctx};
}
function record(i,extra={}){const p=corpus[i];return {id:'old_'+i,qid:'formal_legacy_'+i,school:'nycuphys',time:'2026-10-13T00:00:00.000Z',question:'英文閱讀後說明大意｜'+p.title,domain:'english',answer:'This is my original answer. 這是原本的逐字稿。',grade:'g1',model:'請對照原英文段落，核對主題、主要機制或結果與結論。此段逐字稿尚未自動評分。',sourceTitle:p.title,sourceText:p.source,correct:[],missing:['待補'],followups:[],favorite:true,mastery:'wrong',masteryUpdatedAt:1791850000000,...extra};}
function popup(a){a.run(`var written='',prints=0;window.open=()=>({document:{open(){},write(x){written=x},close(){},readyState:'complete',fonts:{ready:Promise.resolve()}},closed:false,print(){prints++}});setTimeout=fn=>{fn();return 1};`);}
test('all 144 original paragraphs have complete translations in reviews and PDF, without network',()=>{
 const a=boot();a.run(`fetch=()=>{throw new Error('must work offline')}`);
 assert.equal(a.run('Object.values(englishPassages).flat().length'),144);
 for(const [i,p] of corpus.entries()){
  a.ctx.sample=record(i);assert.equal(a.run('bilingualAnswerFor(null,sample).zh'),p.zh);
  assert.doesNotMatch(p.zh,/[A-Za-z]|請對照原文|尚未取得/);
  const page=a.run('buildReviewDocument([sample])');assert.ok(page.includes(p.zh),p.title);assert.ok(page.includes(p.source.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')),p.title);
 }
});
test('same-title versions match exact source; unrelated online text never borrows the title translation',()=>{
 const a=boot();const duplicates=corpus.filter(p=>p.title==='Catalyst diffusion');assert.equal(duplicates.length,2);
 for(const p of duplicates){a.ctx.sample={domain:'english',sourceTitle:p.title,sourceText:p.source.replace(/ /g,'  ')};assert.equal(a.run('bilingualAnswerFor(null,sample).zh'),p.zh);}
 a.ctx.sample={domain:'english',sourceTitle:'Catalyst diffusion',sourceText:'An unrelated published abstract about another experiment.'};assert.equal(a.run('bilingualAnswerFor(null,sample).complete'),false);
});
test('old wrong and pending records render directly and leave answers, favorites, mastery and sync state untouched',()=>{
 const records=[record(39),record(60,{grade:'pending',reviewBucket:'pending',school:'nthuche'}),record(100,{mastery:'mastered'})];
 const a=boot({records,seenQuestions:{nycuphys:['q_1']},seenPapers:['PMC123'],prefs:{answerMode:'text',keepRecentAudio:2},stats:{sessions:7},sync:{enabled:false,code:'test-sync-only',endpoint:'https://test.invalid/api/sync',lastSync:1000}});
 const before=a.run('JSON.stringify(state)');const saved=a.storage.get('gradInterviewState');
 for(const r of records){a.run(`viewRecord('${r.id}')`);assert.ok(a.node('#app').innerHTML.includes(corpus[Number(r.id.slice(4))].zh));assert.match(a.node('#app').innerHTML,/This is my original answer/);}
 a.run(`buildReviewDocument(state.records);openReview('wrong','nycuphys')`);
 assert.equal(a.run('JSON.stringify(state)'),before);assert.equal(a.storage.get('gradInterviewState'),saved);
});
test('new English practice and formal English stages save complete translations with their original source',async()=>{
 const a=boot();a.ctx.passage={t:corpus[39].title,x:corpus[39].source};a.run(`currentSchool='nycuphys';currentEnglishPassage=passage;fetch=()=>{throw new Error('offline')}`);
 a.node('#answerText').value='原本的英文大意回答，保留我的內容。';await a.run(`saveEnglishAttempt('summary')`);
 assert.equal(a.run('state.records[0].model'),corpus[39].zh);assert.equal(a.run('state.records[0].translationComplete'),true);
 a.run(`formalSession={id:'new',index:0,results:[]};saveFormalStageAnswer({type:'englishReadTranslate',title:'英文翻譯'})`);
 assert.equal(a.run('state.records[0].grade'),'pending');assert.equal(a.run('state.records[0].model'),corpus[39].zh);assert.equal(a.run('state.records[0].sourceText'),corpus[39].source);
});
test('re-practicing a stored English paragraph preserves the source in the next saved record',()=>{
 const a=boot({records:[record(39)]});a.run(`practiceReviewRecord('old_39');submitUnknown()`);
 assert.equal(a.run('state.records[0].sourceText'),corpus[39].source);assert.equal(a.run('state.records[0].model'),corpus[39].zh);
});
test('online translation sends every sentence, including text beyond 4500 characters, and caches only a complete response',async()=>{
 const a=boot();const source=Array.from({length:90},(_,i)=>`Sentence ${i} contains an important result that must remain in the full translation.`).join(' ');a.ctx.source=source;
 a.run(`var sent=[];fetch=async url=>{sent.push(new URL(url).searchParams.get('q'));return {ok:true,json:async()=>[[['完整中文譯文。']]]}}`);
 const result=await a.run(`englishReferenceAnswer({t:'Online full source',x:source})`);assert.equal(result.complete,true);assert.equal(a.run(`sent.join('')`),source);
 const calls=a.run('sent.length');assert.ok(calls>1);await a.run(`englishReferenceAnswer({x:source})`);assert.equal(a.run('sent.length'),calls);
 assert.ok(a.storage.get('gradEnglishTranslationsV1'));assert.equal(a.run('state.records.length'),0);
});
test('fallback translation keeps all source text and respects the provider byte limit',async()=>{
 const a=boot();a.ctx.source='An important result with β and a complete conclusion. '.repeat(120).trim();
 a.run(`var fallback=[];fetch=async url=>{if(url.includes('googleapis'))throw new Error('unavailable');const text=new URL(url).searchParams.get('q');fallback.push(text);return {ok:true,json:async()=>({responseStatus:200,responseData:{translatedText:'完整中文譯文。'}})}}`);
 assert.ok(await a.run('ensureEnglishTranslation(source)'));assert.equal(a.run(`fallback.join('')`),a.ctx.source);assert.equal(a.run('fallback.every(s=>new TextEncoder().encode(s).length<=450)'),true);
});
test('timeouts abort translation requests instead of leaving answer saving pending forever',async()=>{
 const a=boot();a.run(`var aborts=0;fetch=(url,options)=>new Promise(()=>options.signal.addEventListener('abort',()=>aborts++));setTimeout=fn=>{fn();return 1}`);
 assert.equal(await a.run(`translateEnglishToZhTW('An online source.')`),'');assert.equal(a.run('aborts'),2);
});
test('partial and quota-failed translations are never cached or described as complete',async()=>{
 const a=boot();a.ctx.source='Full original text that cannot be discarded. '.repeat(90).trim();
 a.run(`var calls=0;fetch=async url=>{calls++;if(calls===1)return {ok:true,json:async()=>[[['第一部分。']]]};return {ok:true,json:async()=>({responseStatus:429,responseData:{translatedText:'MYMEMORY WARNING 請明天再試'}})}}`);
 assert.equal(await a.run('ensureEnglishTranslation(source)'),'');assert.equal(a.storage.get('gradEnglishTranslationsV1'),undefined);
 assert.equal(a.run('englishTranslationFailures.has(englishSourceKey(source))'),true);
});
test('old online record loads a full translation without editing or resubmitting its answer',async()=>{
 const r=record(39,{sourceTitle:'Online',sourceText:'First result. Second result. Third result. Fourth result. Fifth and final conclusion.',model:'這段主要內容可以整理為：舊版摘要。'});
 const a=boot({records:[r]});const before=a.run('JSON.stringify(state.records)');a.node('#englishTranslationView').dataset.recordId=r.id;
 a.run(`fetch=async()=>({ok:true,json:async()=>[[['第一點。第二點。第三點。第四點。最後結論。']]]})`);await a.run(`loadRecordTranslation('${r.id}')`);
 assert.match(a.node('#app').innerHTML,/原文完整中文翻譯/);assert.match(a.node('#app').innerHTML,/最後結論/);assert.doesNotMatch(a.node('#app').innerHTML,/舊版摘要/);assert.equal(a.run('JSON.stringify(state.records)'),before);
 const restored=boot({records:[r]});restored.run(`englishTranslationCache=${a.storage.get('gradEnglishTranslationsV1')}`);assert.equal(restored.run('englishAnswerFor(null,state.records[0]).complete'),true);
});
test('failed online translation offers retry; late success cannot reopen a different record',async()=>{
 const r=record(39,{sourceText:'A distinct online abstract.'});const a=boot({records:[r]});a.node('#englishTranslationView').dataset.recordId=r.id;
 a.run('fetch=async()=>{throw new Error("offline")}');await a.run(`loadRecordTranslation('${r.id}')`);assert.match(a.node('#app').innerHTML,/重試完整翻譯/);
 a.node('#englishTranslationView').dataset.recordId='another';a.node('#app').innerHTML='另一頁';
 a.run(`fetch=async()=>({ok:true,json:async()=>[[['重試後的完整譯文。']]]})`);await a.run(`loadRecordTranslation('${r.id}',true)`);assert.equal(a.node('#app').innerHTML,'另一頁');assert.equal(a.run('englishAnswerFor(null,state.records[0]).complete'),true);
});
test('PDF waits for full online translation and preserves the selected school and count',async()=>{
 const a=boot({records:[record(39,{sourceText:'An online source.'}),record(60,{school:'nthuche'})]});const before=a.run('JSON.stringify(state.records)');popup(a);
 a.run(`translationFetchJson=async()=>[[['完整線上中文譯文。']]]`);await a.run(`exportReviewPDF('latest','nycuphys')`);await new Promise(r=>setImmediate(r));
 assert.equal(a.run('prints'),1);assert.match(a.run('written'),/共 1 題/);assert.match(a.run('written'),/完整線上中文譯文/);assert.doesNotMatch(a.run('written'),/請對照原|Porous catalyst/);assert.equal(a.run('JSON.stringify(state.records)'),before);
});
test('PDF never prints incomplete English translation when providers fail',async()=>{
 const a=boot({records:[record(39,{sourceText:'An unavailable online source.'})]});popup(a);a.run(`fetch=async()=>{throw new Error('offline')}`);
 await a.run(`exportReviewPDF('latest','nycuphys')`);assert.equal(a.run('prints'),0);assert.match(a.run('written'),/本次尚未匯出/);
});
test('legacy records without source use only an unambiguous title, never a guessed same-title passage',()=>{
 const a=boot();a.ctx.sample=record(39,{sourceText:''});assert.equal(a.run('englishAnswerFor(null,sample).zh'),corpus[39].zh);
 a.ctx.sample=record(60,{sourceText:''});assert.equal(a.run('englishAnswerFor(null,sample).complete'),false);assert.match(a.run('englishAnswerFor(null,sample).zh'),/未保留可辨識/);
});
test('cloud merge preserves old English answer, favorite and newer manual mastery after translation display',()=>{
 const r=record(39,{mastery:'mastered',masteryUpdatedAt:1791900000000});const a=boot({records:[r]});a.run(`viewRecord('old_39')`);a.ctx.remote={...r,mastery:'wrong',masteryUpdatedAt:1791800000000};a.run('mergeCloudState({records:[remote]})');
 assert.equal(a.run('state.records[0].mastery'),'mastered');assert.equal(a.run('state.records[0].favorite'),true);assert.equal(a.run('state.records[0].answer'),r.answer);assert.equal(a.run('state.records[0].model'),r.model);
});
