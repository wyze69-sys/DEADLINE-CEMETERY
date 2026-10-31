import {buildPlan,normalizeAssignment} from './plan.js';
export const defaultAvailability=()=>Array.from({length:7},(_,weekday)=>({weekday,minutes:null}));
const addDay=(date,n)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
export function buildRecovery(records,date,horizon,availability=defaultAvailability()) {
 const pending=records.map(normalizeAssignment),days=[];
 const original=buildPlan(records,date,480),tasks=[...original.scheduled,...original.cannotFit,...original.blocked];
 for(let n=0;n<horizon;n++){
  const day=addDay(date,n),weekday=new Date(day+'T12:00:00Z').getUTCDay(),capacity=availability.find(d=>d.weekday===weekday)?.minutes??0;
  const p=buildPlan(pending,day,capacity);days.push({...p,date:day,availabilityKnown:Number.isInteger(availability.find(d=>d.weekday===weekday)?.minutes)});
  for(const s of p.scheduled){const t=pending.find(a=>a.id===s.assignmentId).tasks.find(t=>t.id===s.id);t.remainingMinutes-=s.scheduledMinutes;if(!t.remainingMinutes)t.completed=true;}
 }
 const end=days.at(-1).date;
 const assessments=records.map(normalizeAssignment).filter(a=>!a.submittedAt).map(a=>{
  const own=tasks.filter(t=>t.assignmentId===a.id),warnings=[];
  if(!a.deadline)warnings.push('No confirmed assignment submission deadline.');
  if(own.some(t=>t.estimateAssumed))warnings.push('Some work uses the assumed 30-minute estimate.');
  if(own.some(t=>!t.effectiveDeadline))warnings.push('Some task dates are unconfirmed.');
  if(own.some(t=>t.deadlineSource==='task'))warnings.push('Task dates are planned dates, not confirmation of submission.');
  const outOfHorizon=!!a.deadline&&a.deadline>end;
  const overdue=own.some(t=>t.effectiveDeadline&&t.effectiveDeadline<date)||!!a.deadline&&a.deadline<date;
  const blockedMinutes=own.filter(t=>t.blocked).reduce((n,t)=>n+t.remainingMinutes,0);
  const unallocatedMinutes=pending.find(x=>x.id===a.id).tasks.filter(t=>!t.completed).reduce((n,t)=>n+t.remainingMinutes,0);
  const late=own.some(t=>{const deadline=a.deadline&&t.effectiveDeadline?(a.deadline<t.effectiveDeadline?a.deadline:t.effectiveDeadline):a.deadline||t.effectiveDeadline;return deadline&&days.filter(d=>d.date<=deadline).flatMap(d=>d.scheduled).filter(s=>s.assignmentId===a.id&&s.id===t.id).reduce((n,s)=>n+s.scheduledMinutes,0)<t.remainingMinutes;});
  // Unknown weekdays matter only when they can affect this assignment's pending work.
  const lastRelevant=own.reduce((latest,t)=>t.effectiveDeadline>latest?t.effectiveDeadline:latest,'');
  const relevant=days.filter(d=>d.date<=(lastRelevant||a.deadline||end));
  const unknownAvailability=own.length>0&&relevant.some(d=>!d.availabilityKnown);
  if(unknownAvailability)warnings.push('Availability before this work is due is unconfigured; enter those weekdays before assessing fit.');
  // A greedy miss is not an infeasibility proof. Only use independent necessary
  // capacity constraints (even granting this assignment the entire pool).
  const deadlines=[...new Set(own.map(t=>t.effectiveDeadline).filter(Boolean))];
  const capacityFailure=deadlines.some(deadline=>{
   const eligible=days.filter(d=>d.date<=deadline),due=own.filter(t=>t.effectiveDeadline&&t.effectiveDeadline<=deadline);
   if(deadline>end||eligible.some(d=>!d.availabilityKnown))return false;
   return due.reduce((n,t)=>n+t.remainingMinutes,0)>eligible.reduce((n,d)=>n+d.budgetMinutes,0)||due.some(t=>!t.splittable&&!eligible.some(d=>d.budgetMinutes>=t.remainingMinutes));
  });
  const missed=!!(blockedMinutes||late||unallocatedMinutes);
  if(capacityFailure)warnings.push('Current availability cannot cover this assignment by its target dates, even without competing assignments (insufficient minutes or no whole-task slot).');
  if(missed&&!capacityFailure&&!blockedMinutes)warnings.push('Not scheduled by the current greedy plan before its target dates; a different ordering may fit. This is not proof of infeasibility.');
  if(blockedMinutes)warnings.push('Blocked work cannot be scheduled until its blocker is resolved.');
  const status=unknownAvailability||!a.deadline||outOfHorizon?'Needs information':overdue?'At risk':blockedMinutes||capacityFailure?'Does not fit':missed||warnings.length?'At risk':'Fits';
  if(outOfHorizon)warnings.push('Submission deadline is outside this planning horizon; fit is not assessed.');
  if(overdue)warnings.push('Overdue: request an extension or confirm a recovery arrangement; official dates are unchanged.');
  return {assignmentId:a.id,title:a.title,status,remainingMinutes:own.reduce((n,t)=>n+t.remainingMinutes,0),blockedMinutes,unallocatedMinutes,outOfHorizon,overdue,warnings};
 });
 return {date,horizon,end,availability,days,assessments,overdue:tasks.filter(t=>t.effectiveDeadline&&t.effectiveDeadline<date),blocked:original.blocked,remainingMinutes:original.remainingMinutes,scheduledMinutes:days.reduce((n,d)=>n+d.scheduledMinutes,0)};
}
