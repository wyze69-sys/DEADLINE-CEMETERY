import {test,expect} from '@playwright/test';

test('motion preference persists and system changes override it immediately',async({page},info)=>{
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.goto('/');
 const root=page.locator('html');
 await expect(page.getByRole('button',{name:'Motion on',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(root).toHaveAttribute('data-motion','on');
 await page.getByRole('button',{name:'Motion on',exact:true}).click();
 await expect(root).toHaveAttribute('data-motion','off');
 await page.reload();
 await expect(page.getByRole('button',{name:'Motion off',exact:true})).toHaveAttribute('aria-pressed','false');
 expect(await page.locator('.scene-cloud').evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
 await page.getByRole('button',{name:'Motion off',exact:true}).click();
 await page.emulateMedia({reducedMotion:'reduce'});
 await expect(root).toHaveAttribute('data-motion','off');
 await expect(page.getByRole('button',{name:'Motion off',exact:true})).toBeDisabled();
 expect(await page.locator('.scene-cloud').evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
 await page.emulateMedia({reducedMotion:'no-preference'});
 await expect(root).toHaveAttribute('data-motion','on');
 await page.screenshot({path:`test-results/${info.project.name}-dusk.png`,fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('reduced motion keeps intake, review and source dialog fully usable',async({page},info)=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.goto('/');
 await expect(page.getByRole('heading',{name:'Your rescue plan'})).toBeVisible();
 await page.getByRole('button',{name:'Add a brief'}).click();
 await expect(page.locator('.intake')).toHaveCSS('animation-name','none');
 await expect(page.locator('.intake')).toHaveCSS('opacity','1');
 await page.getByLabel('Assignment name').fill('Reduced motion brief');
 await page.getByLabel('Paste your assignment brief').fill('Write a short essay.');
 await page.getByRole('button',{name:'Find possible tasks'}).click();
 await expect(page.locator('.review-card')).toHaveCount(1);
 await page.locator('.quote-button').click();
 await expect(page.getByRole('dialog')).toBeVisible();
 await expect(page.getByRole('dialog')).toHaveCSS('animation-name','none');
 await expect(page.locator('dialog mark')).toHaveText('Write a short essay.');
 await page.keyboard.press('Escape');
 await expect(page.getByRole('dialog')).not.toBeVisible();
 await page.screenshot({path:`test-results/${info.project.name}-reduced-motion.png`,fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
