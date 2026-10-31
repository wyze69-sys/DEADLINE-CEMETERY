import express from 'express';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {buildPlan,normalizeAssignment} from './plan.js';
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
  return {estimatedMinutes,blocked,blockedReason:blockedReason.trim(),id:existing?.id??randomUUID(),title,dueDate:value.dueDate,completed:value.completed,quote,sourceStart:quote?sourceStart:null,uncertainty};
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
  const result=await store.update(data=>{const a=data.assignments.find(a=>a.id===req.params.id);const i=a?.tasks.findIndex(t=>t.id===req.params.taskId);if(!a||i<0)throw fail('Task not found.',404);return a.tasks[i]=task({...a.tasks[i],...req.body},a.source,a.tasks[i]);});res.json(result);
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
