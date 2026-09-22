#!/usr/bin/env node
/**
 * Cache official AMC media locally during the Netlify build.
 *
 * Runtime image delivery previously depended on Netlify Image CDN proxying
 * third-party AMC hosts. That made every image a second remote dependency and
 * produced blank media surfaces when the proxy/source was unavailable.
 *
 * This build step keeps the original source URL for provenance, but downloads
 * each unique approved media source into public/media-cache and generates a
 * source -> local path index consumed by src/lib/media.ts.
 */
import {createHash} from "node:crypto";
import {mkdir,readFile,writeFile,access} from "node:fs/promises";
import path from "node:path";

const MEDIA_FILE="data/media.json";
const EPISODE_MEDIA_FILE="data/episodeMedia.json";
const OUTPUT_DIR="public/media-cache";
const INDEX_FILE="src/generated/media-local.json";

const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const REQUEST_RETRIES=Number(process.env.MEDIA_CACHE_RETRIES||2);
const REQUEST_DELAY_MS=Number(process.env.MEDIA_CACHE_DELAY_MS||75);
const MAX_FAILURE_LOGS=Number(process.env.MEDIA_CACHE_MAX_FAILURE_LOGS||40);

function extension(url,contentType=""){
  const pathname=new URL(url).pathname.toLowerCase();
  const match=pathname.match(/\.(avif|webp|png|jpe?g|gif)$/);
  if(match)return match[1]==="jpeg"?"jpg":match[1];
  if(contentType.includes("avif"))return "avif";
  if(contentType.includes("webp"))return "webp";
  if(contentType.includes("png"))return "png";
  return "jpg";
}

function keyFor(source){
  return createHash("sha256").update(source).digest("hex").slice(0,24);
}

async function fetchMedia(source){
  let lastError=null;
  for(let attempt=1;attempt<=REQUEST_RETRIES;attempt+=1){
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),20000);
    try{
      const response=await fetch(source,{headers:{"user-agent":"TWDU-Atlas-media-cache/2.0",accept:"image/avif,image/webp,image/jpeg,image/png,*/*;q=0.8",referer:"https://www.amc.com/"},signal:controller.signal});
      const type=response.headers.get("content-type")||"";
      if(!response.ok){lastError=new Error(response.status+" "+response.statusText); const retryable=response.status===408||response.status===425||response.status===429||response.status>=500; if(!retryable||attempt===REQUEST_RETRIES) break; await sleep(Math.min(5000,500*2**(attempt-1))); continue;}
      if(!type.startsWith("image/"))throw new Error("unexpected content-type "+(type||"unknown"));
      const bytes=Buffer.from(await response.arrayBuffer());
      if(bytes.length<512)throw new Error("image response is unexpectedly small");
      return {bytes,ext:extension(source,type)};
    }catch(error){lastError=error;if(attempt<REQUEST_RETRIES)await sleep(Math.min(5000,500*2**(attempt-1)));}finally{clearTimeout(timeout);}
  }
  throw lastError||new Error("media request failed");
}
