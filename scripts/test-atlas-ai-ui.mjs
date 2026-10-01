import {chromium} from "playwright";
import assert from "node:assert/strict";
import {mkdir} from "node:fs/promises";
const base=process.env.ATLAS_URL||"http://127.0.0.1:4173/";
const browser=await chromium.launch();
const sizes=[[390,844],[820,1180],[1440,900],[844,390]];
await mkdir("work/ai-screenshots",{recursive:true});
let mode="answer",calls=0,pending;
const errors=[];
try{
 for(const [width,height] of sizes){
  const page=await browser.newPage({viewport:{width,height}});
  page.on("pageerror",e=>errors.push(e.message));
  await page.route(/supabase|wikia|amcn|_vercel|vercel-insights/,r=>r.abort());
  await page.route("**/ask",async route=>{
   calls++;
   if(mode==="pending"){pending=route;return;}
   if(mode==="budget"){await route.fulfill({status:429,json:{ok:false,error:"Atlas AI has reached its $10 budget. Ordinary search still works."}});return;}
   await route.fulfill({json:{ok:true,answer:"Rick Grimes appears in The Walking Dead and The Ones Who Live. The Atlas records his status as confirmed alive.",citations:[{id:"rick-grimes",kind:"character",title:"Rick Grimes",sources:[]}],model:"mistral-small-latest"}});
  });
  await page.goto(base);
  await page.getByRole("button",{name:"Search the atlas",exact:true}).click();
  const input=page.locator(".searchBar input");
  await input.fill("Who is Rick Grimes?");
  assert.equal(calls,0,"typing should not spend AI tokens");
  await page.getByRole("button",{name:"Ask Atlas",exact:true}).click();
  await page.locator(".atlasAIAnswer").waitFor();
  await page.screenshot({path:`work/ai-screenshots/${width}x${height}.png`});
  const geometry=await page.locator(".atlasAI .btn").boundingBox();assert.ok(geometry.height>=44);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),"no horizontal overflow");
  await page.locator(".atlasAI .linkChip").click();
  await page.locator(".searchOverlay").waitFor({state:"hidden"});
  assert.ok(new URL(page.url()).searchParams.get("who")==="rick-grimes","citation opens actual Atlas entity");
  await page.keyboard.press("Escape");
  await page.getByRole("button",{name:"Search the atlas",exact:true}).click();
  await input.fill("Alexandria");
  await page.locator(".searchGroup .row").first().waitFor();
  await input.press("Enter");
  await page.locator(".searchOverlay").waitFor({state:"hidden"});
  assert.equal(new URL(page.url()).searchParams.get("place"),"alexandria","ordinary Enter search works");
  await page.keyboard.press("Escape");
  if(width===390){
   await page.getByRole("button",{name:"Search the atlas",exact:true}).click();await input.fill("Rick");
   mode="budget";await page.getByRole("button",{name:"Ask Atlas",exact:true}).click();await page.getByRole("alert").waitFor();
   assert.ok((await page.getByRole("alert").textContent()).includes("$10"));
   assert.ok(await page.locator(".searchGroup .row").count()>0,"ordinary results survive budget error");
   mode="pending";await input.fill("Who is Rick?");await page.getByRole("button",{name:"Ask Atlas",exact:true}).click();
   while(!pending)await new Promise(r=>setTimeout(r,10));
   await input.fill("Hilltop");
   await pending.fulfill({json:{ok:true,answer:"STALE RESPONSE",citations:[],model:"test"}}).catch(()=>{});
   pending=null;await page.waitForTimeout(100);
   assert.ok(!(await page.locator(".atlasAI").textContent()).includes("STALE RESPONSE"),"query change discards stale answer");
   await page.keyboard.press("Escape");mode="answer";
  }
  console.log(`PASS Ask Atlas answer, citation, and ordinary search at ${width}×${height}`);
  await page.close();calls=0;
 }
 assert.deepEqual(errors,[]);
 console.log("PASS no browser errors, no requests on typing, budget fallback, and cancellation");
}finally{await browser.close();}


