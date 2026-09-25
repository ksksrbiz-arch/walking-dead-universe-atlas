#!/usr/bin/env node
/**
 * Per-entity Fandom image galleries for every atlas character, location and
 * episode.
 *
 * For each entity's Fandom page (fandom-canonical.json `fandom_title`) and its
 * "<title>/Gallery" subpage, list the embedded files, resolve them with
 * imageinfo, and keep real photos (no logos, icons, flags, SVGs, tiny files).
 * Batched 50 titles per MediaWiki request.
 *
 * Output (fetched lazily by the app, never bundled):
 *   public/data/fandom-galleries/{characters,locations,episodes}.json
 *     { "<entityId>": [ { "p": "b/bf/File.jpg", "w": 1920, "h": 1080, "t": "File caption" } ] }
 * Full URL = https://static.wikia.nocookie.net/walkingdead/images/<p>/revision/latest
 * (src/lib/galleries.ts), resized per display width via fandomScaled().
 *
 *   npm run enrich:fandom-entity-galleries
 */
import {mkdir,readFile,writeFile} from "node:fs/promises";

const API="https://walkingdead.fandom.com/api.php";
const LIMITS={characters:30,locations:20,episodes:14};
const MIN_WIDTH=Number(process.env.GALLERY_MIN_WIDTH||360);
const EXCLUDE=/logo|icon|flag|symbol|signature|stub|wiki|favicon|button|banner|placeholder|no[_ -]?image|comic|issue[_ -]?\d|cover|poster|title[_ -]?card|infobox|map|chart|\.svg$|\.gif$/i;
// Wiki pages also document the games, comics and novels; the atlas is the TV
// universe only, so non-TV media renders are dropped by name.
const NON_TV=/survival[_ ]instinct|onslaught|telltale|road[_ ]to[_ ]survival|no[_ ]man'?s[_ ]land|saints[_ ]?(?:&|and)?[_ ]?sinners|destinies|our[_ ]world|last[_ ]mile|video[_ ]game|[_(]game[_).]|novel|funko|figure|mcfarlane|statue|collectible|merch|playing[_ ]card|(?:^|[_ ])vr(?:[_ .]|$)/i;
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));

async function api(params){
 const url=API+"?"+new URLSearchParams({format:"json",formatversion:"2",...params});
 for(let attempt=1;attempt<=4;attempt++){
  try{
   const res=await fetch(url,{headers:{"user-agent":"TWDU-Atlas-Entity-Galleries/1.0 (+https://github.com/ksksrbiz-arch/walking-dead-universe-atlas)"},signal:AbortSignal.timeout(30000)});
   if(res.ok)return await res.json();
   if(res.status!==429&&res.status<500)throw new Error(res.status+" "+res.statusText);
  }catch(e){if(attempt===4)throw e}
  await sleep(600*2**attempt);
 }
}
const chunks=(arr,n)=>Array.from({length:Math.ceil(arr.length/n)},(_,i)=>arr.slice(i*n,i*n+n));

// page title -> [File:... titles in page order]
async function pageImages(titles){
 const out=new Map();
 for(const batch of chunks(titles,50)){
  let cont={};
  do{
   const data=await api({action:"query",prop:"images",imlimit:"max",titles:batch.join("|"),redirects:"1",...cont});
   const redirects=new Map((data.query?.redirects||[]).map(r=>[r.to,r.from]));
   const normalized=new Map((data.query?.normalized||[]).map(n=>[n.to,n.from]));
   for(const page of data.query?.pages||[]){
    const original=normalized.get(redirects.get(page.title)??page.title)??redirects.get(page.title)??page.title;
    const list=out.get(original)||[];
    for(const img of page.images||[])list.push(img.title);
    out.set(original,list);
   }
   cont=data.continue||{};
   await sleep(80);
  }while(Object.keys(cont).length);
 }
 return out;
}

// File title -> {path,width,height}
async function fileInfo(files){
 const out=new Map();
 for(const batch of chunks([...new Set(files)],50)){
  const data=await api({action:"query",prop:"imageinfo",iiprop:"url|size|mime",titles:batch.join("|")});
  for(const page of data.query?.pages||[]){
   const ii=page.imageinfo?.[0];
   if(!ii?.url)continue;
   const m=/\/walkingdead\/images\/([0-9a-f]\/[0-9a-f]{2}\/[^/?]+)/i.exec(ii.url);
   if(!m||!/^image\/(jpeg|png|webp)$/.test(ii.mime))continue;
   out.set(page.title,{p:decodeURIComponent(m[1]),w:ii.width,h:ii.height});
  }
  await sleep(80);
 }
 return out;
}

const canonical=JSON.parse(await readFile("data/enrichment/fandom-canonical.json","utf8"));
await mkdir("public/data/fandom-galleries",{recursive:true});
const summary={};
for(const kind of ["characters","locations","episodes"]){
 const records=Object.entries(canonical[kind]||{}).filter(([,r])=>r?.fandom_title);
 const titles=records.flatMap(([,r])=>[r.fandom_title,r.fandom_title+"/Gallery"]);
 const images=await pageImages(titles);
 const allFiles=[...images.values()].flat().filter(f=>!EXCLUDE.test(f)&&!NON_TV.test(f));
 const info=await fileInfo(allFiles);
 const result={};
 for(const [id,r] of records){
  const seen=new Set(),list=[];
  for(const f of [...(images.get(r.fandom_title)||[]),...(images.get(r.fandom_title+"/Gallery")||[])]){
   if(EXCLUDE.test(f)||NON_TV.test(f)||seen.has(f))continue;seen.add(f);
   const i=info.get(f);if(!i||i.w<MIN_WIDTH)continue;
   list.push({...i,t:f.replace(/^File:/,"").replace(/\.[a-z]+$/i,"").replace(/[_-]+/g," ").trim()});
   if(list.length>=LIMITS[kind])break;
  }
  if(list.length)result[id]=list;
 }
 await writeFile(`public/data/fandom-galleries/${kind}.json`,JSON.stringify(result)+"\n");
 summary[kind]={entities:records.length,withGallery:Object.keys(result).length,images:Object.values(result).reduce((n,l)=>n+l.length,0)};
 console.log(kind,JSON.stringify(summary[kind]));
}
await writeFile("public/data/fandom-galleries/summary.json",JSON.stringify({generatedAt:new Date().toISOString(),source:"https://walkingdead.fandom.com (MediaWiki API)",license:"Images remain the property of their rights holders; displayed with attribution to the Walking Dead Wiki.",...summary},null,1)+"\n");
