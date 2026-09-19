#!/usr/bin/env node
/**
 * Bulk-ingest official AMC episode imagery into data/episodeMedia.json.
 *
 * Strategy:
 * 1. Discover episode URLs from AMC's canonical /episodes catalog.
 * 2. Keep only the seven core TWDU series.
 * 3. Fetch each episode page and extract its canonical/OG image.
 * 4. Match by series + season + episode number.
 * 5. Preserve explicit provenance; never invent an image URL.
 *
 * Run:
 *   npm run ingest:media
 *
 * This intentionally runs as a maintenance script rather than during the Vite
 * production build, so a temporary AMC outage cannot break the application build.
 */

import {readFile,writeFile} from "node:fs/promises";

const BASE="https://www.amc.com";
const CATALOG=`${BASE}/episodes`;
const MANIFEST="data/episodeMedia.json";

const SERIES_SLUGS={
  twd:"the-walking-dead",
  ftwd:"fear-the-walking-dead",
  wb:"the-walking-dead-world-beyond",
  tales:"tales-of-the-walking-dead",
  owl:"the-walking-dead-the-ones-who-live",
  daryl:"the-walking-dead-daryl-dixon",
  dead:"the-walking-dead-dead-city"
};

const slugAliases={
  "the-walking-dead-the-ones-who-live":"owl",
  "the-walking-dead-rick-and-michonne":"owl",
};

const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));

function stripHtml(s=""){
  return s.replace(/<script[\\s\\S]*?<\\/script>/gi,"")
    .replace(/<style[\\s\\S]*?<\\/style>/gi,"")
    .replace(/<[^>]+>/g," ")
    .replace(/&amp;/g,"&").replace(/&#39;/g,"'")
    .replace(/&quot;/g,'"').replace(/&nbsp;/g," ")
    .replace(/\\s+/g," ").trim();
}

function discoverUrls(html){
  const out=new Set();
  const re=/href=["'](\\/shows\\/[^"'#?]*\\/episodes\\/[^"'#?]*)["']/gi;
  for(const m of html.matchAll(re)){
    const href=m[1];
    if(Object.values(SERIES_SLUGS).some(slug=>href.includes("/"+slug+"/episodes/")) ||
       Object.keys(slugAliases).some(slug=>href.includes("/"+slug+"/episodes/"))){
      out.add(new URL(href,BASE).href);
    }
  }
  return [...out];
}

function identify(url,html){
  const match=url.match(/https?:\\/\\/www\\.amc\\.com\\/shows\\/([^/]+)\\/episodes\\/[^?#]*/);
  if(!match) return null;
  const slug=match[1];
  const seriesId=SERIES_SLUGS[slug]||slugAliases[slug];
  if(!seriesId) return null;
  const se=stripHtml(html).match(/\\bS(\\d{1,2}),?\\s*E(\\d{1,2})\\b/i);
  if(!se) return null;
  return {seriesId,season:Number(se[1]),episode:Number(se[2])};
}

function extractImage(html){
  const patterns=[
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i
  ];
  for(const re of patterns){
    const m=html.match(re);
    if(m?.[1]) return new URL(m[1],BASE).href;
  }
  return null;
}

async function fetchText(url){
  const res=await fetch(url,{headers:{"user-agent":"TWDU-Atlas-media-ingestor/1.0"}});
  if(!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return await res.text();
}

async function main(){
  const manifest=JSON.parse(await readFile(MANIFEST,"utf8"));
  const catalog=await fetchText(CATALOG);
  const urls=discoverUrls(catalog);
  console.log(`Discovered ${urls.length} AMC TWDU episode pages.`);

  let verified=0,failed=0,matched=0;
  const queue=[...urls];
  const workers=Array.from({length:4},async()=>{
    while(queue.length){
      const url=queue.shift();
      try{
        const html=await fetchText(url);
        const id=identify(url,html);
        if(!id) continue;
        const key=Object.entries(manifest.episodes).find(([,e])=>
          e.seriesId===id.seriesId &&
          e.seasonId===`${id.seriesId}-s${String(id.season).padStart(2,"0")}` &&
          e.episodeNumber===id.episode
        )?.[0];
        if(!key) continue;
        matched++;
        const image=extractImage(html);
        if(image){
          manifest.episodes[key]={
            ...manifest.episodes[key],
            status:"verified",
            image,
            sourcePage:url,
            source:"amc",
            verifiedAt:new Date().toISOString()
          };
          verified++;
        }
        await sleep(75);
      }catch(err){
        failed++;
        console.warn("media fetch failed:",url,err?.message||err);
      }
    }
  });
  await Promise.all(workers);
  manifest.updatedAt=new Date().toISOString();
  manifest.coverage=Object.keys(manifest.episodes).length;
  manifest.verified=Object.values(manifest.episodes).filter(e=>e.status==="verified").length;
  await writeFile(MANIFEST,JSON.stringify(manifest,null,2)+"\\n");
  console.log(`Matched ${matched}; verified ${verified}; failed ${failed}; total verified now ${manifest.verified}/${manifest.coverage}.`);
}

main().catch(err=>{console.error(err);process.exit(1)});
