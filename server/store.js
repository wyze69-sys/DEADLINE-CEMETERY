import {readFile, mkdir, writeFile, rename, unlink} from 'node:fs/promises';
import {dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
export class Store {
  constructor(file) { this.file=file; this.queue=Promise.resolve(); }
  async read() {
    try {
      const data=JSON.parse(await readFile(this.file,'utf8'));
      if (data.version!==1 || !Array.isArray(data.assignments)) throw new Error('Invalid storage schema');
      return data;
    } catch (e) { if (e.code==='ENOENT') return {version:1,assignments:[]}; throw e; }
  }
  update(action) {
    const job=this.queue.then(async()=>{
      const data=await this.read(); const result=await action(data);
      await mkdir(dirname(this.file),{recursive:true});
      const tmp=`${this.file}.${randomUUID()}.tmp`;
      try { await writeFile(tmp,JSON.stringify(data,null,2),{flag:'wx'}); await rename(tmp,this.file); }
      catch(e) { await unlink(tmp).catch(()=>{}); throw e; }
      return result;
    });
    this.queue=job.catch(()=>{}); return job;
  }
}
