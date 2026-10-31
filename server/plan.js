// Read-time defaults preserve legacy files without a destructive migration.
export function normalizeAssignment(a) {
  return {...a,course:a.course??'',deadline:a.deadline??'',importance:a.importance??'normal',instructions:a.instructions??'',submissionLink:a.submissionLink??'',submittedAt:a.submittedAt??null,
    tasks:a.tasks.map(t=>({...t,estimatedMinutes:t.estimatedMinutes??30,blocked:t.blocked??false,blockedReason:t.blockedReason??''}))};
}
const importance={high:0,normal:1,low:2};
export function buildPlan(records,date,minutes) {
  const tasks=records.map(normalizeAssignment).filter(a=>!a.submittedAt).flatMap(a=>a.tasks.filter(t=>!t.completed).map(t=>({id:t.id,assignmentId:a.id,assignmentTitle:a.title,course:a.course,title:t.title,estimatedMinutes:t.estimatedMinutes,blocked:t.blocked,blockedReason:t.blockedReason,importance:a.importance,effectiveDeadline:t.dueDate||a.deadline||'',deadlineSource:t.dueDate?'task':a.deadline?'assignment':'none'})));
  const compare=(a,b)=>(a.effectiveDeadline||'9999-99-99').localeCompare(b.effectiveDeadline||'9999-99-99')||importance[a.importance]-importance[b.importance]||a.id.localeCompare(b.id)||a.assignmentId.localeCompare(b.assignmentId);
  const why=t=>t.effectiveDeadline?(t.effectiveDeadline<date?'Overdue':t.effectiveDeadline===date?'Due today':'Nearest deadline')+` · ${t.importance} importance`:'No confirmed date · '+t.importance+' importance';
  const blocked=tasks.filter(t=>t.blocked).sort(compare),undated=tasks.filter(t=>!t.blocked&&!t.effectiveDeadline).sort(compare);
  const candidates=tasks.filter(t=>!t.blocked).sort(compare),scheduled=[],cannotFit=[];
  let freeMinutes=minutes;
  for(const t of candidates){const item={...t,why:why(t)};if(t.estimatedMinutes<=freeMinutes){scheduled.push(item);freeMinutes-=t.estimatedMinutes;}else cannotFit.push(item);}
  const sum=list=>list.reduce((n,t)=>n+t.estimatedMinutes,0);
  const dueMinutes=sum(tasks.filter(t=>t.effectiveDeadline&&t.effectiveDeadline<=date));
  return {date,budgetMinutes:minutes,remainingMinutes:sum(tasks),scheduledMinutes:minutes-freeMinutes,freeMinutes,dueMinutes,capacityWarning:dueMinutes>minutes,scheduled,cannotFit,blocked,undated};
}
