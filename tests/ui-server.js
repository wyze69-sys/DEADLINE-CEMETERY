import {createApp} from '../server/app.js';
import {Store} from '../server/store.js';
import {rm} from 'node:fs/promises';
import {resolve} from 'node:path';
const file=resolve('test-results/ui-data.json');await rm(file,{force:true});
createApp(new Store(file),{production:true}).listen(4179,'127.0.0.1');
