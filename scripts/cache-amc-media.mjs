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
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),20000);
  try{
    const response=await fetch(source,{
      headers:{
        "user-agent":"TWDU-Atlas-media-cache/1.0",
        accept:"image/avif,image/webp,image/jpeg,image/png,*/*;q=0.8",
        referer:"https://www.amc.com/"
      },
      signal:controller.signal
    });
    if(!response.ok)throw new Error(`${response.status} ${response.statusText}`);
    const type=response.headers.get("content-type")||"";
    if(!type.startsWith("image/"))throw new Error(`unexpected content-type ${type||"unknown"}`);
    const bytes=Buffer.from(await response.arrayBuffer());
    if(bytes.length<512)throw new Error("image response is unexpectedly small");
    return {bytes,ext:extension(source,type)};
  }finally{
    clearTimeout(timeout);
  }
}

async function main(){
  const media=JSON.parse(await readFile(MEDIA_FILE,"utf8"));
  const episodeMedia=JSON.parse(await readFile(EPISODE_MEDIA_FILE,"utf8"));
  const sources=new Set();

  for(const item of Object.values(media.series??{})){
    if(item?.keyArt) sources.add(item.keyArt);
  }
  for(const item of Object.values(media.places??{})){
    if(item?.image) sources.add(item.image);
  }
  for(const item of Object.values(media.characters??{})){
    if(item?.image) sources.add(item.image);
  }
  for(const item of Object.values(media.episodes??{})){
    if(item?.image) sources.add(item.image);
  }
  for(const item of Object.values(episodeMedia.episodes??{})){
    if(item?.image) sources.add(item.image);
  }

  await mkdir(OUTPUT_DIR,{recursive:true});
  await mkdir(path.dirname(INDEX_FILE),{recursive:true});

  let existing={};
  try{existing=JSON.parse(await readFile(INDEX_FILE,"utf8"));}catch{}

  const local={...existing};
  let downloaded=0, reused=0, failed=0;

  for(const source of sources){
    if(!/^https:\/\//i.test(source))continue;
    const key=keyFor(source);
    const known=local[source];
    if(known){
      try{
        await access(path.join(".",known.replace(/^\//,"")));
        reused++;
        continue;
      }catch{}
    }

    try{
      const result=await fetchMedia(source);
      const relative=`/media-cache/${key}.${result.ext}`;
      const outputPath=path.join(".",relative.replace(/^\//,""));
      await mkdir(path.dirname(outputPath),{recursive:true});
      await writeFile(outputPath,result.bytes);
      local[source]=relative;
      downloaded++;
      console.log(`Cached media: ${source} -> ${relative}`);
      await sleep(50);
    }catch(error){
      failed++;
      console.warn(`Media cache failed: ${source} — ${error?.message||error}`);
    }
  }

  await writeFile(INDEX_FILE,JSON.stringify(local,null,2)+"\n");
  console.log(`Media cache complete: ${Object.keys(local).length} mapped, ${downloaded} downloaded, ${reused} reused, ${failed} unavailable.`);
}

main().catch(error=>{
  console.error("Media cache failed:",error);
  process.exit(1);
});
