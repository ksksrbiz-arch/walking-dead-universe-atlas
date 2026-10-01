import {chromium} from 'playwright';
const browser=await chromium.launch();
const base=process.argv[2]||'http://localhost:4173';
let passed=0;
const check=(name,ok)=>{if(!ok)throw Error(name);console.log('PASS '+name);passed++;};
try{
 for(const [width,height] of [[390,844],[820,1180],[1440,900],[844,390]]){
  const page=await browser.newPage({viewport:{width,height},hasTouch:true});
  const tab=name=>page.getByRole('navigation',{name:'Atlas sections'}).getByRole('button',{name,exact:true});
  await page.goto(base+'/people');await page.locator('.sheetBody').waitFor();await page.waitForTimeout(500);
  const before=await page.locator('.sheetBody').evaluate(el=>{el.scrollTop=400;return el.scrollTop;});
  check(width+': people list is scrollable',before>100);
  await tab('Watch').click();await page.waitForTimeout(300);await tab('People').click();await page.waitForTimeout(400);
  const restored=await page.locator('.sheetBody').evaluate(el=>el.scrollTop);
  check(width+': switching sections restores list position',Math.abs(restored-before)<2);
  await tab('People').click();
  check(width+': active section returns to top',await page.locator('.sheetBody').evaluate(el=>el.scrollTop)===0);
  await page.goto(base+'/?ep=owl-s01-e05');await page.getByRole('button',{name:'Back to Map',exact:true}).waitFor();
  await page.getByRole('button',{name:'Back to Map',exact:true}).click();await page.waitForTimeout(200);
  check(width+': direct detail has a working way back',await page.locator('.detailBarTitle').count()===0&&!new URL(page.url()).searchParams.has('ep'));
  if(width<900&&height>width){
   const handle=page.locator('.grabber');
   check(width+': panel handle has a 44px touch target',(await handle.boundingBox()).height>=44);
   await handle.tap();await page.waitForTimeout(250);
   check(width+': tap expands to half',await page.locator('.sheet.snap-half').count()===1);
   await handle.tap();await page.waitForTimeout(250);
   check(width+': another tap expands to full',await page.locator('.sheet.snap-full').count()===1);
   await handle.tap();await page.waitForTimeout(250);
   check(width+': another tap returns to peek',await page.locator('.sheet.snap-peek').count()===1);
  }
  await page.screenshot({path:'work-navigation-mobile-'+width+'.png'});await page.close();
 }
 console.log(passed+' navigation checks passed');
}finally{await browser.close();}
