import {chromium} from "playwright";
import assert from "node:assert/strict";
const url=process.argv[2];
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 await page.route(/supabase|wikia|amcn|_vercel|vercel-insights/,r=>r.abort());
 await page.goto(url,{waitUntil:"domcontentloaded"});
 await page.getByRole("button",{name:"Search the atlas",exact:true}).click();
 const input=page.locator(".searchBar input");
 await input.fill("Who is Rick Grimes?");
 const response=page.waitForResponse(r=>r.url().endsWith("/ask")&&r.request().method()==="POST");
 await page.getByRole("button",{name:"Ask Atlas",exact:true}).click();
 const r=await response;const data=await r.json();assert.equal(r.status(),200,JSON.stringify(data));
 await page.locator(".atlasAIAnswer").waitFor();assert.ok(data.citations.some(c=>c.id==="rick-grimes"));
 await page.screenshot({path:"work/live-atlas-ai.png"});
 await page.locator(".atlasAI").getByRole("button",{name:"Rick Grimes",exact:true}).click();
 await page.locator(".searchOverlay").waitFor({state:"hidden"});
 assert.equal(new URL(page.url()).searchParams.get("who"),"rick-grimes");
 assert.deepEqual(errors,[]);
 console.log("PASS live "+new URL(url).host+": Mistral answer, browser CORS, supporting record navigation, no runtime errors");
}finally{await browser.close();}

