import test from 'node:test';
import assert from 'node:assert/strict';
import {extract,dateFrom,validDate} from '../server/extract.js';
import {statusOf,todayLocal} from '../src/model.js';
test('verbatim quotes, offsets, explicit dates and uncertainty',()=>{
 const source='Course instructions\r\n  Submit essay by November 18, 2026.\r\nPrepare slides for November 23.\nUpload files tomorrow.';
 const result=extract(source);assert.equal(result.mode,'local-deterministic');assert.equal(result.tasks.length,3);
 for(const t of result.tasks)assert.equal(source.slice(t.sourceStart,t.sourceStart+t.quote.length),t.quote);
 assert.equal(result.tasks[0].dueDate,'2026-11-18');assert.equal(result.tasks[1].dueDate,'');assert.match(result.tasks[1].uncertainty,/missing a year/);assert.equal(result.tasks[2].dueDate,'');
});
test('invalid dates and numeric ambiguity never invent dates',()=>{
 assert.equal(dateFrom('Submit 2026-02-30').dueDate,'');assert.equal(dateFrom('Due 12/11/2026').dueDate,'');assert.equal(dateFrom('Due February 29, 2028').dueDate,'2028-02-29');assert.equal(dateFrom('Due February 29, 2027').dueDate,'');assert.equal(validDate('2026-1-1'),false);
});
test('multiple dates require a human choice',()=>{const t=dateFrom('Start 2026-11-01, submit November 18, 2026.');assert.equal(t.dueDate,'');assert.match(t.uncertainty,/Multiple dates/);});
test('no candidates and capped candidates',()=>{assert.deepEqual(extract('Welcome to the course.').tasks,[]);assert.equal(extract(Array(60).fill('Write an essay.').join('\n')).tasks.length,50);});
test('calendar status uses supplied actual-day boundary and completion precedence',()=>{
 assert.equal(todayLocal(new Date(2026,10,2,23,30)),'2026-11-02');
 for(const [dueDate,completed,status] of [['2026-11-01',false,'overdue'],['2026-11-02',false,'upcoming'],['',false,'undated'],['2026-01-01',true,'completed']])assert.equal(statusOf({dueDate,completed},'2026-11-02'),status);
});
