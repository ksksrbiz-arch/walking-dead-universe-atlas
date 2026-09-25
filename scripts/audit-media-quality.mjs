#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";

const ROOT = new URL("../", import.meta.url);
const DATA = new URL("data/", ROOT);
const OUT = new URL("data/enrichment/", ROOT);

const readJson = async (url) => JSON.parse(await readFile(url, "utf8"));

function normalize(value){
  return String(value||"").toLowerCase().replace(/[_-]+/g," ").replace(/[^a-z0-9 ]+/g," ").replace(/\s+/g," ").trim();
}

function isGeneric(value){
  return /(?:series.?art|key.?art|title.?card|franchise|ensemble|group.?photo|cast.?photo|promo|logo|wallpaper|background)/i.test(String(value||""));
}

async function main(){
  const media=await readJson(new URL("media.json",DATA));
  const canonical={
    characters:await readJson(new URL("characters.json",DATA)),
    places:await readJson(new URL("locations.json",DATA)),
    episodes:await readJson(new URL("episodes.json",DATA))
  };
  const sections=[
    ["characters",canonical.characters],
    ["places",canonical.places],
    ["episodes",canonical.episodes]
  ];
  const report={generatedAt:new Date().toISOString(),version:1,summary:{},issues:[]};

  for(const [key,entities] of sections){
    const bucket=media[key]||{};
    let missing=0,generic=0,withGallery=0,withSource=0;
    for(const entity of entities){
      const item=bucket[entity.id]||{};
      if(!item.image){ missing++; report.issues.push({type:"missing-image",entityType:key,id:entity.id,name:entity.name}); continue; }
      if(isGeneric(item.image)){ generic++; report.issues.push({type:"generic-image",entityType:key,id:entity.id,name:entity.name,image:item.image}); }
      if(Array.isArray(item.gallery)&&item.gallery.length) withGallery++;
      if(item.sourcePage||item.gallerySourcePage) withSource++;
    }
    report.summary[key]={entities:entities.length,missingImage:missing,genericImage:generic,withGallery,withSource};
  }

  const allImages=[];
  for(const [key,bucket] of Object.entries(media)){
    if(!bucket||typeof bucket!=="object"||Array.isArray(bucket))continue;
    for(const [id,item] of Object.entries(bucket)){
      if(item?.image)allImages.push({key,id,url:item.image});
    }
  }
  const duplicateMap=new Map();
  for(const item of allImages){
    const n=normalize(item.url);
    if(!n)continue;
    const arr=duplicateMap.get(n)||[]; arr.push(item); duplicateMap.set(n,arr);
  }
  for(const [url,items] of duplicateMap){
    if(items.length>=5) report.issues.push({type:"shared-image",count:items.length,url,entities:items.slice(0,20)});
  }

  await writeFile(new URL("media-quality-audit.json",OUT),JSON.stringify(report,null,2)+"\n");
  console.log(JSON.stringify(report.summary,null,2));
  console.log(JSON.stringify({issues:report.issues.length},null,2));
}

main().catch(error=>{console.error(error);process.exitCode=1;});
