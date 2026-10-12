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
