import express from 'express';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {buildPlan,normalizeAssignment,normalizeTask} from './plan.js';
import {buildRecovery,defaultAvailability} from './recovery.js';
import {extract,validDate} from './extract.js';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const str=(v,max,label)=>{if(typeof v!=='string'||!v.trim()||v.length>max)throw fail(`${label} must contain 1–${max} characters.`);return v.trim();};
function metadata(v) {
 const optional=(key,max)=>{const x=v[key]===undefined?'':v[key];if(typeof x!=='string'||x.length>max)throw fail('Invalid '+key+'.');return x.trim();};
 const course=optional('course',120),deadline=optional('deadline',10),instructions=optional('instructions',4000),submissionLink=optional('submissionLink',2000),importance=v.importance===undefined?'normal':v.importance;
 if(deadline&&!validDate(deadline))throw fail('Invalid assignment deadline.');
 if(!['low','normal','high'].includes(importance))throw fail('Invalid importance.');
 if(submissionLink){try{const u=new URL(submissionLink);if(!['http:','https:'].includes(u.protocol))throw Error();}catch{throw fail('Submission link must be an http or https URL.');}}
 return {course,deadline,instructions,submissionLink,importance};
}
function task(value,source,existing) {
  if (!value || typeof value!=='object') throw fail('Invalid task.');
  const title=str(value.title,200,'Task title');
  if(typeof value.dueDate!=='string'||(value.dueDate!==''&&!validDate(value.dueDate)))throw fail('Use a valid YYYY-MM-DD date or leave it blank.');
  if(typeof value.completed!=='boolean')throw fail('Completed must be true or false.');
  const quote=value.quote??existing?.quote??'';
  const sourceStart=value.sourceStart??existing?.sourceStart??null;
  if(typeof quote!=='string'||quote.length>20000)throw fail('Invalid source quote.');
  if(quote && (!Number.isInteger(sourceStart)||sourceStart<0||source.slice(sourceStart,sourceStart+quote.length)!==quote))throw fail('Source quote must match the original brief exactly.');
  const uncertainty=value.uncertainty??existing?.uncertainty??'';
  if(typeof uncertainty!=='string'||uncertainty.length>500)throw fail('Invalid uncertainty note.');
  const estimatedMinutes=value.estimatedMinutes===undefined?30:value.estimatedMinutes,blocked=value.blocked===undefined?false:value.blocked,blockedReason=value.blockedReason===undefined?'':value.blockedReason;
  if(!Number.isInteger(estimatedMinutes)||estimatedMinutes<5||estimatedMinutes>1440)throw fail('Estimated minutes must be an integer from 5 to 1440.');
  if(typeof blocked!=='boolean'||typeof blockedReason!=='string'||blockedReason.length>500||(blocked&&!blockedReason.trim()))throw fail('Blocked tasks need a reason (up to 500 characters).');
  if(['remainingMinutes','splittable','sessionMinutes'].some(k=>k in value&&value[k]===null))throw fail('Task work fields cannot be null.');
  const remainingMinutes=value.completed?0:(value.remainingMinutes??(existing?.completed?estimatedMinutes:existing?.remainingMinutes??estimatedMinutes));
  const splittable=value.splittable??false,sessionMinutes=value.sessionMinutes??25;
  if(!Number.isInteger(remainingMinutes)||remainingMinutes<0||remainingMinutes>1440||(!value.completed&&remainingMinutes===0))throw fail('Incomplete tasks need remaining minutes from 1 to 1440.');
  if(typeof splittable!=='boolean'||!Number.isInteger(sessionMinutes)||sessionMinutes<5||sessionMinutes>180)throw fail('Use splittable true/false and session minutes from 5 to 180.');
  if('estimateAssumed' in value&&typeof value.estimateAssumed!=='boolean')throw fail('Estimate assumed must be true or false.');
  const estimateAssumed=value.estimateAssumed??(value.estimatedMinutes===undefined&&value.remainingMinutes===undefined);
  return {remainingMinutes,splittable,sessionMinutes,sessions:existing?.sessions??[],estimateAssumed,estimatedMinutes,blocked:value.completed?false:blocked,blockedReason:value.completed?'':blockedReason.trim(),id:existing?.id??randomUUID(),title,dueDate:value.dueDate,completed:value.completed,quote,sourceStart:quote?sourceStart:null,uncertainty};
}
export function createApp(store,{production=false}={}) {
 const app=express(); app.disable('x-powered-by');
 app.use((req,res,next)=>{
  res.set({'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"});
  const host=req.hostname;
  if(!['localhost','127.0.0.1','[::1]','::1'].includes(host))return next(fail('Local requests only.',403));
  if(!['GET','HEAD','OPTIONS'].includes(req.method)) {
    if(req.headers.origin && !['http://localhost','http://127.0.0.1'].some(base=>{try {const u=new URL(req.headers.origin);return u.origin===`${base}${u.port?':'+u.port:''}`&&u.port===String(req.socket.localPort);}catch{return false;}}))return next(fail('Cross-origin writes are not allowed.',403));
    if(req.method!=='DELETE'&&!req.is('application/json'))return next(fail('Use application/json.',415));
  }
  next();
 });
 app.use(express.json({limit:'64kb',strict:true}));
 app.get('/api/health',(req,res)=>res.json({ok:true,mode:'local-deterministic'}));
 app.get('/api/assignments',async(req,res)=>res.json((await store.read()).assignments.map(normalizeAssignment)));
 const sessionPath='/api/assignments/:id/tasks/:taskId/sessions';
 app.post(sessionPath,async(req,res)=>{
  const b=req.body;
  if(!b||Object.keys(b).some(k=>!['requestId','minutes','outcome','remainingMinutes','note','blockedReason'].includes(k)))throw fail('Invalid session fields.');
  const requestId=str(b.requestId,100,'Request ID');
  if(!/^[a-zA-Z0-9_-]{1,100}$/.test(requestId))throw fail('Invalid request ID.');
  if(!Number.isInteger(b.minutes)||b.minutes<5||b.minutes>480||!['finished','continue','blocked'].includes(b.outcome))throw fail('Use 5–480 whole minutes and finished, continue or blocked.');
  if(b.outcome!=='finished'&&(!Number.isInteger(b.remainingMinutes)||b.remainingMinutes<1||b.remainingMinutes>1440))throw fail('Enter your remaining estimate (1–1440 minutes).');
  if(b.outcome==='finished'&&b.remainingMinutes!==undefined&&b.remainingMinutes!==0)throw fail('Finished work has zero remaining minutes.');
  const note=b.note===undefined?'':b.note;if(typeof note!=='string'||note.length>1000)throw fail('Session note is too long.');
  const blockedReason=b.outcome==='blocked'?str(b.blockedReason,500,'Blocked reason'):'';
  const payload=JSON.stringify({minutes:b.minutes,outcome:b.outcome,remainingMinutes:b.outcome==='finished'?0:b.remainingMinutes,note:note.trim(),blockedReason});
  const result=await store.update(data=>{
   const a=data.assignments.find(a=>a.id===req.params.id),t=a?.tasks.find(t=>t.id===req.params.taskId);if(!t)throw fail('Task not found.',404);
   const prior=t.sessions?.find(s=>s.requestId===requestId);if(prior){if(prior.payload!==payload)throw fail('Request ID already used for different work.',409);return {task:normalizeTask(t),session:prior,replayed:true};}
   if(a.submittedAt||t.completed)throw fail('Reopen this work before recording a session.',409);
   const session={id:randomUUID(),createdAt:new Date().toISOString(),requestId,...JSON.parse(payload),payload};
   Object.assign(t,{estimateAssumed:false,remainingMinutes:session.remainingMinutes,completed:b.outcome==='finished',blocked:b.outcome==='blocked',blockedReason,sessions:[...(t.sessions??[]),session].slice(-100)});
   return {task:normalizeTask(t),session,replayed:false};
  });res.json(result);
 });
 app.get('/api/availability',async(req,res)=>res.json((await store.read()).availability??defaultAvailability()));
 app.put('/api/availability',async(req,res)=>{
  const v=req.body;
  if(!Array.isArray(v)||v.length!==7||new Set(v.map(d=>d?.weekday)).size!==7||v.some(d=>!d||Object.keys(d).some(k=>!['weekday','minutes'].includes(k))||!Number.isInteger(d.weekday)||d.weekday<0||d.weekday>6||!Number.isInteger(d.minutes)||d.minutes<0||d.minutes>480))throw fail('Provide seven unique weekdays (0–6), each with 0–480 whole minutes.');
  const schedule=v.map(d=>({weekday:d.weekday,minutes:d.minutes})).sort((a,b)=>a.weekday-b.weekday);await store.update(data=>{data.availability=schedule;});res.json(schedule);
 });
 app.get('/api/recovery',async(req,res)=>{
  const {date,horizon}=req.query;
  if(typeof date!=='string'||!validDate(date)||typeof horizon!=='string'||!/^\d+$/.test(horizon)||Number(horizon)<1||Number(horizon)>30||Object.keys(req.query).some(k=>!['date','horizon'].includes(k)))throw fail('Use date=YYYY-MM-DD and horizon=1–30 whole days.');
  const end=new Date(date+'T12:00:00Z');end.setUTCDate(end.getUTCDate()+Number(horizon)-1);if(end.getUTCFullYear()>9999)throw fail('Planning horizon exceeds the supported calendar.');
  const data=await store.read();res.json(buildRecovery(data.assignments,date,Number(horizon),data.availability??defaultAvailability()));
 });
 app.get('/api/plan',async(req,res)=>{
  const {date,minutes}=req.query;
  if(typeof date!=='string'||!validDate(date)||typeof minutes!=='string'||!/^\d+$/.test(minutes)||Number(minutes)<5||Number(minutes)>480||Object.keys(req.query).some(k=>!['date','minutes'].includes(k)))throw fail('Use date=YYYY-MM-DD and whole daily minutes from 5 to 480.');
  res.json(buildPlan((await store.read()).assignments,date,Number(minutes)));
 });
 app.patch('/api/assignments/:id',async(req,res)=>{
  const result=await store.update(data=>{
   const a=data.assignments.find(a=>a.id===req.params.id);if(!a)throw fail('Assignment not found.',404);
   if('submittedAt' in req.body)throw fail('Use submitted true or false; submission time is server-owned.');
   if('submitted' in req.body){
    if(typeof req.body.submitted!=='boolean')throw fail('Submitted must be true or false.');
    if(req.body.submitted&&a.tasks.some(t=>!t.completed)&&req.body.confirmUnfinished!==true)throw fail('Confirm unfinished tasks before marking submitted.');
    a.submittedAt=req.body.submitted?(a.submittedAt||new Date().toISOString()):null;
   }
   Object.assign(a,metadata({...a,...req.body}));
   if('title' in req.body)a.title=str(req.body.title,120,'Assignment title');
   return normalizeAssignment(a);
  });res.json(result);
 });
 app.post('/api/extract',(req,res)=>{const source=str(req.body?.source,20000,'Brief');res.json(extract(source));});
 app.post('/api/assignments',async(req,res)=>{
  if(req.body?.confirmed!==true)throw fail('Review and confirm before saving.');
  const title=str(req.body.title,120,'Assignment title'); const source=str(req.body.source,20000,'Brief');
  if(!Array.isArray(req.body.tasks)||!req.body.tasks.length||req.body.tasks.length>50)throw fail('Save between 1 and 50 tasks.');
  const record={...metadata(req.body),submittedAt:null,id:randomUUID(),title,source,createdAt:new Date().toISOString(),tasks:req.body.tasks.map(t=>task(t,source))};
  await store.update(data=>data.assignments.push(record));res.status(201).json(record);
 });
 app.patch('/api/assignments/:id/tasks/:taskId',async(req,res)=>{
  const result=await store.update(data=>{const a=data.assignments.find(a=>a.id===req.params.id);const i=a?.tasks.findIndex(t=>t.id===req.params.taskId);if(!a||i<0)throw fail('Task not found.',404);const input={...a.tasks[i],...req.body};if(!('estimateAssumed' in req.body)&&('remainingMinutes' in req.body||'estimatedMinutes' in req.body))input.estimateAssumed=false;if(a.tasks[i].completed&&req.body.completed===false&&!('remainingMinutes' in req.body))delete input.remainingMinutes;return a.tasks[i]=task(input,a.source,a.tasks[i]);});res.json(result);
 });
 app.post('/api/assignments/:id/tasks',async(req,res)=>{
  const result=await store.update(data=>{const a=data.assignments.find(a=>a.id===req.params.id);if(!a)throw fail('Assignment not found.',404);if(a.tasks.length>=50)throw fail('Maximum 50 tasks per assignment.');const t=task(req.body,a.source);a.tasks.push(t);return t;});res.status(201).json(result);
 });
 app.delete('/api/assignments/:id/tasks/:taskId',async(req,res)=>{await store.update(data=>{const a=data.assignments.find(a=>a.id===req.params.id);const i=a?.tasks.findIndex(t=>t.id===req.params.taskId);if(!a||i<0)throw fail('Task not found.',404);a.tasks.splice(i,1);});res.json({ok:true});});
 app.delete('/api/assignments/:id',async(req,res)=>{await store.update(data=>{const i=data.assignments.findIndex(a=>a.id===req.params.id);if(i<0)throw fail('Assignment not found.',404);data.assignments.splice(i,1);});res.json({ok:true});});
 app.use('/api',(req,res,next)=>next(fail('API route not found.',404)));
 if(production){app.use(express.static(resolve('dist')));app.get('/{*path}',(req,res)=>res.sendFile(resolve('dist/index.html')));}
 app.use((err,req,res,next)=>{const status=err.status||500;if(status===500)console.error(err);res.status(status).json({error:status===500?'Storage unavailable. Your changes were not saved. Check the server log and data file.':err.type==='entity.too.large'?'Request too large. Maximum body size is 64 KB.':err instanceof SyntaxError?'Invalid JSON body.':err.message});});
 return app;
}
