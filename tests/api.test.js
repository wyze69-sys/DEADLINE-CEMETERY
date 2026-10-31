import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {Store} from '../server/store.js';
import {createApp} from '../server/app.js';
const root=resolve('test-results');
import {mkdir} from 'node:fs/promises';
await mkdir(root,{recursive:true});
test('atomic serialized writes survive fresh Store, failed jobs and corruption',async()=>{
 const dir=await mkdtemp(join(root,'store-'));try{
 const file=join(dir,'data.json'),s=new Store(file);assert.deepEqual((await s.read()).assignments,[]);
 await Promise.all(Array.from({length:20},(_,i)=>s.update(data=>data.assignments.push({id:i}))));assert.equal((await new Store(file).read()).assignments.length,20);
 await assert.rejects(s.update(()=>{throw Error('cancelled');}));await s.update(data=>data.assignments.push({id:21}));assert.equal((await s.read()).assignments.length,21);assert.deepEqual(await readdir(dir),['data.json']);
 await writeFile(file,'broken json');await assert.rejects(s.read());await assert.rejects(s.update(()=>{}));
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('real HTTP API lifecycle, validation, errors, safety and restart persistence',async()=>{
 const dir=await mkdtemp(join(root,'api-'));const file=join(dir,'data.json');const app=createApp(new Store(file),{production:true});const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
 const request=async(path,method='GET',body,headers={})=>{const r=await fetch(base+path,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json()};};
 try{
 assert.deepEqual((await request('/api/assignments')).body,[]);
 assert.equal((await request('/api/extract','POST',{source:''})).status,400);
 assert.equal((await request('/api/extract','POST',{source:'x'.repeat(70000)})).status,413);
 assert.equal((await request('/api/extract','POST',{source:'Submit essay'},{Origin:'https://evil.example'})).status,403);
 assert.equal((await request('/api/extract','POST',{source:'Submit essay'},{Origin:base})).status,200);
 const malformed=await fetch(base+'/api/extract',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'});assert.equal(malformed.status,400);assert.match((await malformed.json()).error,/Invalid JSON/);
 const source='Submit <script>alert(1)</script> essay by 2027-03-01.';
 const tasks=(await request('/api/extract','POST',{source})).body.tasks;
 assert.equal((await request('/api/assignments','POST',{title:'Course',source,tasks})).status,400);
 assert.equal((await request('/api/assignments','POST',{confirmed:true,title:'Course',source,tasks:[{...tasks[0],quote:'forged'}]})).status,400);
 const created=await request('/api/assignments','POST',{confirmed:true,title:'Course',source,tasks});assert.equal(created.status,201);const a=created.body,t=a.tasks[0];assert.equal((await new Store(file).read()).assignments[0].id,a.id);
 assert.equal((await request(`/api/assignments/${a.id}/tasks/${t.id}`,'PATCH',{dueDate:'2027-02-30'})).status,400);
 assert.equal((await request(`/api/assignments/${a.id}/tasks/${t.id}`,'PATCH',{completed:true,title:'Edited'})).body.completed,true);
 const added=await request(`/api/assignments/${a.id}/tasks`,'POST',{title:'Manual',dueDate:'',completed:false});assert.equal(added.status,201);
 assert.equal((await request('/api/assignments')).body[0].tasks.length,2);
 assert.equal((await request(`/api/assignments/${a.id}/tasks/${t.id}`,'DELETE')).status,200);
 assert.equal((await request(`/api/assignments/${a.id}`,'DELETE')).status,200);
 assert.deepEqual((await request('/api/assignments')).body,[]);
 assert.equal((await request('/api/missing')).status,404);
 const html=await fetch(base+'/');assert.equal(html.status,200);assert.match(await html.text(),/Deadline Cemetery/);assert.match(html.headers.get('content-security-policy'),/script-src 'self'/);
 }finally{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
});
