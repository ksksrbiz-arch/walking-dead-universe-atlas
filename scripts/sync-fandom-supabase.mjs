#!/usr/bin/env node
import {readFile,writeFile} from "node:fs/promises";

const ENDPOINT=process.env.FANDOM_SYNC_ENDPOINT||"https://qflqfvoxdzkibpzfrwop.supabase.co/functions/v1/fandom-sync";
const files={
  characters:"data/characters.json",
  locations:"data/locations.json",
  episodes:"data/episodes.json"
};
const MAX_PER_TYPE=Number(process.env.FANDOM_SYNC_MAX_PER_TYPE||500);
const BATCH_SIZE=Number(process.env.FANDOM_SYNC_BATCH_SIZE||150);
const entities={};
for(const [key,path] of Object.entries(files)){
  const rows=JSON.parse(await readFile(path,"utf8"));
  entities[key]=rows.map(row=>({id:row.id,name:row.name||row.title})).filter(x=>x.id&&x.name).slice(0,MAX_PER_TYPE);
}
// The edge function is not public (2026-09-25): it needs FANDOM_SYNC_TOKEN, or the project's
// service role key as a fallback. See context/references/supabase-backend.md.
const TOKEN=process.env.FANDOM_SYNC_TOKEN||process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!TOKEN){
  console.error("Set FANDOM_SYNC_TOKEN (or SUPABASE_SERVICE_ROLE_KEY) - the fandom-sync edge function requires a bearer token.");
  process.exit(1);
}
const res=await fetch(ENDPOINT,{
  method:"POST",
  headers:{"content-type":"application/json",authorization:"Bearer "+TOKEN},
  body:JSON.stringify({entities,options:{batchSize:BATCH_SIZE}}),
  signal:AbortSignal.timeout(110000)
});
const text=await res.text();
if(!res.ok)throw new Error("Fandom sync HTTP "+res.status+": "+text.slice(0,1000));
const result=JSON.parse(text);
if(result?.error)throw new Error(result.error);
await writeFile("data/enrichment/fandom-canonical.json",JSON.stringify(result,null,2)+"\n");
console.log(JSON.stringify({
  characters:Object.keys(result.characters||{}).length,
  locations:Object.keys(result.locations||{}).length,
  episodes:Object.keys(result.episodes||{}).length
}));
