import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPlan} from '../server/plan.js';
import {buildRecovery} from '../server/recovery.js';

// A deterministic corpus checks constraints independently of hand-picked examples.
test('daily and recovery allocations conserve shared time and never mutate source work',()=>{
 let state=20261031;
 const next=max=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state%max;};
 for(let sample=0;sample<80;sample++){
  const records=Array.from({length:4},(_,a)=>({
   id:`a${a}`,title:`Assignment ${a}`,deadline:`2026-11-${String(2+next(7)).padStart(2,'0')}`,
   importance:['low','normal','high'][next(3)],submittedAt:a===3&&sample%3===0?'2026-11-01T00:00:00Z':null,
   tasks:Array.from({length:5},(_,i)=>({id:`t${a}-${i}`,title:`Task ${i}`,estimatedMinutes:5+next(120),remainingMinutes:1+next(180),completed:next(7)===0,blocked:next(5)===0,blockedReason:'Waiting for review',dueDate:'',splittable:next(2)===0,sessionMinutes:5+next(30)}))
  }));
  const snapshot=JSON.stringify(records),budget=5+next(476);
  const plan=buildPlan(records,'2026-11-02',budget);
  const seen=new Set();
  for(const task of plan.scheduled){
   const key=task.assignmentId+'/'+task.id;
   assert.ok(!seen.has(key));seen.add(key);
   assert.ok(!task.blocked&&!task.completed);
   assert.ok(task.scheduledMinutes>0&&task.scheduledMinutes<=task.remainingMinutes);
   assert.equal(task.sessionsPlanned.reduce((sum,n)=>sum+n,0),task.scheduledMinutes);
   if(!task.splittable)assert.equal(task.scheduledMinutes,task.remainingMinutes);
  }
  assert.equal(plan.scheduled.reduce((sum,t)=>sum+t.scheduledMinutes,0)+plan.freeMinutes,budget);
  const week=Array.from({length:7},(_,weekday)=>({weekday,minutes:next(181)}));
  const recovery=buildRecovery(records,'2026-11-02',14,week),totals=new Map();
  for(const day of recovery.days){
   assert.ok(day.scheduledMinutes<=day.budgetMinutes);
   assert.equal(day.scheduled.reduce((sum,t)=>sum+t.scheduledMinutes,0),day.scheduledMinutes);
   for(const t of day.scheduled){const key=t.assignmentId+'/'+t.id;totals.set(key,(totals.get(key)||0)+t.scheduledMinutes);}
  }
  for(const a of records)for(const t of a.tasks){
   const allocated=totals.get(a.id+'/'+t.id)||0;
   assert.ok(allocated<=t.remainingMinutes);
   if(a.submittedAt||t.completed||t.blocked)assert.equal(allocated,0);
  }
  assert.equal(JSON.stringify(records),snapshot);
  assert.deepEqual(buildRecovery(records,'2026-11-02',14,week),recovery);
 }
});
