import {chromium} from 'playwright';import assert from 'node:assert/strict';
const browser=await chromium.launch();
try{for(const url of ['https://walking-dead-universe-atlas.vercel.app/','https://walking-dead-universe-atlas.pages.dev/?verify=20261001-latest']){
 const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route(/supabase|wikia|amcn|_vercel\/insights|vercel-insights/,r=>r.abort());
 await page.goto(url,{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Map layers',exact:true}).click();await page.getByRole('button',{name:/Walker herds/}).click();const panel=page.getByRole('region',{name:'Walker herd events'});
 await panel.locator('select').selectOption('quarry-herd');await panel.getByRole('button',{name:'Quarry release and split',exact:true}).waitFor();assert.equal(await page.locator('[data-horde-id]').count(),0);await panel.getByRole('button',{name:'Alexandria surrounded',exact:true}).click();assert.equal(await page.locator('[data-horde-id]').count(),1);await panel.getByRole('button',{name:'Open supporting episode'}).click();assert.equal(await panel.count(),0);assert.deepEqual(errors,[]);console.log(new URL(url).hostname+': latest herd navigation and supporting episode verified');await page.close();
}}finally{await browser.close()}


