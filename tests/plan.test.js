import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPlan,normalizeAssignment} from '../server/plan.js';
import {createApp} from '../server/app.js';
import {Store} from '../server/store.js';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
const t=(id,extra={})=>({id,title:id,dueDate:'',completed:false,...extra});
const a=(id,tasks,extra={})=>({id,title:id,source:'Original',tasks,...extra});
test('legacy defaults are read-only; inheritance and explicit task date precedence',()=>{
 const legacy=a('a',[t('blank'),t('explicit',{dueDate:'2026-11-01'})],{deadline:'2026-11-03'});
 const normalized=normalizeAssignment(legacy);assert.equal(normalized.importance,'normal');assert.equal(normalized.tasks[0].estimatedMinutes,30);assert.equal(legacy.tasks[0].estimatedMinutes,undefined);
 const p=buildPlan([legacy],'2026-11-02',120);assert.deepEqual(p.scheduled.map(t=>t.id),['explicit','blank']);assert.equal(p.scheduled[0].deadlineSource,'task');assert.equal(p.scheduled[1].deadlineSource,'assignment');assert.equal(p.scheduled[1].effectiveDeadline,'2026-11-03');assert.equal(p.remainingMinutes,60);
});
test('rank is overdue, today, nearest date, importance, stable ID, then undated',()=>{
 const data=[a('low',[t('low')],{deadline:'2026-11-02',importance:'low'}),a('high',[t('z'),t('a')],{deadline:'2026-11-02',importance:'high'}),a('today',[t('today')],{deadline:'2026-11-01'}),a('old',[t('old')],{deadline:'2026-10-01'}),a('none',[t('none')])];
 const ids=x=>buildPlan(x,'2026-11-01',480).scheduled.map(t=>t.id);
 assert.deepEqual(ids(data),['old','today','a','z','low','none']);assert.deepEqual(ids(data.toReversed()),ids(data));
});
test('whole-task greedy capacity: skip oversized, no splitting, blocked and submitted excluded',()=>{
 const p=buildPlan([a('active',[t('large',{dueDate:'2026-01-01',estimatedMinutes:90}),t('small',{estimatedMinutes:25}),t('block',{dueDate:'2026-01-01',blocked:true,blockedReason:'Await feedback',estimatedMinutes:40}),t('done',{completed:true})]),a('submitted',[t('archived')],{submittedAt:'2026-01-01T00:00:00.000Z'})],'2026-11-01',60);
 assert.deepEqual(p.scheduled.map(t=>t.id),['small']);assert.deepEqual(p.cannotFit.map(t=>t.id),['large']);assert.equal(p.scheduledMinutes,25);assert.equal(p.freeMinutes,35);assert.equal(p.remainingMinutes,155);assert.equal(p.blocked[0].blockedReason,'Await feedback');assert.equal(p.undated[0].id,'small');assert.equal(p.capacityWarning,true);assert.equal(p.dueMinutes,130);
 assert.equal(buildPlan([],'2026-11-01',120).remainingMinutes,0);
});
test('real HTTP metadata, validation, server-owned submission, legacy persistence and strict plan query',async()=>{
 const dir=await mkdtemp(resolve('test-results/planner-')),file=join(dir,'data.json');const legacy=a('legacy',[t('legacy-task')]);await writeFile(file,JSON.stringify({version:1,assignments:[legacy]}));
 const server=createApp(new Store(file)).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const req=async(path,method='GET',body)=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/api`+path,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json()};};
 try{
 assert.equal((await req('/assignments')).body[0].tasks[0].estimatedMinutes,30);assert.equal((await new Store(file).read()).assignments[0].tasks[0].estimatedMinutes,undefined);
 for(const query of ['','?date=2026-02-30&minutes=120','?date=2026-11-01&minutes=481','?date=2026-11-01&minutes=1.5','?date=2026-11-01&minutes=-2','?date=2026-11-01&minutes=30&minutes=40','?date=2026-11-01&minutes=120&extra=x'])assert.equal((await req('/plan'+query)).status,400,query);
 for(const body of [{deadline:null},{course:null},{importance:null},{deadline:'2026-02-30'},{importance:'urgent'},{course:23},{instructions:'x'.repeat(4001)},{submissionLink:'javascript:alert(1)'},{submissionLink:'file:///data'},{submitted:'yes'},{submittedAt:'fake'}])assert.equal((await req('/assignments/legacy','PATCH',body)).status,400,JSON.stringify(body));
 for(const body of [{estimatedMinutes:null},{blocked:null},{blockedReason:null},{estimatedMinutes:4},{estimatedMinutes:1441},{estimatedMinutes:5.5},{estimatedMinutes:'30'},{blocked:true},{blocked:'yes'},{blocked:true,blockedReason:'   '},{blockedReason:42}])assert.equal((await req('/assignments/legacy/tasks/legacy-task','PATCH',body)).status,400,JSON.stringify(body));
 assert.equal((await req('/assignments/legacy','PATCH',{course:'History',deadline:'2026-11-02',importance:'high',instructions:'Upload PDF',submissionLink:'https://example.com/submit'})).status,200);
 assert.equal((await req('/plan?date=2026-11-01&minutes=120')).body.scheduled[0].deadlineSource,'assignment');
 assert.equal((await req('/assignments/legacy','PATCH',{submitted:true})).status,400);
 const submitted=await req('/assignments/legacy','PATCH',{submitted:true,confirmUnfinished:true});assert.equal(submitted.status,200);assert.equal(new Date(submitted.body.submittedAt).toISOString(),submitted.body.submittedAt);assert.equal(submitted.body.tasks.length,1);
 assert.equal((await req('/plan?date=2026-11-01&minutes=120')).body.remainingMinutes,0);
 assert.equal((await new Store(file).read()).assignments[0].submittedAt,submitted.body.submittedAt);
 await req('/assignments/legacy','PATCH',{submitted:false});assert.equal((await req('/plan?date=2026-11-01&minutes=120')).body.remainingMinutes,30);
 await req('/assignments/legacy/tasks/legacy-task','PATCH',{completed:true});assert.equal((await req('/assignments')).body[0].submittedAt,null);
 }finally{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
});
