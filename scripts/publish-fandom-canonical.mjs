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
  const result={version:1,generatedAt:new Date().toISOString(),source:"walking-dead-wiki",policy:"Matched Fandom enrichment is display-only enrichment. Canonical Atlas fields remain authoritative unless explicitly reconciled.",characters:{},locations:{},episodes:{}};
  for(const key of ["characters","locations","episodes"]){
    const candidateMap=new Map((candidates[key]?.records||[]).map(r=>[String(r.candidate?.sourceRecordId||""),r]));
    const matchedPages=(pages[key]?.pages||[]).map(page=>{
      const reconciled=candidateMap.get(String(page.sourceRecordId));
      return reconciled?{...page,candidate:{...(page.candidate||{}),canonicalId:reconciled.match?.canonicalId||null,matchStatus:reconciled.match?.status||"unmatched"}}:page;
    });
    result[key]=mergeHints(matchedPages);
  }
  await writeFile(new URL("fandom-canonical.json",DIR),JSON.stringify(result,null,2)+"\n");
  console.log(JSON.stringify({characters:Object.keys(result.characters).length,locations:Object.keys(result.locations).length,episodes:Object.keys(result.episodes).length},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
