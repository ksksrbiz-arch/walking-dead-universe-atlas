import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch();
const base=process.env.ATLAS_URL||'http://localhost:4173/';
try{
 for(const [width,height] of [[390,844],[820,1180],[1440,900],[844,390]]){
  const page=await browser.newPage({viewport:{width,height}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route(/supabase|wikia|amcn|_vercel|vercel-insights/,r=>r.abort());
  await page.goto(base);
  await page.getByRole('button',{name:'Map layers',exact:true}).click();
  await page.getByRole('button',{name:/Walker herds/}).click();
  const panel=page.getByRole('region',{name:'Walker herd events'});
  await panel.waitFor();
  assert.equal(await page.locator('[data-horde-id]').count(),1);
  const walkers=page.locator('.hordeWalker');
  assert.equal(await walkers.count(),18);
  const motion=await walkers.evaluateAll(nodes=>nodes.map(n=>({name:getComputedStyle(n).animationName,duration:getComputedStyle(n).animationDuration,delay:getComputedStyle(n).animationDelay})));
  assert.ok(motion.every(w=>w.name==='hordeBob'));
  assert.ok(new Set(motion.map(w=>w.delay)).size>1,'Walkers should shuffle out of step');
  assert.ok(new Set(motion.map(w=>w.duration)).size>1);
  const first=await page.locator('.hordeLegFront').first().evaluate(n=>getComputedStyle(n).rotate);
  await page.waitForTimeout(180);
  const limb=await page.locator('.hordeLegFront').first().evaluate(n=>getComputedStyle(n).rotate);
  assert.notEqual(limb,'none','Leg gait must be connected to the rendered crowd');
  assert.notEqual(limb,first,'The gait should advance between frames');
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.ok(await page.locator('.hordeWalker,.hordeShuffle,.hordeLegFront,.hordeLegBack,.hordeGlow').evaluateAll(nodes=>nodes.every(n=>getComputedStyle(n).animationName==='none')),'Reduced motion must stop every herd animation');
  await page.emulateMedia({reducedMotion:'no-preference'});
  await panel.getByRole('button',{name:'The farm is overrun',exact:true}).click();
  assert.match(await page.locator('[data-horde-id]').getAttribute('aria-label'),/farm is overrun/);
  assert.equal(await page.locator('[data-horde-id]').getAttribute('data-horde-status'),'overrunning');
  await panel.locator('select').selectOption('quarry-herd');
  assert.equal(await page.locator('[data-horde-id]').count(),0,'Unknown quarry must not leave old pin');
  await panel.getByRole('button',{name:'Alexandria surrounded',exact:true}).click();
  assert.equal(await page.locator('[data-horde-id]').count(),1);
  assert.equal(await page.locator('[data-horde-id]').getAttribute('data-horde-status'),'gathering');
  await panel.getByRole('button',{name:'Alexandria cleared',exact:true}).click();
  assert.equal(await page.locator('[data-horde-id]').textContent(),'CLEAREDQuarry–Alexandria herd');
  assert.equal(await walkers.count(),0,'Cleared events must have no moving walkers');
  assert.equal(await page.locator('.hordeGlow').evaluate(n=>getComputedStyle(n).animationName),'none');
  const bounds=await panel.boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width+1);
  await panel.getByRole('button',{name:'Close herd events'}).click();
  const marker=page.locator('[data-horde-id]');
  await marker.focus();await page.keyboard.press('Enter');await panel.waitFor();
  await page.keyboard.press('Escape');assert.equal(await panel.count(),0);
  const hit=await marker.locator('circle').boundingBox();
  if(hit&&hit.x>0&&hit.x+hit.width<width&&hit.y>0&&hit.y+hit.height<height){
   const x=hit.x+hit.width/2,y=hit.y+hit.height/2;
   await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+35,y+15,{steps:5});await page.mouse.up();
   assert.equal(await panel.count(),0,'Dragging a herd must not select it');
  }
  assert.deepEqual(errors,[]);await page.close();console.log(`Herd controls and unknown/cleared locations passed at ${width}px.`);
 }
 const safe=await browser.newPage({viewport:{width:390,height:844}});
 await safe.addInitScript(()=>localStorage.setItem('twdu-atlas-spoiler-safe','1'));
 await safe.goto(base,{waitUntil:'domcontentloaded'});
 await safe.getByRole('button',{name:'Map layers',exact:true}).click();await safe.getByRole('button',{name:/Walker herds/}).click();
 const safePanel=safe.getByRole('region',{name:'Walker herd events'});
 assert.equal(await safePanel.locator('select').count(),0);
 assert.equal(await safe.locator('[data-horde-id]').count(),0);
 assert.doesNotMatch(await safePanel.textContent(),/Whisperer|Quarry|Atlanta/);
 await safe.close();console.log('Spoiler-safe hides unwatched herd identities and coordinates.');
}finally{await browser.close()}
