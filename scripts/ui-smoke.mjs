#!/usr/bin/env node
// Browser regression for the mobile map contract and the core UI loop.
//
//   npx playwright install chromium        # once per machine
//   npm run build && npx vite preview --port 4173 &
//   npm run test:ui [-- baseUrl]
//
// Playwright is a devDependency. To use an already-installed Chromium instead
// of downloading one, set CHROMIUM_PATH=/path/to/chromium.
//
// Uses real touch input (CDP Input.dispatchTouchEvent) on a phone viewport so
// pan / pinch / tap go through the same pointer path a device would. It is not
// a substitute for a physical-device check (docs/MOBILE_MAP_GESTURE_ARCHITECTURE.md).
let chromium;
try{({chromium}=await import("playwright"))}catch{console.error("playwright is not installed. Run `npm install` (it is a devDependency), then `npx playwright install chromium`.");process.exit(2)}

// Independent re-derivation of the app's projection (src/App.tsx) so marker
// positions can be checked against geography, not against the DOM itself.
const {geoEqualEarth}=await import("d3-geo");
const {readFile}=await import("node:fs/promises");
const projection=geoEqualEarth().fitExtent([[24,22],[976,578]],{type:"Sphere"});
const locations=JSON.parse(await readFile(new URL("../data/locations.json",import.meta.url),"utf8"));

const BASE=process.argv[2]||process.env.ATLAS_URL||"http://localhost:4173/";
const results=[];
const check=(name,ok,detail="")=>{results.push({name,ok,detail});console.log(`${ok?"PASS":"FAIL"}  ${name}${detail?"  — "+detail:""}`)};

const browser=await chromium.launch(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{});
const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
const page=await ctx.newPage();
const errors=[];
page.on("pageerror",e=>errors.push(e.message));
await page.route(/supabase|wikia|amcn|_vercel|vercel-insights/,r=>r.abort());
await page.goto(BASE,{waitUntil:"networkidle"}).catch(()=>{});
await page.waitForTimeout(900);
const cdp=await ctx.newCDPSession(page);

const state=()=>page.evaluate(()=>{
 const svg=document.querySelector(".mapSurface svg");
 const world=document.querySelector(".mapWorld");
 const m=/translate\(([-\d.e]+) ([-\d.e]+)\) scale\(([-\d.e]+)\)/.exec(world?.getAttribute("transform")||"");
 return {
  svgTransform:(svg?.getAttribute("transform")||"")+"|"+getComputedStyle(svg).transform,
  surfaceTransform:getComputedStyle(document.querySelector(".mapSurface")).transform,
  oceanOutsideWorld:!!svg?.querySelector(":scope > rect[fill='url(#ocean)']")&&!world?.querySelector("rect[fill='url(#ocean)']"),
  tx:m?Number(m[1]):NaN,ty:m?Number(m[2]):NaN,zoom:m?Number(m[3]):NaN,
  detail:!!document.querySelector("[data-detail-open]")
 };
});
const touch=async(type,points)=>cdp.send("Input.dispatchTouchEvent",{type,touchPoints:points.map((p,i)=>({x:p[0],y:p[1],id:i}))});
const drag=async(from,to,steps=12)=>{
 await touch("touchStart",[from]);
 for(let i=1;i<=steps;i++)await touch("touchMove",[[from[0]+(to[0]-from[0])*i/steps,from[1]+(to[1]-from[1])*i/steps]]);
 await touch("touchEnd",[]);await page.waitForTimeout(250);
};
const pinch=async(c,d0,d1,steps=10)=>{
 const pts=d=>[[c[0]-d/2,c[1]],[c[0]+d/2,c[1]]];
 await touch("touchStart",pts(d0));
 for(let i=1;i<=steps;i++)await touch("touchMove",pts(d0+(d1-d0)*i/steps));
 await touch("touchEnd",[]);await page.waitForTimeout(250);
};

// 1. Rendering contract
let s=await state();
check("root SVG is not transformed",!/matrix|translate|scale/.test(s.svgTransform.replace("none","")),s.svgTransform);
check(".mapSurface is not transformed",s.surfaceTransform==="none",s.surfaceTransform);
check("ocean background sits outside .mapWorld",s.oceanOutsideWorld);
check("home view is framed (finite transform)",Number.isFinite(s.tx)&&s.zoom>=1,JSON.stringify(s));
const home=s;
const mid=[195,360];

// 2. One-finger pan at base zoom, both directions
await drag(mid,[mid[0]+300,mid[1]]);
const right=await state();
check("one-finger pan moves the world",Math.abs(right.tx-home.tx)>5,`dx=${(right.tx-home.tx).toFixed(1)}`);
await drag(mid,[mid[0]-360,mid[1]]);await drag(mid,[mid[0]-360,mid[1]]);await drag(mid,[mid[0]-360,mid[1]]);
const east=await state();
check("can traverse east toward Europe/Asia",east.tx<home.tx-100,`tx ${home.tx.toFixed(0)} -> ${east.tx.toFixed(0)}`);
await drag(mid,[mid[0]+360,mid[1]]);await drag(mid,[mid[0]+360,mid[1]]);await drag(mid,[mid[0]+360,mid[1]]);await drag(mid,[mid[0]+360,mid[1]]);
const west=await state();
check("can traverse back west to North America",west.tx>east.tx+100,`tx ${east.tx.toFixed(0)} -> ${west.tx.toFixed(0)}`);

// 3. Pinch zoom 1x..5x
await pinch(mid,80,260);
const zoomed=await state();
check("pinch zooms in",zoomed.zoom>west.zoom*1.5,`zoom ${west.zoom.toFixed(2)} -> ${zoomed.zoom.toFixed(2)}`);
await pinch(mid,60,340);await pinch(mid,60,340);
const maxed=await state();
check("pinch clamps at 5x",maxed.zoom<=5.0001&&maxed.zoom>=4,`zoom ${maxed.zoom.toFixed(2)}`);
await drag(mid,[mid[0]+120,mid[1]+80]);
const zpan=await state();
check("pan works while zoomed",Math.abs(zpan.tx-maxed.tx)>5||Math.abs(zpan.ty-maxed.ty)>5);
await pinch(mid,340,40);await pinch(mid,340,40);await pinch(mid,340,40);
const out=await state();
check("pinch back out clamps at 1x",Math.abs(out.zoom-1)<.001,`zoom ${out.zoom.toFixed(3)}`);

// 4. Reset
await page.click("button[aria-label='Reset map to home']");await page.waitForTimeout(900);
s=await state();
check("reset restores home framing",Math.abs(s.tx-home.tx)<2&&Math.abs(s.ty-home.ty)<2&&Math.abs(s.zoom-home.zoom)<.01,`${s.tx.toFixed(1)},${s.ty.toFixed(1)}@${s.zoom.toFixed(2)} vs ${home.tx.toFixed(1)},${home.ty.toFixed(1)}@${home.zoom.toFixed(2)}`);

// 5. Drag that starts on a marker must not select it; a tap must.
const target=await page.evaluate(()=>{const el=[...document.querySelectorAll(".marker,.markerCluster")].map(e=>({e,r:e.getBoundingClientRect()})).find(x=>x.r.top>200&&x.r.top<600&&x.r.left>20&&x.r.left<320);if(!el)return null;return [el.r.left+el.r.width/2,el.r.top+el.r.height/2,el.e.classList.contains("marker")]});
if(target){
 await drag([target[0],target[1]],[target[0]+60,target[1]+40],8);
 s=await state();
 check("drag starting on a marker does not select it",!s.detail&&!(await page.$(".clusterSheet")));
 await page.click("button[aria-label='Reset map to home']");await page.waitForTimeout(900);
 const t2=await page.evaluate(()=>{const el=[...document.querySelectorAll(".marker,.markerCluster")].map(e=>({e,r:e.getBoundingClientRect()})).find(x=>x.r.top>200&&x.r.top<600&&x.r.left>20&&x.r.left<320);return el?[el.r.left+el.r.width/2,el.r.top+el.r.height/2,el.e.classList.contains("marker")]:null});
 const before=await state();
 await touch("touchStart",[[t2[0],t2[1]]]);await touch("touchEnd",[]);await page.waitForTimeout(900);
 s=await state();
 check("tapping a marker/cluster acts on it",t2[2]?s.detail:(s.zoom>before.zoom+.05||!!(await page.$(".clusterSheet"))),`kind=${t2[2]?"marker":"cluster"} zoom ${before.zoom.toFixed(2)} -> ${s.zoom.toFixed(2)}`);
}else check("found a marker to tap",false);

// 6. Markers stay attached to geography: a known place projects to the same
// screen point as its marker after pan+zoom.
await page.keyboard.press("Escape");
await page.click(".searchTrigger");await page.waitForTimeout(150);await page.keyboard.type("Alexandria");await page.keyboard.press("Enter");await page.waitForTimeout(1100);
const pinned=await page.evaluate(()=>{const m=document.querySelector("[data-location-id='alexandria']");if(!m)return null;const r=m.querySelector(".markerBody").getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}});
const vis=await page.evaluate(()=>{const sheet=document.querySelector(".sheet").getBoundingClientRect();return {bottom:sheet.top}});
check("selected place is framed above the sheet",!!pinned&&pinned.y>100&&pinned.y<vis.bottom,JSON.stringify(pinned));
// Absolute position: project Alexandria's lat/lng, apply the live .mapWorld
// transform and the viewport's slice scaling, and compare with the marker.
const alex=locations.find(l=>l.id==="alexandria");
const [px,py]=projection([alex.lng,alex.lat]);
const expected=await page.evaluate(([px,py])=>{
 const svg=document.querySelector(".mapSurface svg"),r=svg.getBoundingClientRect();
 const m=/translate\(([-\d.e]+) ([-\d.e]+)\) scale\(([-\d.e]+)\)/.exec(document.querySelector(".mapWorld").getAttribute("transform"));
 const a=Number(m[1]),b=Number(m[2]),z=Number(m[3]),bs=Math.max(r.width/1000,r.height/600);
 const vx=a+z*(px-500),vy=b+z*(py-300);
 return {x:r.left+(r.width-1000*bs)/2+bs*vx,y:r.top+(r.height-600*bs)/2+bs*vy};
},[px,py]);
const err=pinned?Math.hypot(pinned.x-expected.x,pinned.y-expected.y):Infinity;
check("selected marker sits at its projected geographic position",err<1.5,`marker ${JSON.stringify(pinned)} vs projected ${JSON.stringify({x:+expected.x.toFixed(1),y:+expected.y.toFixed(1)})}, error ${err.toFixed(2)}px`);
s=await state();
check("selecting a place opens its detail",s.detail);

// Markers are attached to geography: a pan moves the selected marker by
// exactly the pan distance (it lives inside .mapWorld, not the viewport).
const markerAt=()=>page.evaluate(()=>{const r=document.querySelector("[data-location-id='alexandria'] .markerBody")?.getBoundingClientRect();return r?{x:r.left+r.width/2,y:r.top+r.height/2}:null});
const before=await markerAt();
await drag([200,180],[240,210],6);
const after=await markerAt();
const moved=before&&after?{dx:after.x-before.x,dy:after.y-before.y}:null;
check("selected marker stays attached to its projected position when the map pans",!!moved&&Math.abs(moved.dx-40)<1.5&&Math.abs(moved.dy-30)<1.5,JSON.stringify(moved));

// Picking a search result hands focus to the panel showing it.
await page.click(".searchTrigger");await page.waitForTimeout(150);await page.keyboard.type("Hilltop");await page.keyboard.press("Enter");await page.waitForTimeout(500);
const focusOnSheet=await page.evaluate(()=>document.activeElement?.classList.contains("sheet")&&!document.querySelector(".searchOverlay"));
check("picking a search result moves focus to the opened panel",focusOnSheet);
await page.keyboard.press("Escape");await page.waitForTimeout(300);

// Search dialog keeps focus inside and hands it back on dismiss.
await page.focus(".searchTrigger");await page.keyboard.press("Enter");await page.waitForTimeout(300);
for(let i=0;i<8;i++)await page.keyboard.press("Tab");
const trapped=await page.evaluate(()=>!!document.activeElement?.closest(".searchPanel"));
await page.keyboard.press("Escape");await page.waitForTimeout(200);
const returned=await page.evaluate(()=>document.activeElement?.classList.contains("searchTrigger"));
check("search dialog traps Tab and returns focus on Escape",trapped&&returned,`trapped=${trapped} returned=${returned}`);

// 7. Tabs render and data integrity surfaces in the UI
for(const [label,sel] of [["Timeline",".heatmap"],["People",".personCard"],["Watch",".watchHero"]]){
 await page.locator(".tabbar button",{hasText:label}).click();await page.waitForTimeout(500);
 check(`${label} tab renders`,!!(await page.$(sel)));
}
const watchCount=await page.evaluate(()=>document.querySelector(".watchHero b span")?.textContent||"");
check("watch order covers all 363 episodes",/363/.test(watchCount),watchCount.trim());
await page.click(".upNext .btn.primary");await page.waitForTimeout(300);
const pct=await page.evaluate(()=>document.querySelector(".watchHero b span")?.parentElement?.firstChild?.textContent?.trim());
check("marking up-next watched updates progress",pct==="1",`watched=${pct}`);
await page.reload({waitUntil:"networkidle"}).catch(()=>{});await page.waitForTimeout(700);
await page.locator(".tabbar button",{hasText:"Watch"}).click();await page.waitForTimeout(400);
const persisted=await page.evaluate(()=>document.querySelector(".watchHero b span")?.parentElement?.firstChild?.textContent?.trim());
check("watch progress persists across reload",persisted==="1",`watched=${persisted}`);

// 8. Sheet: drag the handle up expands, down collapses.
await page.locator(".tabbar button",{hasText:"Map"}).click();await page.waitForTimeout(500);
const h0=await page.evaluate(()=>document.querySelector(".sheet").getBoundingClientRect().height);
const grab=await page.evaluate(()=>{const r=document.querySelector(".grabber").getBoundingClientRect();return [r.left+r.width/2+80,r.top+r.height/2]});
await drag(grab,[grab[0],grab[1]-300],10);await page.waitForTimeout(400);
const h1=await page.evaluate(()=>document.querySelector(".sheet").getBoundingClientRect().height);
check("dragging the sheet up expands it",h1>h0+150,`${h0.toFixed(0)} -> ${h1.toFixed(0)}`);
const grab2=await page.evaluate(()=>{const r=document.querySelector(".grabber").getBoundingClientRect();return [r.left+r.width/2+80,r.top+r.height/2]});
await drag(grab2,[grab2[0],grab2[1]+500],10);await page.waitForTimeout(400);
const h2=await page.evaluate(()=>document.querySelector(".sheet").getBoundingClientRect().height);
check("dragging the sheet down collapses it",h2<h1-150,`${h1.toFixed(0)} -> ${h2.toFixed(0)}`);

// ---- Journeys, deep links, share paths ----------------------------------------
const glyph=await page.evaluate(()=>{const g=document.querySelector(".markerGlyph svg");return g?g.getBoundingClientRect().width:null});
check("marker icons render at marker size (nested svg not stretched)",glyph!=null&&glyph<40,String(glyph));
const url=(path)=>new URL(path,BASE).toString();
await page.goto(url("?j=daryl-dixon,carol-peletier"),{waitUntil:"networkidle"}).catch(()=>{});
await page.waitForTimeout(1400);
const jstate=()=>page.evaluate(()=>({
 banner:document.querySelector(".journeyBanner")?.textContent||"",
 legs:document.querySelectorAll(".journeyLeg").length,
 done:document.querySelectorAll(".journeyLeg.done,.journeyLeg.latest").length,
 avatars:document.querySelectorAll(".journeyAvatar").length,
 label:document.querySelector(".journeyNow small")?.textContent||"",
 place:document.querySelector(".journeyNow b")?.textContent||"",
 search:location.search,path:location.pathname
}));
let js=await jstate();
check("?j= deep link opens a two-character journey",/Daryl Dixon/.test(js.banner)&&/Carol Peletier/.test(js.banner)&&js.avatars===2,JSON.stringify(js.banner));
check("journey routes are drawn",js.legs>20&&js.done===js.legs,`${js.done}/${js.legs} legs`);
await page.locator(".journeyPlayer [aria-label='Previous stop']").first().click();await page.waitForTimeout(700);
const back1=await jstate();
check("stepping back moves the journey and records it in the URL",back1.label!==js.label&&/at=\d+/.test(back1.search)&&back1.done<js.done,`${js.label} -> ${back1.label} ${back1.search}`);
await page.locator(".journeyTrack").first().focus();await page.keyboard.press("Home");await page.waitForTimeout(600);
const start=await jstate();
check("journey track Home jumps to the first stop",/(Stop|Step) 1 of/.test(start.label)&&start.done<=2,start.label);
await page.locator(".journeyPlayer .playBtn").first().click();await page.waitForTimeout(3900);
const played=await jstate();
await page.locator(".journeyPlayer .playBtn").first().click();
check("playback advances in story order",played.label!==start.label&&played.done>start.done,`${start.label} -> ${played.label}`);
const reload=played.search;
await page.reload({waitUntil:"networkidle"}).catch(()=>{});await page.waitForTimeout(1400);
const restored=await jstate();
check("reloading the URL restores the same journey step",restored.label===played.label&&restored.search===reload,`${played.label} vs ${restored.label}`);
// Spoiler-safe: earlier checks marked exactly one episode watched.
await page.locator(".grabber").focus();await page.keyboard.press("Enter");await page.keyboard.press("Enter");await page.waitForTimeout(500);
await page.locator(".switchRow input").click();await page.waitForTimeout(700);
const safe=await page.evaluate(()=>({legs:document.querySelectorAll(".journeyLeg").length,note:document.querySelector(".switchRow small")?.textContent||""}));
check("spoiler-safe hides unwatched parts of the journey",safe.legs<js.legs&&/hidden/.test(safe.note),`${safe.legs} legs, "${safe.note}"`);
await page.locator(".switchRow input").click();await page.waitForTimeout(400);
await page.keyboard.press("Escape");await page.waitForTimeout(500);
js=await jstate();
check("Escape exits the journey and clears it from the URL",!js.banner&&!/j=/.test(js.search),js.search);
await page.goto(url("j/daryl-dixon"),{waitUntil:"networkidle"}).catch(()=>{});await page.waitForTimeout(1400);
js=await jstate();
check("/j/<id> share path opens the journey and normalises the URL",/Daryl Dixon/.test(js.banner)&&js.path==="/"&&/j=daryl-dixon/.test(js.search),`${js.path}${js.search}`);
await page.goto(url("?place=alexandria"),{waitUntil:"networkidle"}).catch(()=>{});await page.waitForTimeout(1200);
const placeTitle=await page.evaluate(()=>document.querySelector(".detailBarTitle b")?.textContent||"");
check("?place= deep link opens that place",placeTitle==="Alexandria",placeTitle);
check("no runtime errors",!errors.length,errors.join(" | "));

await browser.close();
const failed=results.filter(r=>!r.ok);
console.log(`\n${results.length-failed.length}/${results.length} checks passed`);
process.exit(failed.length?1:0);
