#!/usr/bin/env node
/**
 * Exhaustive AMC TWDU media inventory.
 *
 * This does not replace the canonical AMC episode manifest. It inventories
 * official AMC show/episode/blog pages and every image URL exposed in their
 * HTML, preserving page provenance for later entity-level promotion.
 */
import {mkdir,readFile,writeFile} from "node:fs/promises";

const BASE="https://www.amc.com";
const SITEMAPS=[BASE+"/sitemap.xml",BASE+"/sitemap_index.xml",BASE+"/sitemap-index.xml",BASE+"/sitemap/sitemap.xml"];
const OUT=new URL("../data/enrichment/",import.meta.url);
const RETRIES=Number(process.env.AMC_REQUEST_RETRIES||3);
const DELAY=Number(process.env.AMC_REQUEST_DELAY_MS||75);
const CONCURRENCY=Number(process.env.AMC_MEDIA_CONCURRENCY||4);
const TERMS=[
  "walking-dead","walking dead","fear-the-walking-dead","fear the walking dead",
  "world-beyond","world beyond","daryl-dixon","daryl dixon","dead-city","dead city",
  "ones-who-live","ones who live","rick-michonne","rick and michonne","rick-michonne"
];

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function fetchText(url){
  let last;
  for(let a=1;a<=RETRIES;a++){
    try{
      const r=await fetch(url,{headers:{
        accept:"text/html,application/xml,text/xml;q=0.9,*/*;q=0.8",
        "user-agent":"TWDU-Atlas-AMC-Media-Ingest/1.0 (+https://github.com/ksksrbiz-arch/walking-dead-universe-atlas)"
      },signal:AbortSignal.timeout(30000)});
      if(!r.ok){
        const retryable=r.status===408||r.status===425||r.status===429||r.status>=500;
        if(!retryable||a===RETRIES)throw new Error(r.status+" "+r.statusText);
        await sleep(Math.min(8000,500*2**(a-1)));continue;
      }
      return await r.text();
    }catch(e){last=e;if(a<RETRIES)await sleep(Math.min(8000,500*2**(a-1)));}
  }
  throw last||new Error("AMC request failed");
}
function urlsFromXml(xml){
  return [...String(xml||"").matchAll(/<loc>\s*(.*?)\s*<\/loc>/gis)].map(m=>m[1].trim());
}
async function sitemapTree(root,seen=new Set()){
  if(seen.has(root))return[];seen.add(root);
  let xml;try{xml=await fetchText(root)}catch{return[]}
  const entries=urlsFromXml(xml),out=[];
  for(const u of entries){
    if(/\.xml(?:\?|$)/i.test(u))out.push(...await sitemapTree(u,seen));
    else out.push(u);
  }
  return out;
}
function relevant(url){
  const s=String(url).toLowerCase();
  return TERMS.some(t=>s.includes(t.replace(/\s+/g,"-"))||s.includes(t));
}
function absolute(value){
  try{return new URL(value,BASE).href}catch{return null}
}
function extractImages(html){
  const out=new Set();
  const add=v=>{const u=absolute(String(v||"").trim());if(u&&/^https?:\/\/www\.amc\.com\/|^https?:\/\/images\./i.test(u))out.add(u)};
  for(const m of String(html||"").matchAll(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image|twitter:image:src)["'][^>]+content=["']([^"']+)["']/gi))add(m[1]);
  for(const m of String(html||"").matchAll(/<img[^>]+(?:src|data-src|data-original)=["']([^"']+)["']/gi))add(m[1]);
  for(const m of String(html||"").matchAll(/<img[^>]+srcset=["']([^"']+)["']/gi)){
    for(const item of m[1].split(","))add(item.trim().split(/\s+/)[0]);
  }
  for(const m of String(html||"").matchAll(/https?:\/\/[^"'<>()\s]+/gi)){
    const u=m[0].replace(/[),.;]+$/,"");
    if(/\.(?:jpe?g|png|webp|gif)(?:[?#].*)?$/i.test(u))add(u);
  }
  return [...out];
}
function classify(url,pageUrl,html){
  const s=(pageUrl+" "+html.slice(0,10000)).toLowerCase();
  if(s.includes("/episodes/"))return "episode";
  if(s.includes("/shows/"))return "series";
  if(s.includes("/blogs/"))return "editorial";
  return "other";
}
async function mapConcurrent(items,worker){
  const out=new Array(items.length);let cursor=0;
  async function run(){while(true){const i=cursor++;if(i>=items.length)return;try{out[i]=await worker(items[i],i)}catch(e){out[i]={error:e?.message||String(e),url:items[i]}}}}
  await Promise.all(Array.from({length:Math.min(CONCURRENCY,Math.max(1,items.length))},run));
  return out;
}
async function main(){
  await mkdir(OUT,{recursive:true});
  const all=new Set();
  for(const sitemap of SITEMAPS)for(const u of await sitemapTree(sitemap))if(relevant(u))all.add(u);
  const urls=[...all];
  const results=await mapConcurrent(urls,async(url)=>{
    const html=await fetchText(url);
    const images=extractImages(html);
    return {sourceId:"amc",sourceUrl:url,pageType:classify(url,url,html),retrievedAt:new Date().toISOString(),images};
  });
  const records=results.filter(x=>x&&!x.error);
  const unique=new Set(records.flatMap(x=>x.images));
  const result={version:1,source:"amc",generatedAt:new Date().toISOString(),pagesDiscovered:urls.length,pagesFetched:records.length,uniqueMediaUrls:unique.size,records};
  await writeFile(new URL("amc-media-inventory.json",OUT),JSON.stringify(result,null,2)+"\n");
  await writeFile(new URL("amc-media-inventory-summary.json",OUT),JSON.stringify({generatedAt:result.generatedAt,pagesDiscovered:urls.length,pagesFetched:records.length,uniqueMediaUrls:unique.size},null,2)+"\n");
  console.log(JSON.stringify({pagesDiscovered:urls.length,pagesFetched:records.length,uniqueMediaUrls:unique.size},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1});
