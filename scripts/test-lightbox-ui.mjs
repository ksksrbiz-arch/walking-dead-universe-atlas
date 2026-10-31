import {chromium} from "playwright";
import assert from "node:assert/strict";
import {mkdir} from "node:fs/promises";

const browser=await chromium.launch();
await mkdir("work/review-screenshots",{recursive:true});
try{
 for(const [width,height] of [[390,844],[820,1180],[1440,900],[844,390]]){
  const page=await browser.newPage({viewport:{width,height}});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route(/supabase|wikia|amcn|_vercel|vercel-insights/,r=>r.abort());
  await page.route("**/data/fandom-galleries/characters.json",r=>r.fulfill({json:{"rick-grimes":[{p:"a/ab/Rick.jpg",t:"Rick gallery regression",w:640,h:480}]}}));
  await page.goto((process.env.ATLAS_URL||"http://127.0.0.1:4173/")+"?who=rick-grimes");
  const opener=page.getByRole("button",{name:"Open photo: Rick gallery regression",exact:true});
  await opener.click();
  const dialog=page.locator(".lightbox");await dialog.waitFor();
  assert.equal(await page.locator("#root").evaluate(el=>el.inert),true);
  assert.equal(await dialog.getByRole("button",{name:"Close viewer"}).evaluate(el=>{
   const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));
  }),true,"close button is above app chrome and can be clicked");
  const controls=dialog.locator("button:not([disabled]),a[href]");
  const count=await controls.count();assert.ok(count>=4);
  assert.equal(await controls.nth(0).evaluate(el=>el===document.activeElement),true);
  for(let i=1;i<count;i++){
   await page.keyboard.press("Tab");
   assert.equal(await controls.nth(i).evaluate(el=>el===document.activeElement),true,"Tab reaches every viewer control");
  }
  await page.keyboard.press("Tab");assert.equal(await controls.nth(0).evaluate(el=>el===document.activeElement),true);
  await page.keyboard.press("Shift+Tab");assert.equal(await controls.nth(count-1).evaluate(el=>el===document.activeElement),true);
  const label=await dialog.getAttribute("aria-label");
  await page.keyboard.press("ArrowRight");assert.notEqual(await dialog.getAttribute("aria-label"),label);
  await page.screenshot({path:`work/review-screenshots/lightbox-${width}x${height}.png`,animations:"disabled"});
  await page.keyboard.press("Escape");await dialog.waitFor({state:"hidden"});
  assert.equal(await opener.evaluate(el=>el===document.activeElement),true,"dismiss restores opener focus");
  assert.equal(await page.locator("#root").evaluate(el=>el.inert),false);
  assert.deepEqual(errors,[]);
  console.log(`PASS lightbox keyboard navigation and restored focus at ${width}×${height}`);
  await page.close();
 }
}finally{await browser.close()}
