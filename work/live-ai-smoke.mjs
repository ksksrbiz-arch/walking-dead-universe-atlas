import {readFile} from "node:fs/promises";
import assert from "node:assert/strict";
const token=/^ATLAS_TASK_TOKEN=(.+)$/m.exec(await readFile("workers/atlas-ai/.dev.vars","utf8"))[1].trim();
const endpoint="https://walking-dead-atlas-ai.skdev-371.workers.dev";
const jobs=[
 {task:"classify",text:"Rick Grimes is a television character.",labels:["person","place","episode"]},
 {task:"extract",text:"Rick Grimes is mentioned alongside Atlanta."},
 {task:"enrich",text:"The episode title is Days Gone Bye.",sourceUrl:"https://epguides.com/WalkingDead/"},
 {task:"document",text:"Atlas note: the TV universe chronology contains uncertain dates. Preserve uncertainty."}
];
for(const job of jobs){
 const r=await fetch(endpoint+"/tasks",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify(job)});
 const d=await r.json();
 assert.equal(r.status,200,JSON.stringify(d));assert.equal(d.ok,true);
 if(job.task==="classify")assert.equal(d.output.label,"person");
 if(job.task==="enrich"){assert.equal(d.reviewRequired,true);assert.equal(d.output.provenance.sourceUrl,job.sourceUrl);}
 console.log("PASS live "+job.task+" via Mistral; model="+d.model);
}
for(let i=0;i<2;i++){
 const r=await fetch(endpoint+"/tasks",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify({task:"general",text:"Reply only: Atlas"})});
 const d=await r.json();console.log("Budget probe "+(i+1)+": "+r.status+" "+(d.code||"success"));
 if(i===0)assert.equal(r.status,200,JSON.stringify(d));else{assert.equal(r.status,429,JSON.stringify(d));assert.equal(d.code,"budget_exhausted");}
}

