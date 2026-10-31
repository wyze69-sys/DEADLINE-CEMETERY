// Read-time defaults preserve legacy files without a destructive migration.
export function normalizeTask(t) {const estimatedMinutes=t.estimatedMinutes??30;return {...t,estimatedMinutes,estimateAssumed:t.estimateAssumed??(t.estimatedMinutes===undefined),remainingMinutes:t.completed?0:(t.remainingMinutes??estimatedMinutes),splittable:t.splittable??false,sessionMinutes:t.sessionMinutes??25,blocked:t.blocked??false,blockedReason:t.blockedReason??'',sessions:t.sessions??[]};}
export function allocation(t,free) {
  // A finishing session may be shorter than the preferred session length.
  if(t.remainingMinutes<=free)return t.remainingMinutes;
  if(!t.splittable)return 0;
  return Math.floor(free/t.sessionMinutes)*t.sessionMinutes;
}
export function taskDeadline(t,a) {
  const planned=t.dueDate||'',hard=a.deadline||'';
  // A planning target may tighten, but never extend, the submission deadline.
  const effectiveDeadline=planned&&hard?(planned<hard?planned:hard):planned||hard;
  return {effectiveDeadline,deadlineSource:hard&&(!planned||hard<=planned)?'assignment':planned?'task':'none'};
}
export function normalizeAssignment(a) {
  return {...a,course:a.course??'',deadline:a.deadline??'',importance:a.importance??'normal',instructions:a.instructions??'',submissionLink:a.submissionLink??'',submittedAt:a.submittedAt??null,
    tasks:a.tasks.map(normalizeTask)};
}
const importance={high:0,normal:1,low:2};
export function buildPlan(records,date,minutes) {
  const tasks=records.map(normalizeAssignment).filter(a=>!a.submittedAt).flatMap(a=>a.tasks.filter(t=>!t.completed).map(t=>({...t,assignmentId:a.id,assignmentTitle:a.title,course:a.course,title:t.title,estimatedMinutes:t.estimatedMinutes,blocked:t.blocked,blockedReason:t.blockedReason,importance:a.importance,...taskDeadline(t,a)})));
  const compare=(a,b)=>(a.effectiveDeadline||'9999-99-99').localeCompare(b.effectiveDeadline||'9999-99-99')||importance[a.importance]-importance[b.importance]||a.id.localeCompare(b.id)||a.assignmentId.localeCompare(b.assignmentId);
  const why=t=>t.effectiveDeadline?(t.effectiveDeadline<date?'Overdue':t.effectiveDeadline===date?'Due today':'Nearest deadline')+` · ${t.importance} importance`:'No confirmed date · '+t.importance+' importance';
  const blocked=tasks.filter(t=>t.blocked).sort(compare),undated=tasks.filter(t=>!t.blocked&&!t.effectiveDeadline).sort(compare);
  const candidates=tasks.filter(t=>!t.blocked).sort(compare),scheduled=[],cannotFit=[];
  let freeMinutes=minutes;
  for(const t of candidates){
    const scheduledMinutes=allocation(t,freeMinutes);
    const sessionSize=t.splittable?t.sessionMinutes:scheduledMinutes;
    const sessionsPlanned=scheduledMinutes?Array.from({length:Math.ceil(scheduledMinutes/sessionSize)},(_,i)=>Math.min(sessionSize,scheduledMinutes-i*sessionSize)):[];
    const item={...t,why:why(t),scheduledMinutes,sessionsPlanned};
    if(scheduledMinutes){scheduled.push(item);freeMinutes-=scheduledMinutes;}else cannotFit.push(item);
  }
  const sum=list=>list.reduce((n,t)=>n+t.remainingMinutes,0);
  const dueMinutes=sum(tasks.filter(t=>t.effectiveDeadline&&t.effectiveDeadline<=date));
  return {date,budgetMinutes:minutes,remainingMinutes:sum(tasks),scheduledMinutes:minutes-freeMinutes,freeMinutes,dueMinutes,capacityWarning:dueMinutes>minutes,scheduled,cannotFit,blocked,undated};
}
