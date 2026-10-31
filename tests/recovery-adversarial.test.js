import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {buildPlan} from '../server/plan.js';
import {buildRecovery} from '../server/recovery.js';
import {Store} from '../server/store.js';
import {createApp} from '../server/app.js';
const t=(id,r,extra={})=>({id,title:id,completed:false,dueDate:'',estimatedMinutes:r,remainingMinutes:r,...extra});
const a=(id,tasks,deadline='2026-11-03')=>({id,title:id,source:'original',tasks,deadline});
const week=(mon,tue)=>Array.from({length:7},(_,weekday)=>({weekday,minutes:weekday===1?mon:weekday===2?tue:null}));
test('splittable finishing remainder uses all available time, but partial days retain preferred minimum',()=>{
 const record=a('a',[t('t',40,{splittable:true,sessionMinutes:25})]);
 const finish=buildPlan([record],'2026-11-02',40);
 assert.deepEqual(finish.scheduled[0].sessionsPlanned,[25,15]);assert.equal(finish.freeMinutes,0);
 assert.equal(buildPlan([record],'2026-11-02',39).scheduledMinutes,25);
 assert.equal(buildPlan([record],'2026-11-02',24).scheduledMinutes,0);
 const forecast=buildRecovery([record],'2026-11-02',2,week(25,15));
 assert.equal(forecast.scheduledMinutes,40);assert.equal(forecast.assessments[0].status,'Fits');
});
test('earliest task target or actual submission deadline controls sort and truthful source',()=>{
 const records=[a('earlier',[t('t1',30,{dueDate:'2026-11-10'})],'2026-11-02'),a('later',[t('t2',30)],'2026-11-03')];
 const p=buildPlan(records,'2026-11-02',30);
 assert.equal(p.scheduled[0].assignmentId,'earlier');assert.equal(p.scheduled[0].effectiveDeadline,'2026-11-02');assert.equal(p.scheduled[0].deadlineSource,'assignment');assert.equal(p.dueMinutes,30);
 const early=buildPlan([a('a',[t('t',30,{dueDate:'2026-11-01'})])],'2026-11-02',30).scheduled[0];
 assert.equal(early.effectiveDeadline,'2026-11-01');assert.equal(early.deadlineSource,'task');
 const tied=buildPlan([a('a',[t('t',30,{dueDate:'2026-11-03'})])],'2026-11-02',30).scheduled[0];assert.equal(tied.deadlineSource,'assignment');
});
test('a feasible alternative ordering is not falsely declared impossible by greedy recovery',()=>{
 // Greedy puts 30 on Monday, stranding the 60-minute whole task; reverse ordering fits both.
 const records=[a('a',[t('a',30)]),a('b',[t('b',60)])];
 const p=buildRecovery(records,'2026-11-02',2,week(60,30));
 assert.equal(p.scheduledMinutes,30);const missed=p.assessments.find(x=>x.assignmentId==='b');
 assert.equal(missed.status,'At risk');assert.ok(missed.warnings.some(w=>w.includes('Not scheduled by the current greedy plan')));
 const feasible=buildRecovery([a('a',[t('z',30)]),a('b',[t('a',60)])],'2026-11-02',2,week(60,30));assert.equal(feasible.scheduledMinutes,90);
 // Independent capacity proofs still support the existing stronger status.
 assert.equal(buildRecovery([a('a',[t('a',100)])],'2026-11-02',2,week(60,60)).assessments[0].status,'Does not fit');
});
test('availability uncertainty is scoped to relevant pending dates; completed blockers are not active',()=>{
 const monday=a('a',[t('t',30)],'2026-11-02');
 assert.equal(buildRecovery([monday],'2026-11-02',2,week(30,null)).assessments[0].status,'Fits');
 assert.equal(buildRecovery([monday],'2026-11-02',2,[]).days[0].availabilityKnown,false);
 assert.equal(buildRecovery([monday],'2026-11-02',2,[]).assessments[0].status,'Needs information');
 const done=buildRecovery([a('a',[t('t',30,{completed:true,blocked:true,blockedReason:'stale'})])],'2026-11-02',2,week(null,null));
 assert.equal(done.assessments[0].blockedMinutes,0);assert.equal(done.assessments[0].status,'Fits');
});
test('Store mutation-then-throw does not leak changes and the serialized queue remains usable',async()=>{
 await mkdir(resolve('test-results'),{recursive:true});const dir=await mkdtemp(resolve('test-results/atomic-')),file=join(dir,'data.json');
 const initial={version:1,assignments:[a('a',[t('t',30)])]};await writeFile(file,JSON.stringify(initial));const store=new Store(file),raw=await readFile(file,'utf8');
 try{
  await assert.rejects(store.update(data=>{data.assignments[0].submittedAt='must-not-persist';data.assignments[0].tasks[0].remainingMinutes=1;throw Error('abort');}),/abort/);
  assert.equal(await readFile(file,'utf8'),raw);assert.deepEqual(await new Store(file).read(),initial);
  await store.update(data=>{data.assignments[0].tasks[0].remainingMinutes=25;});assert.equal((await new Store(file).read()).assignments[0].tasks[0].remainingMinutes,25);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('HTTP estimate provenance is strict, preserved on unrelated edits, confirmed by sessions; failures are atomic',async()=>{
 await mkdir(resolve('test-results'),{recursive:true});const dir=await mkdtemp(resolve('test-results/adversarial-')),file=join(dir,'data.json');
 await writeFile(file,JSON.stringify({version:1,assignments:[a('a',[t('t',30,{estimateAssumed:true})])]}));
 const server=createApp(new Store(file)).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const req=async(path,method,body)=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/api${path}`,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
 const path='/assignments/a/tasks/t';
 try{
  const before=await readFile(file,'utf8');for(const estimateAssumed of [null,1,'false',{},[]])assert.equal((await req(path,'PATCH',{estimateAssumed})).status,400);
  assert.equal(await readFile(file,'utf8'),before);
  assert.equal((await req(path,'PATCH',{title:'renamed'})).body.estimateAssumed,true);
  assert.equal((await req(path,'PATCH',{remainingMinutes:35})).body.estimateAssumed,false);
  await req(path,'PATCH',{estimateAssumed:true});
  const session=await req(path+'/sessions','POST',{requestId:'confirm',minutes:25,outcome:'continue',remainingMinutes:20});assert.equal(session.body.task.estimateAssumed,false);
  assert.equal((await new Store(file).read()).assignments[0].tasks[0].estimateAssumed,false);
  await req(path,'PATCH',{blocked:true,blockedReason:'feedback'});const completed=await req(path,'PATCH',{completed:true});assert.equal(completed.body.blocked,false);assert.equal(completed.body.blockedReason,'');
  const raw=await readFile(file,'utf8');assert.equal((await req('/assignments/a','PATCH',{submitted:true,importance:'invalid'})).status,400);assert.equal(await readFile(file,'utf8'),raw);
  assert.equal((await req(path,'PATCH',{completed:false,remainingMinutes:45})).status,200);assert.equal((await new Store(file).read()).assignments[0].tasks[0].remainingMinutes,45);
 }finally{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
});
