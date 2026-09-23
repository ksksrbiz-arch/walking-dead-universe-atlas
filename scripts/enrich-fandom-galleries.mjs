#!/usr/bin/env node
/**
 * Exhaustive Fandom media discovery for the TWDU Atlas.
 *
 * Crawls Fandom gallery categories and gallery pages, extracts every
 * MediaWiki image/file reference it can resolve, and preserves source-page
 * provenance. This is a media inventory; promotion into canonical entities
 * remains a separate, conservative step.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";

const API="https://walkingdead.fandom.com/api.php";
const WIKI="https://walkingdead.fandom.com/wiki/";
const ROOT=new URL("../",import.meta.url);
const OUT_DIR=new URL("data/enrichment/",ROOT);
const RETRIES=Number(process.env.FANDOM_REQUEST_RETRIES||4);
const DELAY=Number(process.env.FANDOM_REQUEST_DELAY_MS||100);
const CONCURRENCY=Number(process.env.FANDOM_GALLERY_CONCURRENCY||4);

const CATEGORIES=[
  "Category:Galleries",
  "Category:Character Galleries",
  "Category:Location Galleries",
  "Category:Episode Gallery",
  "Category:TV Series Galleries",
  "Category:Fear the Walking Dead Galleries",
  "Category:World Beyond Galleries",
  "Category:Tales of the Walking Dead Galleries",
  "Category:Dead City Galleries",
  "Category:Daryl Series Galleries",
  "Category:The Ones Who Live Galleries",
  "Category:Webisode Galleries"
];
const SPECIAL_PAGES=["Promo Pictures","Cover Gallery"];

const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));

async function fetchJson(url){
  let last;
  for(let attempt=1;attempt<=RETRIES;attempt++){
    try{
      const res=await fetch(url,{headers:{
        accept:"application/json",
        "user-agent":"TWDU-Atlas-Fandom-Gallery-Ingest/1.0 (+https://github.com/ksksrbiz-arch/walking-dead-universe-atlas)",
        "accept-language":"en-US,en;q=0.8"
      },signal:AbortSignal.timeout(30000)});
      const text=await res.text();
      if(!res.ok){
        const retryable=res.status===408||res.status===425||res.status===429||res.status>=500;
        if(!retryable||attempt===RETRIES) throw new Error(res.status+" "+res.statusText);
        await sleep(Math.min(10000,750*2**(attempt-1))); continue;
      }
      return JSON.parse(text);
    }catch(e){
      last=e;
      if(attempt<RETRIES) await sleep(Math.min(10000,750*2**(attempt-1)));
    }
  }
  throw last||new Error("Fandom request failed");
}

async function categoryMembers(category){
  const rows=[]; let cont=null;
  do{
    const p=new URLSearchParams({action:"query",list:"categorymembers",cmtitle:category,cmnamespace:"0",cmtype:"page",cmlimit:"500",format:"json",formatversion:"2"});
    if(cont)p.set("cmcontinue",cont);
    const data=await fetchJson(API+"?"+p);
    rows.push(...(data?.query?.categorymembers||[]));
    cont=data?.continue?.cmcontinue||null;
  }while(cont);
  return rows;
}

async function pageBatch(pageIds){
  if(!pageIds.length)return [];
  const p=new URLSearchParams({
    action:"query",pageids:pageIds.join("|"),prop:"info|revisions",
    inprop:"url",rvprop:"ids|timestamp|content",rvslots:"main",
    redirects:"1",format:"json",formatversion:"2"
  });
  const data=await fetchJson(API+"?"+p);
  return (data?.query?.pages||[]).filter(x=>!x.missing);
}

function clean(value){
  return String(value||"").replace(/<!--[\s\S]*?-->/g," ").replace(/<ref(?: [^>]*)?>[\s\S]*?<\/ref>/gi," ").replace(/<[^>]+>/g," ").trim();
}

function extractFileTitles(text){
  const out=new Set();
  const add=(raw)=>{
    const title=String(raw||"").trim().replace(/_/g," ");
    if(title) out.add("File:"+title);
  };
  for(const m of String(text||"").matchAll(/\[\[(?:File|Image):([^\]|]+)(?:\|[^\]]*)?\]\]/gi)) add(m[1]);
  for(const m of String(text||"").matchAll(/<gallery[^>]*>([\s\S]*?)<\/gallery>/gi)){
    for(const line of m[1].split(/\r?\n/)){
      const value=line.trim().replace(/^File:/i,"").replace(/^Image:/i,"").split("|")[0].trim();
      if(value&&!/^<!--/.test(value)&&!/^#/.test(value)) add(value);
    }
  }
  return [...out];
}

function extractDirectUrls(text){
  const out=new Set();
  for(const m of String(text||"").matchAll(/https?:\/\/[^\s\]<>|}]+/gi)){
    const u=m[0].replace(/[),.;]+$/,"");
    if(/\.(?:jpe?g|png|webp|gif|avif)(?:[?#].*)?$/i.test(u))out.add(u);
  }
  return [...out];
}

async function imageInfo(titles){
  const out=[];
  for(let i=0;i<titles.length;i+=50){
    const chunk=titles.slice(i,i+50);
    const p=new URLSearchParams({
      action:"query",titles:chunk.join("|"),prop:"imageinfo",
      iiprop:"url|size|mime|extmetadata",iiurlwidth:"1800",
      redirects:"1",format:"json",formatversion:"2"
    });
    const data=await fetchJson(API+"?"+p);
    for(const page of data?.query?.pages||[]){
      const info=page.imageinfo?.[0];
      if(!info?.url||!/^image\//i.test(String(info.mime||"")))continue;
      out.push({
        title:page.title,
        url:info.url,
        thumbnail:info.thumburl||null,
        width:info.width||null,
        height:info.height||null,
        mime:info.mime||null,
        descriptionUrl:page.fullurl||WIKI+encodeURIComponent(String(page.title||"").replaceAll(" ","_"))
      });
    }
    if(i+50<titles.length)await sleep(DELAY);
  }
  return out;
}

async function mapConcurrent(items,worker){
  const results=new Array(items.length); let cursor=0;
  async function run(){while(true){const i=cursor++;if(i>=items.length)return;try{results[i]=await worker(items[i],i)}catch(e){results[i]={error:e?.message||String(e),item:items[i]}}}}
  await Promise.all(Array.from({length:Math.min(CONCURRENCY,Math.max(1,items.length))},run));
  return results;
}

async function main(){
  await mkdir(OUT_DIR,{recursive:true});
  const categoryRows=await mapConcurrent(CATEGORIES,async(category)=>{
    const rows=await categoryMembers(category);
    return {category,rows};
  });

  const galleryPages=new Map();
  for(const result of categoryRows){
    if(result?.error)continue;
    for(const page of result.rows||[]){
      if(!/\/Gallery$/i.test(page.title)&&!/^Promo Pictures$/i.test(page.title)&&!/^Cover Gallery$/i.test(page.title))continue;
      const key=String(page.pageid);
      const existing=galleryPages.get(key);
      galleryPages.set(key,{page,categories:[...(existing?.categories||[]),result.category]});
    }
  }
  for(const title of SPECIAL_PAGES){
    const p=new URLSearchParams({action:"query",titles:title,prop:"info",inprop:"url",format:"json",formatversion:"2"});
    const data=await fetchJson(API+"?"+p);
    const page=(data?.query?.pages||[])[0];
    if(page&&!page.missing)galleryPages.set(String(page.pageid),{page,categories:["special"]});
  }

  const ids=[...galleryPages.keys()];
  const batches=[];
  for(let i=0;i<ids.length;i+=50)batches.push(ids.slice(i,i+50));
  const pages=[];
  const batchResults=await mapConcurrent(batches,async(idsBatch)=>pageBatch(idsBatch));
  for(const result of batchResults)if(Array.isArray(result))pages.push(...result);

  const records=[];
  for(const page of pages){
    const revision=page.revisions?.[0];
    const wikitext=revision?.slots?.main?.content||"";
    const fileTitles=extractFileTitles(wikitext);
    let files=[];
    try{files=await imageInfo(fileTitles)}catch(e){files=[];}
    const direct=extractDirectUrls(wikitext);
    records.push({
      sourceId:"walking-dead-wiki",
      sourceRecordId:String(page.pageid),
      sourceUrl:page.fullurl||page.canonicalurl||WIKI+encodeURIComponent(String(page.title).replaceAll(" ","_")),
      title:page.title,
      retrievedAt:new Date().toISOString(),
      categories:galleryPages.get(String(page.pageid))?.categories||[],
      revisionId:revision?.revid||page.lastrevid||null,
      revisionTimestamp:revision?.timestamp||null,
      media:files,
      directUrls:direct
    });
  }

  const mediaCount=records.reduce((n,r)=>n+r.media.length+r.directUrls.length,0);
  const unique=new Set(records.flatMap(r=>[...r.media.map(x=>x.url),...r.directUrls]));
  const result={
    version:1,
    source:"walking-dead-wiki",
    generatedAt:new Date().toISOString(),
    categories:CATEGORIES,
    specialPages:SPECIAL_PAGES,
    galleryPages:records.length,
    mediaReferences:mediaCount,
    uniqueMediaUrls:unique.size,
    records
  };
  await writeFile(new URL("fandom-gallery-media.json",OUT_DIR),JSON.stringify(result,null,2)+"\n");
  await writeFile(new URL("fandom-gallery-media-summary.json",OUT_DIR),JSON.stringify({
    generatedAt:result.generatedAt,galleryPages:records.length,mediaReferences:mediaCount,uniqueMediaUrls:unique.size,
    categories:CATEGORIES
  },null,2)+"\n");
  console.log(JSON.stringify({galleryPages:records.length,mediaReferences:mediaCount,uniqueMediaUrls:unique.size},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1});
