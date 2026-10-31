import {chromium} from "playwright";
import assert from "node:assert/strict";
const browser=await chromium.launch();
try{
 const page=await browser.newPage();
 await page.goto("https://walking-dead-universe-atlas-nkc2pnj1x-skaggs-projects.vercel.app/?_vercel_share=saVliDzs2tYufEjoBR8ce5XHHLdJUI5D",{waitUntil:"domcontentloaded"});
 const base="https://walking-dead-universe-atlas-nkc2pnj1x-skaggs-projects.vercel.app";
 for(const path of ["/api/cron/fandom-sync","/api/cron/media-sync"]){
  for(const headers of [{},{authorization:"Bearer undefined"}]){
   const r=await page.request.get(base+path,{headers});
   console.log(path,headers.authorization?"undefined credential":"no credential",r.status());
   assert.equal(r.status(),401);
   assert.deepEqual(await r.json(),{ok:false});
  }
 }
 await page.goto(base+"/?who=rick-grimes");
 await page.getByRole("button",{name:"Open photo: Featured image",exact:true}).click();
 const close=page.getByRole("button",{name:"Close viewer",exact:true});
 await close.click();
 await page.locator(".lightbox").waitFor({state:"hidden"});
 assert.equal(new URL(page.url()).searchParams.get("who"),"rick-grimes");
 console.log("PASS deployed viewer closes without dismissing Rick detail");
}finally{await browser.close()}
