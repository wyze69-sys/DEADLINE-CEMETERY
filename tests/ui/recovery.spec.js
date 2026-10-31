import {test,expect} from '@playwright/test';
test('availability to plan to self-reported continue, finish, ready and actual submission',async({page,request},info)=>{
 for(const a of await (await request.get('/api/assignments')).json())await request.delete('/api/assignments/'+a.id);
 const result=await request.post('/api/assignments',{data:{confirmed:true,title:'Recovery essay',source:'Write an essay.',deadline:'2026-11-03',tasks:[{title:'Draft essay',dueDate:'',completed:false,estimatedMinutes:90,remainingMinutes:90,splittable:true,sessionMinutes:25,quote:'Write an essay.',sourceStart:0}]}});expect(result.ok()).toBeTruthy();
 const a=await result.json();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await page.getByLabel('Plan date').fill('2026-11-02');await page.getByLabel('Available minutes').fill('60');
 await page.getByText('Weekly availability & 14-day recovery plan',{exact:true}).click();
 for(const day of ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'])await page.getByLabel(day+' minutes',{exact:true}).fill(day==='Monday'||day==='Tuesday'?'60':'0');
 await page.getByRole('button',{name:'Save availability',exact:true}).click();await expect.poll(async()=>await (await request.get('/api/availability')).json()).toEqual(Array.from({length:7},(_,weekday)=>({weekday,minutes:weekday===1||weekday===2?60:0})));
 await expect(page.locator('.attention-row')).toContainText('Fits');await expect(page.locator('.plan-totals')).toContainText('50 min scheduled');
 await page.locator('.plan-list').first().getByRole('button',{name:'Record work',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('Write an essay.');
 await page.getByLabel('Minutes worked').fill('25');await page.getByLabel('What did you do?').fill('Drafted introduction');await page.getByLabel('Remaining estimate').fill('70');await page.getByRole('button',{name:'Save work session',exact:true}).click();await expect(page.getByRole('dialog')).not.toBeVisible();await expect(page.locator('.plan-totals')).toContainText('70 min remaining');
 await expect.poll(async()=>{const rows=await (await request.get('/api/assignments')).json();return rows[0].tasks[0].remainingMinutes;}).toBe(70);
 await page.reload();await page.locator('.plan-list').first().getByRole('button',{name:'Record work',exact:true}).click();await page.getByLabel('What happened?').selectOption('finished');await page.getByRole('button',{name:'Save work session',exact:true}).click();
 await expect(page.getByRole('region',{name:'Ready to submit'})).toContainText('Recovery essay');await page.getByRole('button',{name:'Submit Recovery essay',exact:true}).click();await page.getByRole('button',{name:'Confirm submitted',exact:true}).click();
 await expect.poll(async()=>{const rows=await (await request.get('/api/assignments')).json();return Boolean(rows[0].submittedAt);}).toBe(true);
 await page.screenshot({path:`test-results/${info.project.name}-recovery.png`,fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
 const saved=await (await request.get('/api/assignments')).json();expect(saved[0].tasks[0].estimatedMinutes).toBe(90);expect(saved[0].tasks[0].sessions).toHaveLength(2);expect(saved[0].tasks[0].remainingMinutes).toBe(0);
});
