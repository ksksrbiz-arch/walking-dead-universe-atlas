#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";

const ROOT = new URL("../", import.meta.url);
const DIR = new URL("data/enrichment/", ROOT);

async function readJson(name){ return JSON.parse(await readFile(new URL(name, DIR), "utf8")); }

function mergeHints(pages){
  const out={};
  for(const page of pages){
    const id=page?.candidate?.canonicalId;
    if(!id || page?.candidate?.matchStatus!=="matched") continue;
    const current=out[id]||{};
    const hints={...current.hints};
    const fields={...current.fields};
    for(const box of page.infoboxes||[]) for(const [rawKey,rawValue] of Object.entries(box.parameters||{})){
      const key=String(rawKey||"").trim().toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"");
      const value=Array.isArray(rawValue)?rawValue.join(" · "):String(rawValue??"").trim();
      if(key&&value) fields[key]=value;
    }
    for(const [key,value] of Object.entries(page.hints||{})){
      if(value==null || (Array.isArray(value)&&!value.length) || String(value).trim()==="") continue;
      if(hints[key]==null) hints[key]=value;
      else {
        const values=[...(Array.isArray(hints[key])?hints[key]:[hints[key]]),...(Array.isArray(value)?value:[value])].map(String).filter(Boolean);
        hints[key]=[...new Set(values)].slice(0,40);
      }
    }
    out[id]={
      ...current,
      source:"walking-dead-wiki",
      sourceUrl:page.sourceUrl||page.page?.canonicalUrl||null,
      retrievedAt:page.retrievedAt||null,
      revisionId:page.revision?.revisionId||null,
      pageTitle:page.page?.title||null,
      extract:page.extract||current.extract||"",
      hints,
      fields,
      details:{
        sections:[...new Set([...(current.details?.sections||[]),...(page.details?.sections||[])])].slice(0,100),
        linkedPages:[...new Set([...(current.details?.linkedPages||[]),...(page.details?.linkedPages||[])])].slice(0,250),
        imageFiles:[...(current.details?.imageFiles||[]),...(page.details?.imageFiles||[])].filter((item,index,array)=>item?.url&&array.findIndex(x=>x.url===item.url)===index).slice(0,36)
      }
    };
  }
  return out;
}

async function main(){
  const pages=await readJson("fandom-page-enrichment.json");
  const candidates=await readJson("fandom-atlas-candidates.json");
  let galleryManifest=null;
  try{ galleryManifest=await readJson("fandom-gallery-media.json"); }catch{}

  const result={version:1,generatedAt:new Date().toISOString(),source:"walking-dead-wiki",policy:"Matched Fandom enrichment is display-only enrichment. Canonical Atlas fields remain authoritative unless explicitly reconciled.",characters:{},locations:{},episodes:{}};
  for(const key of ["characters","locations","episodes"]){
    const candidateMap=new Map((candidates[key]?.records||[]).map(r=>[String(r.candidate?.sourceRecordId||""),r]));
    const matchedPages=(pages[key]?.pages||[]).map(page=>{
      const reconciled=candidateMap.get(String(page.sourceRecordId));
      return reconciled?{...page,candidate:{...(page.candidate||{}),canonicalId:reconciled.match?.canonicalId||null,matchStatus:reconciled.match?.status||"unmatched"}}:page;
    });
    result[key]=mergeHints(matchedPages);
  }

  // Merge the exhaustive gallery crawl into the canonical snapshot. This is
  // intentionally additive: gallery media is candidate imagery and never
  // changes canonical Atlas identity or factual fields. Keeping the gallery
  // URLs in the runtime snapshot lets the client choose an entity-specific
  // image even when the page's primary image is generic series artwork.
  if(galleryManifest?.records?.length){
    const normalizeTitle=(value)=>String(value||"")
      .toLowerCase()
      .replace(/\/Gallery$/i,"")
      .replace(/[_-]+/g," ")
      .replace(/[^a-z0-9 ]+/g," ")
      .replace(/\s+/g," ")
      .trim();
    const canonicalByTitle=new Map();
    for(const key of ["characters","locations","episodes"]){
      const rows=await readJson(`../${key}.json`);
      for(const row of rows){
        const title=normalizeTitle(row.name||row.title);
        if(title&&!canonicalByTitle.has(title)) canonicalByTitle.set(title,{entityType:key,canonicalId:row.id});
      }
    }
    for(const record of galleryManifest.records){
      const title=normalizeTitle(record.title);
      const match=canonicalByTitle.get(title);
      if(!match)continue;
      const {entityType,canonicalId}=match;
      const urls=[...(record.media||[]).map((item)=>item?.url),...(record.directUrls||[])].filter((x)=>/^https?:\/\//i.test(String(x)));
      if(!urls.length)continue;
      const current=result[entityType][canonicalId]||{};
      const imageFiles=[...(current.details?.imageFiles||[])];
      const hints=[...(Array.isArray(current.hints?.imageGallery)?current.hints.imageGallery:[])];
      for(const url of urls){
        if(!imageFiles.some((item)=>item?.url===url))imageFiles.push({url,title:record.title||null});
        if(!hints.includes(url))hints.push(url);
      }
      result[entityType][canonicalId]={
        ...current,
        hints:{...current.hints,imageGallery:hints.slice(0,100)},
        details:{...current.details,imageFiles:imageFiles.slice(0,100)}
      };
    }
  }
  await writeFile(new URL("fandom-canonical.json",DIR),JSON.stringify(result,null,2)+"\n");
  console.log(JSON.stringify({characters:Object.keys(result.characters).length,locations:Object.keys(result.locations).length,episodes:Object.keys(result.episodes).length},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
