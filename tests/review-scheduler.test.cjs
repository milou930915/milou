const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../app/index.html'),'utf8');
const code=html.split('// REVIEW_ENGINE_START')[1].split('// REVIEW_ENGINE_END')[0];
const S=vm.runInNewContext(code+';ReviewScheduler');
const now=Date.parse('2026-10-12T03:00:00Z'),D=S.DAY;
const qs=[{id:'a',domain:'thermo'},{id:'av',variantOf:'a',domain:'thermo'},{id:'b',domain:'thermo'},{id:'c',domain:'biochem'}];
const rec=(id,qid,grade,ago=0,extra={})=>({id,qid,grade,time:new Date(now-ago).toISOString(),confidence:'高',hintUsed:false,...extra});
const info=(records,q=qs[0])=>S.info(q,S.index(qs,records,now));
test('new questions have no invented mastery',()=>assert.equal(info([]).level,'new'));
test('unknown schedules a ten-minute cooling period',()=>{const p=info([rec('1','a','g1')]);assert.equal(p.level,'wrong');assert.equal(p.due,now+600000);});
test('partial and mostly correct use one and three days',()=>{assert.equal(info([rec('1','a','g3')]).due,now+D);assert.equal(info([rec('1','a','g4')]).due,now+3*D);});
test('one high score is not automatically fully mastered',()=>assert.equal(info([rec('1','a','g5')]).level,'familiar'));
test('same-day repetition cannot manufacture mastery',()=>assert.equal(info([rec('1','a','g5',60000),rec('2','av','g5')]).level,'familiar'));
test('legacy scores without hint history do not establish automatic mastery',()=>assert.equal(info([rec('1','a','g5',2*D,{hintUsed:undefined}),rec('2','av','g5',0,{hintUsed:undefined})]).level,'familiar'));
test('independent complete answers on different days establish mastery',()=>{const p=info([rec('1','a','g5',2*D),rec('2','av','g5')]);assert.equal(p.level,'mastered');assert.equal(p.due,now+14*D);});
test('hinted or guided answers do not establish mastery',()=>{for(const flag of ['guided','hintUsed'])assert.equal(info([rec('1','a','g5',2*D),rec('2','a','g5',0,{[flag]:true})]).level,'familiar');});
test('low-confidence complete answer stays pending',()=>assert.equal(info([rec('1','a','g5',0,{confidence:'低'})]).level,'pending'));
test('explicit mastery overrides conservative automatic grading',()=>{const p=info([rec('1','a','g1',D,{unknown:true,mastery:'mastered',masteryAt:now})]);assert.equal(p.level,'mastered');assert.equal(p.due,now+14*D);});
test('mastered intervals grow to 30 and then 60 days',()=>{const rows=[rec('1','a','g5',50*D,{mastery:'mastered'}),rec('2','av','g5',30*D),rec('3','a','g5')];assert.equal(info(rows).intervalDays,60);});
test('a relapse resets the mastered interval',()=>{const p=info([rec('1','a','g5',20*D,{mastery:'mastered'}),rec('2','av','g1')]);assert.equal(p.level,'wrong');assert.equal(p.due,now+600000);});
test('latest answer wins over an older wrong answer in any record order',()=>{const a=rec('old','a','g1',D),b=rec('new','av','g4');assert.equal(info([b,a]).level,'familiar');assert.equal(info([a,b]).latest.id,'new');});
test('variants share mastery across schools',()=>{const p=info([rec('1','a','g5',0,{mastery:'mastered',school:'ntuche'})],qs[1]);assert.equal(p.level,'mastered');assert.equal(p.key,'a');});
test('mastered concepts and all their variants are withheld before due',()=>{const idx=S.index(qs,[rec('1','a','g5',0,{mastery:'mastered'})],now);for(let i=0;i<100;i++)assert.equal(S.pickQuestion(qs.slice(0,3),idx).id,'b');assert.equal(S.pickQuestion(qs.slice(0,2),idx),null);});
test('recent concepts exclude variants when other questions are available',()=>assert.equal(S.pickQuestion(qs.slice(0,3),S.index(qs,[],now),{recent:['a']}).id,'b'));
test('formal exam never repeats the same concept',()=>assert.equal(S.pickQuestion(qs.slice(0,2),S.index(qs,[],now),{formal:true,asked:['a']}),null));
test('explicit review can practice before the scheduled date',()=>{const idx=S.index(qs,[rec('1','a','g1')],now);assert.equal(S.pickQuestion([qs[0]],idx),null);assert.equal(S.pickQuestion([qs[0]],idx,{explicit:true}).id,'a');});
test('selector never escapes its school/subject-filtered pool',()=>{const idx=S.index(qs,[rec('1','c','g1',D)],now);for(let i=0;i<100;i++)assert.equal(S.pickQuestion([qs[2]],idx).id,'b');});
test('due mastered checks occupy about five percent with new alternatives',()=>{
 let seed=42;const rng=()=>((seed=(Math.imul(1664525,seed)+1013904223)>>>0)/2**32);
 const idx=S.index(qs,[rec('1','a','g5',20*D,{mastery:'mastered'})],now);let count=0;
 for(let i=0;i<10000;i++)if(S.pickQuestion([qs[0],qs[2]],idx,{rng}).id==='a')count++;
 assert.ok(count>350&&count<650,`mastered count ${count}`);
});
test('due weaknesses get priority while new questions still appear',()=>{
 let seed=17;const rng=()=>((seed=(Math.imul(1664525,seed)+1013904223)>>>0)/2**32);
 const idx=S.index(qs,[rec('1','a','g1',D)],now);let count=0;
 for(let i=0;i<10000;i++)if(S.pickQuestion([qs[0],qs[2]],idx,{rng}).id==='a')count++;
 assert.ok(count>6000&&count<7000,`weak count ${count}`);
});
test('sync sorts ISO dates newest first and keeps both devices answers',()=>{
 const result=S.mergeRecords([rec('old','a','g1',D)],[rec('new','b','g4')]);assert.equal(result[0].id,'new');assert.equal(result.length,2);
});
test('stale cloud copy cannot undo a manual mastery decision',()=>{
 const old=rec('1','a','g1',D),local={...old,mastery:'mastered',masteryAt:now,assessmentAt:now,updatedAt:now,disputed:false};
 assert.equal(S.mergeRecords([local],[old])[0].mastery,'mastered');assert.equal(S.mergeRecords([old],[local])[0].mastery,'mastered');
});
test('favorite and mastery updates on separate devices both survive',()=>{
 const old=rec('1','a','g1',D),a={...old,mastery:'mastered',masteryAt:now-1000,assessmentAt:now-1000,updatedAt:now-1000},b={...old,favorite:true,favoriteAt:now,updatedAt:now};
 for(const [x,y] of [[a,b],[b,a]]){const merged=S.mergeRecords([x],[y])[0];assert.equal(merged.mastery,'mastered');assert.equal(merged.favorite,true);}
});
test('a newer dispute survives an older mastery decision',()=>{
 const old=rec('1','a','g5',D),a={...old,mastery:'mastered',assessmentAt:now-1000},b={...old,disputed:true,assessmentAt:now};
 const merged=S.mergeRecords([a],[b])[0];assert.equal(S.classify(merged),'pending');
});
