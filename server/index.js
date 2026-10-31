import {resolve} from 'node:path';
import {createApp} from './app.js';
import {Store} from './store.js';
const production=process.argv.includes('--production');
const app=createApp(new Store(resolve(process.env.DATA_FILE||'data/cemetery.json')),{production});
if(!production){const {createServer}=await import('vite');const vite=await createServer({server:{middlewareMode:true},appType:'spa'});app.use(vite.middlewares);}
const port=Number(process.env.PORT||4173);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT must be 1–65535');
app.listen(port,'127.0.0.1',()=>console.log(`Deadline Cemetery: http://127.0.0.1:${port} (${production?'production':'development'})`));
