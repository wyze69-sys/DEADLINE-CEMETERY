export function todayLocal(now=new Date()){return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;}
export function statusOf(task,today=todayLocal()){return task.completed?'completed':!task.dueDate?'undated':task.dueDate<today?'overdue':'upcoming';}
export const emptyTask=()=>({estimatedMinutes:30,blocked:false,blockedReason:'',title:'',dueDate:'',completed:false,quote:'',sourceStart:null,uncertainty:'Manually added. Check the original brief.'});
