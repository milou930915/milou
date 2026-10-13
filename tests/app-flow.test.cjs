// Full application smoke tests with an isolated DOM/storage harness. No live sync requests.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../app/index.html'),'utf8');
const script=new vm.Script(html.match(/<script>([\s\S]*)<\/script>/)[1]);
function boot(saved=null){
 const nodes=new Map(),storage=new Map();if(saved)storage.set('gradInterviewState',JSON.stringify(saved));
 const node=key=>{if(!nodes.has(key))nodes.set(key,{innerHTML:'',textContent:'',value:'',style:{},dataset:{},classList:{add(){},remove(){},toggle(){},contains(){return false}},addEventListener(){},insertAdjacentHTML(_position,text){this.innerHTML+=text},focus(){}});return nodes.get(key);};
 const ctx=vm.createContext({document:{querySelector:node,querySelectorAll:()=>[]},navigator:{},location:{protocol:'https:',hostname:'test.invalid',origin:'https://test.invalid'},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},console,URL,Blob,TextEncoder,crypto:require('node:crypto').webcrypto,setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},fetch:async()=>({ok:true,json:async()=>({questions:[]})})});
 ctx.window=ctx;ctx.addEventListener=()=>{};script.runInContext(ctx);
 return {run:code=>vm.runInContext(code,ctx),node,storage};
}
test('full app boots with all 11 schools and the existing large question bank',()=>{
 const a=boot();assert.equal(a.run('Object.keys(SCHOOL).length'),11);assert.ok(a.run('ALLQ.length')>1000);assert.match(a.node('#app').innerHTML,/依掌握度安排練習/);
});
test('unknown submission persists once and exposes a mastery confirmation',()=>{
 const a=boot();a.run("startPractice('ntuche','pro');submitUnknown();submitUnknown()");assert.equal(a.run('state.records.length'),1);assert.match(a.node('#evaluation').innerHTML,/確認完全掌握/);assert.equal(a.run('currentReviewRecords("wrong").length'),1);
 a.run("setMastery(state.records[0].id,'mastered')");assert.equal(a.run('currentReviewRecords("wrong").length'),0);assert.equal(JSON.parse(a.storage.get('gradInterviewState')).records[0].mastery,'mastered');
});
test('subject practice stays in its subject on next question',()=>{
 const a=boot();a.run("startDomainPractice('ntuche','thermo');submitUnknown();nextPracticeQuestion()");assert.equal(a.run('currentQuestion.domain'),'thermo');assert.equal(a.run('currentPracticeType'),'special');
});
test('wrong-only practice stays in its list on next question',()=>{
 const a=boot();a.run("startPractice('nycuphys','pro');submitUnknown();nextPracticeQuestion();submitUnknown();startRecordPractice('nycuphys','wrong');submitUnknown();nextPracticeQuestion()");assert.equal(a.run('currentPracticeType'),'wrong');assert.equal(a.run('ReviewScheduler.info(currentQuestion,reviewIndex()).level'),'wrong');
});
test('selected professor stays selected on next question',()=>{
 const a=boot();a.run("startProfessorPractice('nycuphys','black');submitUnknown();nextPracticeQuestion()");assert.equal(a.run('currentProf.id'),'black');
});
test('switching from formal to quick practice clears formal state',()=>{
 const a=boot();a.run("startFormal('ntuche');startGlobal('bio');submitUnknown()");assert.equal(a.run('currentMode'),'practice');assert.equal(a.run('formalSession'),null);assert.equal(a.run('state.records.length'),1);
});
test('formal pro stage preserves its deadline, hides mastery, and excludes repeated families',()=>{
 const a=boot();a.run("startFormal('ntuche');nextFormalStage();formalGuidanceUsed=1;submitUnknown()");
 assert.doesNotMatch(a.node('#evaluation').innerHTML,/確認完全掌握|建議的面試回答/);
 const deadline=a.run('formalSession.stageDeadline');const first=a.run('ReviewScheduler.family(currentQuestion,reviewIndex().byId)');
 a.run('continueFormalQuestionStage()');assert.equal(a.run('formalSession.stageDeadline'),deadline);assert.notEqual(a.run('ReviewScheduler.family(currentQuestion,reviewIndex().byId)'),first);
});
test('all schools retain their existing school and visual routing',()=>{
 const a=boot();assert.equal(a.run(`Object.keys(SCHOOL).every(id=>{currentSchool=id;currentMode='practice';return ['pro','project','personal','mixed'].every(type=>{const q=chooseQuestion(id,type);return q&&eligibleQuestion(q,id,type);})&&visualQuestionsFor(id).every(q=>visualField(q)==='project'||visualField(q)===SCHOOL[id].group);})`),true);
});
test('formal paper followup remains a paper stage',()=>{
 const a=boot();a.run("currentSchool='ntuibmb';currentMode='formal';formalSession={id:'test',school:currentSchool,stages:[{type:'paperqa',count:4,title:'Paper'}],index:0,results:[],professors:[],paperVisualUsed:true};renderFormalStage();formalGuidanceUsed=1;submitUnknown();continueFormalQuestionStage()");
 assert.equal(a.run('currentQuestion.domain'),'paper');assert.equal(a.run('formalSession.paperQIndex'),2);
});
test('sync keeps manual mastery and recent records in the right order',()=>{
 const a=boot();a.run("startPractice('ntuche','pro');submitUnknown();var stale=JSON.parse(JSON.stringify(state.records[0]));setMastery(stale.id,'mastered');mergeCloudState({records:[stale]})");assert.equal(a.run("state.records[0].mastery"),'mastered');assert.equal(a.run("currentReviewRecords('wrong').length"),0);
});
test('formal completion exposes review controls only after interview',()=>{
 const a=boot();a.run("startFormal('ntuche');nextFormalStage();formalGuidanceUsed=1;submitUnknown();finishFormal()");assert.match(a.node('#app').innerHTML,/模擬完成/);assert.match(a.node('#app').innerHTML,/確認完全掌握/);assert.equal(a.run('formalSession'),null);
});

test('old bilingual records rebuild Chinese answers from the current question bank',()=>{
 const a=boot();const out=a.run(`bilingualAnswerFor(ALLQ.find(q=>q.id==='q_1h2w2e7'),{model:'outdated English',termModel:'old terms'}).zh`);
 assert.match(out,/脫氫酶/);assert.match(out,/不能單獨認定細胞凋亡/);assert.doesNotMatch(out,/[A-Za-z]/);
});
test('translations preserve case-sensitive science and mathematical RT',()=>{
 const a=boot();assert.equal(a.run(`fullChineseAnswerText('PI、Pi、pI、μM、μm、mM、mm')`),'碘化丙啶、無機磷酸、等電點、微莫耳每公升、微米、毫莫耳每公升、毫米');
 assert.equal(a.run(`fullChineseAnswerText('ΔG = -RT ln K; CA = CA0 exp(-kt)','thermo')`),'ΔG = -RT ln K; CA = CA0 exp(-kt)');
 assert.equal(a.run(`fullChineseAnswerText('SEM','instrument')`),'掃描式電子顯微鏡');assert.equal(a.run(`fullChineseAnswerText('SEM','experiment')`),'平均值的標準誤');
});
test('all built-in Chinese answers contain no unmapped English prose',()=>{
 const a=boot();const residual=a.run(`ALLQ.flatMap(q=>(bilingualAnswerFor(q).zh.match(/[A-Za-z][A-Za-z0-9-]*(?: [A-Za-z][A-Za-z0-9-]*)*/g)||[]).filter(x=>x.length>2))`);
 const symbols=new Set(['gen','Rmin','A V','nRT','A0-F','III','ln2','kCA','CA0','ln k','A exp','d sin','vap','Cp-Cv','RT ln K','k C','obs','n-k','C0-kt','C0 e','log','Pdx','dCA','CA0 exp','kCA0','m L','xdot','H-TS','xi Psat','ln A','Aexp']);
 assert.deepEqual([...new Set(residual)].filter(x=>!symbols.has(x)),[]);
});
test('terminology recognizes Chinese, avoids substring collisions, and explains concepts',()=>{
 const a=boot();assert.equal(a.run(`hasLearningTerm('thermostat comparator gastric','stat')`),false);
 assert.match(a.run(`glossaryHtml('細胞凋亡 apoptosis')`),/有調控的細胞死亡/);
 assert.match(a.run(`glossaryHtml('SEM TEM',{domain:'instrument'})`),/掃描式電子顯微鏡/);
 assert.equal(a.run(`glossaryMatches('apoptosis 細胞凋亡').filter(([en,zh])=>zh==='細胞凋亡').length`),1);
});
test('feedback shows Chinese first, hides English by default, and includes explanatory diagrams',()=>{
 const a=boot();a.run(`currentSchool='ntuibmb';renderQuestion(ALLQ.find(q=>q.id==='q_1h2w2e7'));submitUnknown()`);
 const page=a.node('#evaluation').innerHTML;assert.match(page,/class="[^"]*answer-chinese/);assert.match(page,/class="mechanism-desktop"/);assert.match(page,/class="mechanism-mobile"/);assert.match(page,/適用條件與容易誤會/);assert.match(page,/<details class="english-answer">/);assert.doesNotMatch(page,/<details class="english-answer" open/);
});
test('formal mode does not reveal translations, terminology, or mechanisms before completion',()=>{
 const a=boot();a.run(`currentSchool='ntuibmb';currentMode='formal';renderQuestion(ALLQ.find(q=>q.id==='q_1h2w2e7'));toggleGlossary()`);
 assert.doesNotMatch(a.node('#app').innerHTML,/question-chinese|learning-lesson|glossary-grid/);assert.equal(a.node('#glossaryBox').innerHTML,'');
});
test('topic routing follows the question, not incidental answer terms',()=>{
 const a=boot();assert.equal(a.run(`lessonFor({text:'RAAS 系統的功能？',domain:'physiology',answer:'PCR CCK-8 apoptosis'}).id`),'raas');assert.equal(a.run(`lessonFor({text:'請介紹你自己',domain:'personal',answer:'CCK-8'})`),null);
 assert.equal(a.run(`lessonFor(ALLQ.find(q=>q.id==='q_1ithyed')).id`),'5fu');
});
test('branched mechanisms preserve the RAAS split and comparisons have no causal arrows',()=>{
 const a=boot();assert.equal(a.run(`JSON.stringify(LEARNING_CONTENT.lessons.find(l=>l.id==='raas').diagramEdges)`),'[[0,1],[1,2],[1,3],[2,4],[3,4]]');
 assert.doesNotMatch(a.run(`mechanismDiagram(LEARNING_CONTENT.lessons.find(l=>l.id==='enzyme'))`),/<path /);
});
test('review exports include current Chinese answers, diagrams, terms and original question charts',()=>{
 const a=boot();const page=a.run(`(()=>{const q=ALLQ.find(q=>q.id==='q_1h2w2e7');return buildReviewDocument([{qid:q.id,question:q.text,domain:q.domain,school:'ntuibmb',grade:'g1',answer:'<script>alert(1)</script>',model:'old English',termModel:'old',visualKey:VISUAL_QUESTIONS[0].visual,missing:[],followups:[]}])})()`);
 assert.match(page,/中文圖解複習講義/);assert.match(page,/mechanism-steps/);assert.match(page,/visual-stimulus/);assert.match(page,/term-item/);assert.match(page,/break-inside:auto/);assert.doesNotMatch(page,/old English|<script>alert/);assert.match(page,/&lt;script&gt;/);
});
test('read-only guide leaves learning records and mastery untouched',()=>{
 const a=boot();a.run(`openLearningGuide('cck')`);assert.equal(a.run('state.records.length'),0);assert.match(a.node('#app').innerHTML,/細胞活性試劑/);
});
test('blocked export popup reports the problem without throwing',()=>{
 const a=boot();a.run(`startPractice('ntuibmb','project');submitUnknown();window.open=()=>null;exportReviewPDF('wrong')`);assert.match(a.node('#toast').textContent,/瀏覽器擋住/);
});

test('every built-in question has an answer and variants inherit completed source answers',()=>{
 const a=boot();
 assert.equal(a.run(`ALLQ.filter(q=>/這題尚無完整|尚無完整答案/.test(buildCompleteModelAnswer(q))).length`),0);
 assert.equal(a.run(`ALLQ.filter(q=>q.variantOf&&LEARNING_CONTENT.answers[q.variantOf]).every(q=>buildCompleteModelAnswer(q)===buildCompleteModelAnswer(ALLQ.find(b=>b.id===q.variantOf)))`),true);
 const text=a.run(`bilingualAnswerFor(ALLQ.find(q=>q.variantOf==='q_1yxhps7')).zh`);
 assert.match(text,/超氧/);assert.match(text,/膜電位|載入/);assert.doesNotMatch(text,/這題尚無/);
});
test('all professor hints are Chinese while formula symbols remain intact',()=>{
 const a=boot();
 const symbols=new Set(['C1V1','C2V2','ln2','c L','UxV','h2-h1','umf','gen','i x','A0-F','obs','Rmin','n-k']);
 const residual=a.run(`ALLQ.flatMap(q=>(fullChineseAnswerText(learningHint(q),q.domain).match(/[A-Za-z][A-Za-z0-9-]*(?: [A-Za-z][A-Za-z0-9-]*)*/g)||[]).filter(s=>s.length>2))`);
 assert.deepEqual([...new Set(residual)].filter(s=>!symbols.has(s)),[]);
 a.run(`currentSchool='ntuibmb';currentMode='practice';renderQuestion(ALLQ.find(q=>q.variantOf==='q_fb6tsw'));showHint()`);
 assert.match(a.node('#hintBox').innerHTML,/兩個因子/);assert.match(a.node('#hintBox').innerHTML,/交互作用/);
 assert.match(a.run(`makeGuidancePrompt(ALLQ.find(q=>q.id==='q_1gdhpst'))`),/逐循環追蹤/);
});
test('glossary keeps case-sensitive molecules and units distinct and resolves the domain',()=>{
 const a=boot();
 assert.equal(a.run(`hasLearningTerm('pI','PI')`),false);assert.equal(a.run(`hasLearningTerm('μM','μm')`),false);
 const dye=a.run(`glossaryHtml('PI',{domain:'experiment'})`);assert.match(dye,/碘化丙啶/);assert.doesNotMatch(dye,/等電點|無機磷酸|比例積分控制/);
 const control=a.run(`glossaryHtml('PI',{domain:'control'})`);assert.match(control,/比例積分控制/);assert.doesNotMatch(control,/碘化丙啶/);
 const sem=a.run(`glossaryHtml('SEM',{domain:'experiment'})`);assert.match(sem,/平均值的標準誤/);assert.doesNotMatch(sem,/掃描式電子顯微鏡/);
 const microscopy=a.run(`glossaryHtml('SEM',{domain:'instrument'})`);assert.match(microscopy,/掃描式電子顯微鏡/);assert.doesNotMatch(microscopy,/平均值的標準誤/);
 assert.match(a.run(`termDefinition('pI','等電點')`),/淨電荷為零/);assert.match(a.run(`termDefinition('Pi','無機磷酸')`),/無機磷酸根/);
 a.run(`var searchResult={innerHTML:''};searchLearningTerms('pI',searchResult,'biochem')`);
 assert.match(a.run('searchResult.innerHTML'),/等電點/);assert.doesNotMatch(a.run('searchResult.innerHTML'),/碘化丙啶/);
 a.run(`searchLearningTerms('cell viability',searchResult,'experiment')`);assert.match(a.run('searchResult.innerHTML'),/不同方法觀察代謝/);
});
test('new mechanism lessons attach to the exact question family without changing old routing',()=>{
 const a=boot();
 assert.equal(a.run(`LEARNING_CONTENT.lessons.filter(l=>l.questionIds).every(l=>l.questionIds.every(id=>ALLQ.filter(q=>q.id===id||q.variantOf===id).every(q=>lessonFor(q)?.id===l.id)))`),true);
 assert.equal(a.run(`lessonFor(ALLQ.find(q=>q.variantOf==='q_1yxhps7')).id`),'mitosox-specific');
 assert.equal(a.run(`lessonFor({id:'unknown',domain:'project',text:'未提供的實驗問題',answer:'MitoSOX'} )`),null);
 assert.doesNotMatch(a.run(`mechanismDiagram(LEARNING_CONTENT.lessons.find(l=>l.id==='respiration-perturbation'))`),/<path /);
});
test('legacy wrong records rebuild variant explanations and export without rewriting the saved answer',()=>{
 const a=boot();
 a.run(`currentSchool='ntuibmb';renderQuestion(ALLQ.find(q=>q.variantOf==='q_1yxhps7'));submitUnknown();state.records[0].model='這題尚無完整答案';state.records[0].favorite=true;var savedBefore=JSON.stringify(state.records);var exported=buildReviewDocument(reviewExportRecords('wrong'))`);
 const doc=a.run('exported');assert.match(doc,/超氧/);assert.match(doc,/粒線體超氧訊號/);assert.match(doc,/列印／另存 PDF/);assert.doesNotMatch(doc,/這題尚無完整答案/);
 assert.equal(a.run('JSON.stringify(state.records)'),a.run('savedBefore'));
});
test('PDF popup waits for fonts, then prints the complete current document',async()=>{
 const a=boot();a.run(`startPractice('ntuibmb','project');submitUnknown();var written='',printCount=0;setTimeout=fn=>{fn();return 1};window.open=()=>({document:{write(text){written=text},close(){},fonts:{ready:Promise.resolve()},readyState:'complete'},closed:false,print(){printCount++}});exportReviewPDF('wrong')`);
 assert.equal(a.run('printCount'),0);await new Promise(resolve=>setImmediate(resolve));
 assert.equal(a.run('printCount'),1);assert.match(a.run('written'),/中文圖解複習講義/);assert.match(a.run('written'),/目的地選擇「另存為 PDF」/);
});
test('a failed font readiness promise does not prevent printing',async()=>{
 const a=boot();a.run(`startPractice('ntuibmb','project');submitUnknown();var printCount=0;setTimeout=fn=>{fn();return 1};window.open=()=>({document:{write(){},close(){},fonts:{ready:Promise.reject(new Error('font load'))},readyState:'complete'},closed:false,print(){printCount++}});exportReviewPDF('wrong')`);
 await new Promise(resolve=>setImmediate(resolve));assert.equal(a.run('printCount'),1);
});

// Regression coverage for school-scoped exports and the browser speech event lifecycle.
function speechBoot(){
 const a=boot();a.run(`
  startPractice('ntuche','pro');
  window.isSecureContext=true;
  var speechMocks=[],recorderMocks=[],trackStops=0,tasks=new Map(),taskId=0;
  setTimeout=(fn,delay)=>{const id=++taskId;tasks.set(id,{fn,delay});return id};clearTimeout=id=>tasks.delete(id);
  function runTask(delay){const entry=[...tasks].find(([,task])=>task.delay===delay);if(entry){tasks.delete(entry[0]);entry[1].fn()}}
  function result(...parts){return {resultIndex:0,results:parts.map(([text,final])=>Object.assign([{transcript:text}],{isFinal:final}))}}
  SpeechRecognition=class {constructor(){speechMocks.push(this)}start(){this.onstart?.()}stop(){this.stopped=true}abort(){this.aborted=true}};
  MediaRecorder=class {static isTypeSupported(){return true}constructor(stream){this.stream=stream;this.state='inactive';this.mimeType='audio/webm';recorderMocks.push(this)}start(){this.state='recording'}stop(){this.state='inactive';this.ondataavailable?.({data:new Blob(['audio'])});this.onstop?.()}};
  navigator.mediaDevices={getUserMedia:async()=>({getTracks:()=>[{stop(){trackStops++}}]})};
 `);return a;
}
test('school review and PDF show only that school while preserving shared mastery and all saved data',()=>{
 const a=boot();a.run(`
  currentSchool='ntuche';renderQuestion(ALLQ.find(q=>q.domain==='project'));submitUnknown();
  state.records[0].time='2026-10-01T10:00:00Z';var oldSchool=state.records[0];
  currentSchool='nckuche';renderQuestion(ALLQ.find(q=>q.id===oldSchool.qid));submitUnknown();state.records[0].time='2026-10-02T10:00:00Z';
  var recordsBefore=JSON.stringify(state.records);openReview('wrong','ntuche');
  var written='';window.open=()=>({document:{write(s){written=s},close(){},readyState:'loading'},addEventListener(){}});exportReviewPDF();
 `);
 assert.equal(a.run(`reviewExportRecords('wrong','ntuche').length`),1);
 assert.equal(a.run(`reviewExportRecords('wrong','ntuche')[0].school`),'ntuche');
 assert.match(a.node('#app').innerHTML,/reviewSchoolFilter/);assert.match(a.node('#app').innerHTML,/目前篩選：1 題/);
 const pdf=a.run('written');assert.match(pdf,/匯出範圍：臺大化工｜答錯／不會/);assert.doesNotMatch(pdf,/成大化工/);
 assert.equal(a.run('JSON.stringify(state.records)'),a.run('recordsBefore'));
 a.run(`setMastery(state.records[0].id,'mastered')`);assert.equal(a.run(`reviewExportRecords('wrong','ntuche').length`),0);
});
test('school selection survives category changes and returning from a record',()=>{
 const a=boot();a.run(`startPractice('ntuche','project');submitUnknown();openReview('wrong','ntuche');viewRecord(state.records[0].id)`);
 assert.match(a.node('#app').innerHTML,/openReview\(reviewView.filter,reviewView.school\)/);
 a.run(`openReview('unclear')`);assert.equal(a.run('reviewView.school'),'ntuche');
 assert.match(a.node('#app').innerHTML,/value="ntuche" selected/);
});
test('recent and favorite school filters apply before the limit and empty exports open no window',()=>{
 const a=boot();a.run(`state.records=Array.from({length:30},(_,i)=>({id:'r'+i,qid:'q'+i,time:new Date(1700000000000+i*1000).toISOString(),school:i%2?'ntuche':'nckuche',favorite:i%3===0}));var opened=0;window.open=()=>{opened++;return null}`);
 assert.equal(a.run(`reviewExportRecords('latest','ntuche').length`),15);
 assert.equal(a.run(`reviewExportRecords('favorite','ntuche').every(r=>r.school==='ntuche'&&r.favorite)`),true);
 a.run(`exportReviewPDF('wrong','ntuche')`);assert.equal(a.run('opened'),0);assert.match(a.node('#toast').textContent,/目前篩選範圍/);
});
test('recording without speech support explicitly explains why no transcript appears',async()=>{
 const a=speechBoot();a.run('delete window.SpeechRecognition');await a.run('startVoiceAnswer()');
 assert.match(a.node('#micStatus').textContent,/沒有提供網頁語音辨識/);
 assert.match(a.node('#recordingStatus').textContent,/音檔錄製中/);
 a.run('stopAllSpeechInput()');assert.match(a.node('#micStatus').textContent,/不會自動變成逐字稿/);
 assert.ok(a.run('currentRecording.size')>0);
});
test('interim and final speech results appear in the answer without duplicating text',()=>{
 const a=speechBoot();a.node('#answerText').value='原本的回答';a.run('startDictationOnly()');
 a.run(`speechMocks[0].onresult(result(['細胞',false]));speechMocks[0].onresult(result(['細胞培養',true],['藥',false]));speechMocks[0].onresult(result(['細胞培養',true],['藥物處理',true]))`);
 assert.equal(a.node('#answerText').value,'原本的回答 細胞培養藥物處理');assert.match(a.node('#micStatus').textContent,/已顯示逐字稿/);
});
test('speech automatically resumes after an unexpected end and keeps earlier transcript',()=>{
 const a=speechBoot();a.run(`startDictationOnly();speechMocks[0].onresult(result(['第一段',true]));speechMocks[0].onend();runTask(350);speechMocks[1].onresult(result(['第二段',true]))`);
 assert.equal(a.node('#answerText').value,'第一段 第二段');assert.equal(a.run('speechMocks.length'),2);
 a.run(`stopAllSpeechInput();speechMocks[1].onresult(result(['第二段完整',true]));speechMocks[1].onend();runTask(350)`);
 assert.equal(a.node('#answerText').value,'第一段 第二段完整');assert.equal(a.run('speechMocks.length'),2);
});
test('network and permission errors remain visible after the recorder stops',async()=>{
 for(const [code,message] of [['network',/無法連上/],['not-allowed',/權限被封鎖/],['audio-capture',/不能同時錄音/]]){
  const a=speechBoot();await a.run('startVoiceAnswer()');a.run(`speechMocks[0].onerror({error:'${code}'});speechMocks[0].onend();stopAllSpeechInput()`);
  assert.match(a.node('#micStatus').textContent,message);assert.match(a.node('#recordingStatus').textContent,/錄音已完成/);
 }
});
test('repeated empty recognizer sessions stop retrying and report the missing transcript',()=>{
 const a=speechBoot();a.run(`startDictationOnly();speechMocks[0].onend();runTask(350);speechMocks[1].onend();runTask(350);speechMocks[2].onend();runTask(350)`);
 assert.equal(a.run('speechMocks.length'),3);assert.equal(a.run('speechInput'),null);assert.match(a.node('#micStatus').textContent,/尚未辨識到說話/);
});
test('submit waits for the final speech result and saves only one complete answer',async()=>{
 const a=speechBoot();await a.run('startVoiceAnswer()');a.run(`speechMocks[0].onresult(result(['細胞',false]));submitAnswer();submitAnswer()`);
 assert.equal(a.run('state.records.length'),0);
 a.run(`speechMocks[0].onresult(result(['細胞培養與藥物處理',true]));speechMocks[0].onend()`);
 assert.equal(a.run('state.records.length'),1);assert.equal(a.run('state.records[0].answer'),'細胞培養與藥物處理');assert.ok(a.run('currentRecording.size')>0);
});
test('speech stop timeout still saves the visible transcript without accepting late results',()=>{
 const a=speechBoot();a.run(`startDictationOnly();speechMocks[0].onresult(result(['已辨識的回答',false]));submitAnswer();runTask(1800);speechMocks[0].onresult(result(['不應蓋掉',true]))`);
 assert.equal(a.run('state.records.length'),1);assert.equal(a.run('state.records[0].answer'),'已辨識的回答');assert.equal(a.node('#answerText').value,'已辨識的回答');
});
test('manual transcript edits and a new question are not overwritten by an old recognizer',()=>{
 const a=speechBoot();a.run(`startDictationOnly();speechMocks[0].onresult(result(['原句',true]))`);a.node('#answerText').value='手動修正';a.run(`speechInput.onEdit();speechMocks[0].onresult(result(['遲到的結果',true]))`);
 assert.equal(a.node('#answerText').value,'手動修正');
 a.run(`startDictationOnly();nextPracticeQuestion();speechMocks[1].onresult(result(['舊題結果',true]))`);
 assert.notEqual(a.node('#answerText').value,'舊題結果');assert.equal(a.run('speechInput'),null);
});
test('cancelling during microphone permission prevents a late recording from starting',async()=>{
 const a=speechBoot();a.run(`var allowMic; navigator.mediaDevices.getUserMedia=()=>new Promise(resolve=>allowMic=resolve);var starting=startVoiceAnswer();stopAllSpeechInput();allowMic({getTracks:()=>[{stop(){trackStops++}}]})`);
 await a.run('starting');assert.equal(a.run('recorderMocks.length'),0);assert.ok(a.run('trackStops')>0);
});
test('retrying transcription alone releases the recorder and preserves the answer',async()=>{
 const a=speechBoot();await a.run('startVoiceAnswer()');a.run(`speechMocks[0].onresult(result(['先前內容',true]));startDictationOnly();speechMocks[1].onresult(result(['接續內容',true]))`);
 assert.equal(a.run('recorderMocks[0].state'),'inactive');assert.equal(a.node('#answerText').value,'先前內容 接續內容');
});
test('English and formal speech pages have exactly one transcript status and retry control',async()=>{
 const a=boot();await a.run(`showEnglishMode('nthuche')`);
 const check=()=>{for(const id of ['answerText','micStatus','recordingStatus','speechRetryBtn'])assert.equal((a.node('#app').innerHTML.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id)};
 check();assert.match(a.node('#app').innerHTML,/停止錄音與轉文字/);
 a.run(`startFormal('nycuphys');showTimedStage({type:'intro',title:'自我介紹',sec:30})`);check();
 a.run(`showFormalEnglish({type:'english',title:'英文',sec:90})`);check();
});
