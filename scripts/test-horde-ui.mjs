import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch();
try{
 for(const width of [390,768,1280]){
  const page=await browser.newPage({viewport:{width,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route(/supabase|wikia|amcn|_vercel|vercel-insights/,r=>r.abort());
  await page.goto('http://127.0.0.1:4173/');
  await page.getByRole('button',{name:'Map layers',exact:true}).click();
  await page.getByRole('button',{name:/Walker herds/}).click();
  const panel=page.getByRole('region',{name:'Walker herd events'});
  await panel.waitFor();
  assert.equal(await page.locator('[data-horde-id]').count(),1);
  await panel.getByRole('button',{name:'The farm is overrun',exact:true}).click();
  assert.match(await page.locator('[data-horde-id]').getAttribute('aria-label'),/farm is overrun/);
  await panel.locator('select').selectOption('quarry-herd');
  assert.equal(await page.locator('[data-horde-id]').count(),0,'Unknown quarry must not leave old pin');
  await panel.getByRole('button',{name:'Alexandria surrounded',exact:true}).click();
  assert.equal(await page.locator('[data-horde-id]').count(),1);
  await panel.getByRole('button',{name:'Alexandria cleared',exact:true}).click();
  assert.equal(await page.locator('[data-horde-id]').textContent(),'CLEAREDQuarry–Alexandria herd');
  const bounds=await panel.boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width+1);
  await panel.getByRole('button',{name:'Close herd events'}).click();
  const marker=page.locator('[data-horde-id]');
  await marker.focus();await page.keyboard.press('Enter');await panel.waitFor();
  await page.keyboard.press('Escape');assert.equal(await panel.count(),0);
  const hit=await marker.locator('circle').boundingBox();
  if(hit&&hit.x>0&&hit.x+hit.width<width&&hit.y>0&&hit.y+hit.height<844){
   const x=hit.x+hit.width/2,y=hit.y+hit.height/2;
   await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+35,y+15,{steps:5});await page.mouse.up();
   assert.equal(await panel.count(),0,'Dragging a herd must not select it');
  }
  assert.deepEqual(errors,[]);await page.close();console.log(`Herd controls and unknown/cleared locations passed at ${width}px.`);
 }
 const safe=await browser.newPage({viewport:{width:390,height:844}});
 await safe.addInitScript(()=>localStorage.setItem('twdu-atlas-spoiler-safe','1'));
 await safe.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
 await safe.getByRole('button',{name:'Map layers',exact:true}).click();await safe.getByRole('button',{name:/Walker herds/}).click();
 const safePanel=safe.getByRole('region',{name:'Walker herd events'});
 assert.equal(await safePanel.locator('select').count(),0);
 assert.equal(await safe.locator('[data-horde-id]').count(),0);
 assert.doesNotMatch(await safePanel.textContent(),/Whisperer|Quarry|Atlanta/);
 await safe.close();console.log('Spoiler-safe hides unwatched herd identities and coordinates.');
}finally{await browser.close()}
