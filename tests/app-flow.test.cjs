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
