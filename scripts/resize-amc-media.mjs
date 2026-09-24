#!/usr/bin/env node
/**
 * Generate resized WebP copies of every AMC image the atlas references.
 *
 * AMC's CDN (images.cds.amcn.com) ignores resize parameters and serves every
 * asset at source size (~1.3 MB 3200px hero art), and that art is the image
 * behind every series fallback and many heroes. Fandom sources are resized on
 * request by Fandom's own CDN (see fandomScaled in src/lib/media.ts), so only
 * AMC needs local derivatives.
 *
 * Output: public/media/amc/<hash>-<width>.webp and src/generated/media-local.json
 * ({ sourceUrl: { "<width>": "/media/amc/..." } }), which atlasImageUrl /
 * atlasImageSrcSet read. The original URL stays the canonical source for
 * provenance and credits.
 *
 * Resizing runs in headless Chromium (Playwright devDependency) so the repo
 * needs no native image library:
 *   npx playwright install chromium   # once
 *   npm run media:resize
 */
import {createHash} from "node:crypto";
import {mkdir,readFile,writeFile,stat} from "node:fs/promises";

const WIDTHS=(process.env.AMC_WIDTHS||"320,640,1280").split(",").map(Number);
const QUALITY=Number(process.env.AMC_QUALITY||0.78);
const OUT_DIR="public/media/amc";
const INDEX_FILE="src/generated/media-local.json";
const isAmc=(u)=>/^https?:\/\/(?:images|dimages)\.cds\.amcn\.com\//i.test(u||"");

const media=JSON.parse(await readFile("data/media.json","utf8"));
const episodeMedia=JSON.parse(await readFile("data/episodeMedia.json","utf8"));
const sources=new Set();
for(const group of ["series","characters","places","episodes"])for(const v of Object.values(media[group]||{}))for(const u of [v.image,v.keyArt,...(v.gallery||[])])if(isAmc(u))sources.add(u);
for(const v of Object.values(episodeMedia.episodes||{}))for(const u of [v.image,...(v.gallery||[])])if(isAmc(u))sources.add(u);

let chromium;
try{({chromium}=await import("playwright"))}catch{console.error("playwright is required (devDependency). Run `npm install` then `npx playwright install chromium`.");process.exit(2)}
const browser=await chromium.launch(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{});
const page=await browser.newPage();
await page.setContent("<!doctype html><title>resize</title>");

const index=JSON.parse(await readFile(INDEX_FILE,"utf8").catch(()=>"{}"));
await mkdir(OUT_DIR,{recursive:true});
const exists=async(p)=>{try{await stat(p);return true}catch{return false}};
let made=0,skipped=0,failed=0,bytesIn=0,bytesOut=0;

for(const source of sources){
 const key=createHash("sha256").update(source).digest("hex").slice(0,16);
 const entry={};
 const targets=WIDTHS.map(w=>({w,file:`${OUT_DIR}/${key}-${w}.webp`,url:`/media/amc/${key}-${w}.webp`}));
 if((await Promise.all(targets.map(t=>exists(t.file)))).every(Boolean)){
  for(const t of targets)entry[t.w]=t.url;
  index[source]=entry;skipped++;continue;
 }
 try{
  const res=await fetch(source,{headers:{"user-agent":"TWDU-Atlas-media-resize/1.0",referer:"https://www.amc.com/"},signal:AbortSignal.timeout(30000)});
  if(!res.ok)throw new Error(res.status+" "+res.statusText);
  const bytes=Buffer.from(await res.arrayBuffer());
  bytesIn+=bytes.length;
  const outputs=await page.evaluate(async({b64,widths,quality})=>{
   const blob=await (await fetch("data:application/octet-stream;base64,"+b64)).blob();
   const bitmap=await createImageBitmap(blob);
   const out=[];
   for(const w of widths){
    const width=Math.min(w,bitmap.width),height=Math.round(bitmap.height*width/bitmap.width);
    const canvas=new OffscreenCanvas(width,height);
    const ctx=canvas.getContext("2d");ctx.imageSmoothingQuality="high";ctx.drawImage(bitmap,0,0,width,height);
    const webp=await canvas.convertToBlob({type:"image/webp",quality});
    const buf=new Uint8Array(await webp.arrayBuffer());
    let bin="";for(let i=0;i<buf.length;i+=0x8000)bin+=String.fromCharCode(...buf.subarray(i,i+0x8000));
    out.push({w,b64:btoa(bin)});
   }
   return out;
  },{b64:bytes.toString("base64"),widths:WIDTHS,quality:QUALITY});
  for(const o of outputs){
   const t=targets.find(x=>x.w===o.w);
   const buf=Buffer.from(o.b64,"base64");bytesOut+=buf.length;
   await writeFile(t.file,buf);entry[o.w]=t.url;
  }
  index[source]=entry;made++;
 }catch(error){
  failed++;console.warn("resize failed:",source,String(error?.message||error));
 }
}
await browser.close();
await writeFile(INDEX_FILE,JSON.stringify(Object.fromEntries(Object.entries(index).sort()),null,1)+"\n");
console.log(JSON.stringify({sources:sources.size,resized:made,alreadyPresent:skipped,failed,downloadedMB:+(bytesIn/1e6).toFixed(1),writtenMB:+(bytesOut/1e6).toFixed(1)}));
process.exit(failed?1:0);
