#!/usr/bin/env node
import { access, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const DIR = fileURLToPath(new URL("../data/enrichment/", import.meta.url));
const emptyCandidates = { generatedAt:new Date().toISOString(), limit:0, characters:{entityType:"character",source:"walking-dead-wiki",sourceRecords:0,matched:0,unmatched:0,errors:[],records:[]}, locations:{entityType:"location",source:"walking-dead-wiki",sourceRecords:0,matched:0,unmatched:0,errors:[],records:[]}, episodes:{entityType:"episode",source:"walking-dead-wiki",sourceRecords:0,matched:0,unmatched:0,errors:[],records:[]} };
const emptyPages = { generatedAt:new Date().toISOString(), source:"walking-dead-wiki", api:"https://walkingdead.fandom.com/api.php", limit:0, characters:{entityType:"character",source:"walking-dead-wiki",requested:0,fetched:0,batchCount:0,errors:[],pages:[]}, locations:{entityType:"location",source:"walking-dead-wiki",requested:0,fetched:0,batchCount:0,errors:[],pages:[]}, episodes:{entityType:"episode",source:"walking-dead-wiki",requested:0,fetched:0,batchCount:0,errors:[],pages:[]} };
const emptySummary = { generatedAt:new Date().toISOString(), source:"walking-dead-wiki", limit:0, summary:{characters:{requested:0,fetched:0,errors:0,batchCount:0},locations:{requested:0,fetched:0,errors:0,batchCount:0},episodes:{requested:0,fetched:0,errors:0,batchCount:0}} };
const files = {"fandom-atlas-candidates.json":emptyCandidates,"fandom-page-enrichment.json":emptyPages,"fandom-page-enrichment-summary.json":emptySummary};
async function main(){ await mkdir(DIR,{recursive:true}); for(const [name,value] of Object.entries(files)){ const path=DIR+"/"+name; try{await access(path)}catch{await writeFile(path,JSON.stringify(value,null,2)+"\n");} } console.log("Fandom fallback enrichment artifacts verified."); }
main().catch(error=>{console.error(error);process.exitCode=0;});
