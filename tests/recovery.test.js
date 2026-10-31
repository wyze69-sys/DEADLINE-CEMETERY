import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {buildPlan,normalizeAssignment} from '../server/plan.js';
import {buildRecovery,defaultAvailability} from '../server/recovery.js';
import {Store} from '../server/store.js';
import {createApp} from '../server/app.js';
const task=(id,r,extra={})=>({id,title:id,dueDate:'',completed:false,estimatedMinutes:r,remainingMinutes:r,...extra});
const assignment=(id,tasks,deadline='2026-11-03')=>({id,title:id,source:'original',deadline,tasks});
const schedule=(mon=60,tue=60)=>Array.from({length:7},(_,weekday)=>({weekday,minutes:weekday===1?mon:weekday===2?tue:0}));
test('remaining-based daily allocation, explicit splitting and legacy defaults without mutation',()=>{
 const data=[assignment('a',[task('a',40,{estimatedMinutes:120}),task('b',25)])],before=JSON.stringify(data),p=buildPlan(data,'2026-11-02',60);
 assert.equal(p.remainingMinutes,65);assert.equal(p.scheduledMinutes,40);assert.equal(p.freeMinutes,20);assert.equal(JSON.stringify(data),before);
 assert.equal(buildPlan([assignment('a',[task('a',65)])],'2026-11-02',60).scheduledMinutes,0);
 assert.equal(buildPlan([assignment('a',[task('a',65,{splittable:true,sessionMinutes:25})])],'2026-11-02',60).scheduledMinutes,50);
 const legacy=normalizeAssignment(assignment('l',[{id:'l',title:'l',completed:false},{id:'d',completed:true}]));assert.equal(legacy.tasks[0].remainingMinutes,30);assert.equal(legacy.tasks[0].splittable,false);assert.equal(legacy.tasks[1].remainingMinutes,0);
});
test('shared capacity, whole-task fragmentation, deadline prefix, blockers and deterministic purity',()=>{
 const data=[assignment('a',[task('a',90,{splittable:true,sessionMinutes:30})]),assignment('b',[task('b',60,{splittable:true,sessionMinutes:30})])],before=JSON.stringify(data),p=buildRecovery(data,'2026-11-02',2,schedule());
 assert.equal(p.scheduledMinutes,120);assert.ok(p.assessments.some(a=>a.status==='At risk'));assert.ok(p.assessments.some(a=>a.warnings.some(w=>w.includes('not proof of infeasibility'))));assert.deepEqual(buildRecovery(data.toReversed(),'2026-11-02',2,schedule()).days,p.days);assert.equal(JSON.stringify(data),before);
 for(const d of p.days){assert.ok(d.scheduledMinutes<=60);assert.equal(new Set(d.scheduled.map(t=>t.assignmentId+t.id)).size,d.scheduled.length);}
 const whole=buildRecovery([assignment('a',[task('a',90),task('b',30)])],'2026-11-02',2,schedule());assert.equal(whole.scheduledMinutes,30);assert.equal(whole.assessments[0].unallocatedMinutes,90);
 const prefix=buildRecovery([assignment('a',[task('a',60)],'2026-11-02')],'2026-11-02',2,schedule(0,120));assert.equal(prefix.scheduledMinutes,60);assert.equal(prefix.assessments[0].status,'Does not fit');
 const blocked=buildRecovery([assignment('a',[task('a',60,{blocked:true,blockedReason:'help'}),task('b',60)])],'2026-11-02',2,schedule());assert.equal(blocked.assessments[0].blockedMinutes,60);assert.equal(blocked.scheduledMinutes,60);
});
test('unknown differs from known zero; overdue, unconfirmed, horizon and UTC dates stay honest',()=>{
 const a=assignment('a',[task('a',30)]);
 const unknown=buildRecovery([a],'2026-11-02',2);assert.equal(unknown.assessments[0].status,'Needs information');assert.equal(unknown.days[0].availabilityKnown,false);
 assert.equal(buildRecovery([a],'2026-11-02',2,schedule(0,0)).assessments[0].status,'Does not fit');
 assert.equal(buildRecovery([assignment('a',[task('a',30)],'2026-11-01')],'2026-11-02',2,schedule()).assessments[0].overdue,true);
 const far=buildRecovery([assignment('a',[task('a',30)],'2026-12-02')],'2026-11-02',30,schedule());assert.equal(far.end,'2026-12-01');assert.equal(far.days.length,30);assert.equal(far.assessments[0].outOfHorizon,true);assert.equal(far.assessments[0].status,'Needs information');
 assert.equal(buildRecovery([assignment('a',[task('a',30)],'')],'2026-11-02',2,schedule()).assessments[0].status,'Needs information');
 for(const tz of ['UTC','Asia/Bangkok','America/Los_Angeles']){process.env.TZ=tz;const p=buildRecovery([a],'2026-12-31',2,schedule());assert.equal(p.end,'2027-01-01');assert.equal(buildRecovery([a],'2028-02-28',2,schedule()).end,'2028-02-29');}
});
test('blocked work keeps its capacity demand without being scheduled',()=>{
 const assess=(blockedMinutes)=>buildRecovery([assignment('a',[
  task('blocked',blockedMinutes,{blocked:true,blockedReason:'waiting',splittable:true,sessionMinutes:10}),
  task('free',30)
 ])],'2026-11-02',2,schedule(60,60));
 for(const [minutes,shortage] of [[100,true],[60,false]]){
  const result=assess(minutes),assessment=result.assessments[0];
  assert.equal(assessment.status,'Does not fit');
  assert.equal(assessment.remainingMinutes,minutes+30);
  assert.equal(result.scheduledMinutes,30);
  assert.ok(result.days.every(d=>d.scheduled.every(t=>t.id!=='blocked')));
  assert.ok(assessment.warnings.some(w=>w.includes('Blocked work')));
  assert.equal(assessment.warnings.some(w=>w.includes('insufficient minutes')),shortage);
 }
});
test('real HTTP sessions validation, retry concurrency, stale replay, state transitions and persistence',async()=>{
 await mkdir(resolve('test-results'),{recursive:true});const dir=await mkdtemp(resolve('test-results/recovery-')),file=join(dir,'data.json');await writeFile(file,JSON.stringify({version:1,assignments:[assignment('a',[task('t',80,{estimatedMinutes:120})])]}));
 const server=createApp(new Store(file)).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const req=async(path,method='GET',body)=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/api${path}`,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json()};};
 const path='/assignments/a/tasks/t',session=path+'/sessions',entry={requestId:'request-1',minutes:25,outcome:'continue',remainingMinutes:90,note:'Draft'};
 try{
  const raw=await readFile(file,'utf8');assert.equal((await req('/availability')).body[0].minutes,null);
  for(const body of [{...entry,remainingMinutes:undefined},{...entry,minutes:4},{...entry,minutes:25.5},{...entry,remainingMinutes:null},{...entry,outcome:'blocked',blockedReason:' '},{...entry,createdAt:'fake'}])assert.equal((await req(session,'POST',body)).status,400);
  assert.equal(await readFile(file,'utf8'),raw);
  const [one,two]=await Promise.all([req(session,'POST',entry),req(session,'POST',entry)]);assert.equal(one.status,200);assert.equal(two.body.session.id,one.body.session.id);assert.equal((await new Store(file).read()).assignments[0].tasks[0].sessions.length,1);
  assert.equal((await req(session,'POST',{...entry,remainingMinutes:54})).status,409);
  await req(session,'POST',{...entry,requestId:'request-2',remainingMinutes:35});const replay=await req(session,'POST',entry);assert.equal(replay.body.task.remainingMinutes,35);
  let patch=await req(path,'PATCH',{title:'changed'});assert.equal(patch.body.sessions.length,2);assert.equal(patch.body.estimatedMinutes,120);
  await req(session,'POST',{...entry,requestId:'request-3',outcome:'blocked',blockedReason:'feedback',remainingMinutes:40});assert.equal((await req('/plan?date=2026-11-02&minutes=120')).body.blocked.length,1);
  await req(session,'POST',{...entry,requestId:'request-4',remainingMinutes:20});assert.equal((await req('/assignments')).body[0].tasks[0].blocked,false);
  await req(session,'POST',{...entry,requestId:'request-5',outcome:'finished',remainingMinutes:0});let t=(await req('/assignments')).body[0].tasks[0];assert.equal(t.completed,true);assert.equal(t.remainingMinutes,0);
  assert.equal((await req(path,'PATCH',{completed:false})).body.remainingMinutes,120);
  await req(path,'PATCH',{completed:true});assert.equal((await req(path,'PATCH',{completed:false,remainingMinutes:45})).body.remainingMinutes,45);
  for(const body of [{remainingMinutes:0},{remainingMinutes:null},{splittable:null},{splittable:'yes'},{sessionMinutes:4},{sessionMinutes:181}])assert.equal((await req(path,'PATCH',body)).status,400);
  const zero=schedule(0,0);assert.equal((await req('/availability','PUT',zero)).status,200);assert.deepEqual((await new Store(file).read()).availability,zero);
  const before=await readFile(file,'utf8');assert.equal((await req('/availability','PUT',[...zero.slice(0,6),zero[0]])).status,400);await req('/recovery?date=2026-11-02&horizon=30');await req('/plan?date=2026-11-02&minutes=60');assert.equal(await readFile(file,'utf8'),before);
  for(const q of ['?date=2027-02-29&horizon=2','?date=2026-11-02&horizon=31','?date=2026-11-02&horizon=0','?date=2026-11-02&horizon=2&x=1','?date=2026-11-02&horizon=2&horizon=3'])assert.equal((await req('/recovery'+q)).status,400);
  const beforeFinish=await readFile(file,'utf8');
  assert.equal((await req('/assignments/a','PATCH',{submitted:true,confirmUnfinished:true,deadline:'2026-02-30'})).status,400);assert.equal(await readFile(file,'utf8'),beforeFinish);
  const concurrent=await Promise.all([req(session,'POST',{...entry,requestId:'distinct-1',remainingMinutes:31}),req(session,'POST',{...entry,requestId:'distinct-2',remainingMinutes:29})]);assert.ok(concurrent.every(r=>r.status===200));assert.equal((await new Store(file).read()).assignments[0].tasks[0].sessions.length,7);
  for(let i=0;i<100;i++)assert.equal((await req(session,'POST',{...entry,requestId:`bounded-${i}`,remainingMinutes:29})).status,200);
  const bounded=(await new Store(file).read()).assignments[0].tasks[0];assert.equal(bounded.sessions.length,100);assert.equal(bounded.sessions[0].requestId,'bounded-0');assert.equal(bounded.remainingMinutes,29);
 }finally{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
});
