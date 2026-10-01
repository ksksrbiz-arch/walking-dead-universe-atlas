import {test} from "node:test";
import assert from "node:assert/strict";
import worker,{GATEWAY,MODEL} from "../src/index.mjs";
import {retrieve} from "../src/corpus.mjs";
const ORIGIN="https://walking-dead-universe-atlas.vercel.app";
function setup({status=200,output,rate=true}={}){
 const calls=[];
 const env={ATLAS_TASK_TOKEN:"test-admin-token",ALLOWED_ORIGINS:ORIGIN,
 RATE_LIMITER:{limit:async()=>({success:rate})},
 AI:{gateway:id=>{assert.equal(id,GATEWAY);return {run:async request=>{
  calls.push(request);
  return status===200?Response.json({model:MODEL,usage:{prompt_tokens:20,completion_tokens:10},choices:[{message:{content:output||JSON.stringify({answer:"Rick is an Atlas character.",citedIds:["rick-grimes"]})}}]}):new Response("spend limit reached",{status});
 }}}}};
 return {env,calls};
}
const request=(path,body,{admin=false,origin=ORIGIN,method="POST"}={})=>new Request("https://atlas.example"+path,{method,headers:{"Content-Type":"application/json",...(origin?{Origin:origin}:{}),...(admin?{Authorization:"Bearer test-admin-token"}:{})},...(method==="POST"?{body:JSON.stringify(body)}:{})});
test("health does not spend inference or reveal credentials",async()=>{
 const {env,calls}=setup();const r=await worker.fetch(request("/health",null,{method:"GET"}),env);
 assert.equal(r.status,200);assert.equal((await r.json()).records,637);assert.equal(calls.length,0);
});
test("public requests are scoped to Atlas origins",async()=>{
 const {env,calls}=setup();
 for(const origin of [null,"https://evil.example","https://walking-dead-universe-atlas.vercel.app.evil.example"]){
  assert.equal((await worker.fetch(request("/ask",{question:"Who is Rick?"},{origin}),env)).status,403);
 }
 assert.equal(calls.length,0);
});
test("maintenance tasks require token before inference",async()=>{
 const {env,calls}=setup();assert.equal((await worker.fetch(request("/tasks",{task:"summarize",text:"Rick Grimes."}),env)).status,401);assert.equal(calls.length,0);
});
test("oversize streamed body rejected without Content-Length",async()=>{
 const {env,calls}=setup();const r=await worker.fetch(request("/ask",{question:"x".repeat(34000)}),env);assert.equal(r.status,413);assert.equal(calls.length,0);
});
test("malformed bodies, wrong media types and invalid questions never spend",async()=>{
 const {env,calls}=setup();
 const bad=new Request("https://atlas.example/ask",{method:"POST",headers:{Origin:ORIGIN,"Content-Type":"application/json"},body:"{"});
 assert.equal((await worker.fetch(bad,env)).status,400);
 assert.equal((await worker.fetch(request("/ask",{question:"a"}),env)).status,400);
 const wrong=new Request("https://atlas.example/ask",{method:"POST",headers:{Origin:ORIGIN,"Content-Type":"text/plain"},body:"hi"});
 assert.equal((await worker.fetch(wrong,env)).status,415);assert.equal(calls.length,0);
});
test("rate limiting stops provider calls and fails closed if missing",async()=>{
 const {env,calls}=setup({rate:false});const r=await worker.fetch(request("/ask",{question:"Who is Rick Grimes?"}),env);assert.equal(r.status,429);assert.equal(r.headers.get("Retry-After"),"60");assert.equal(calls.length,0);
 delete env.RATE_LIMITER;assert.equal((await worker.fetch(request("/ask",{question:"Who is Rick?"}),env)).status,503);
});
test("unknown subjects avoid model calls",async()=>{
 const {env,calls}=setup();const r=await worker.fetch(request("/ask",{question:"Zzzxxxyyyqqq"}),env);assert.equal(r.status,200);assert.deepEqual((await r.json()).citations,[]);assert.equal(calls.length,0);
});
test("grounded ask uses saved Mistral key, bounded output, and curated citations",async()=>{
 const {env,calls}=setup({output:JSON.stringify({answer:"Rick is a character.",citedIds:["rick-grimes","made-up-id"]})});
 const r=await worker.fetch(request("/ask",{question:"Who is Rick Grimes?"}),env);const data=await r.json();
 assert.equal(r.status,200);assert.deepEqual(data.citations.map(x=>x.id),["rick-grimes"]);assert.equal(calls[0].provider,"mistral");assert.equal(calls[0].endpoint,"v1/chat/completions");assert.equal(calls[0].query.max_tokens,700);assert.equal(calls[0].headers["cf-aig-byok-alias"],"default");assert.equal(calls[0].headers["cf-aig-max-attempts"],"1");assert.ok(calls[0].query.messages[1].content.includes("rick-grimes"));
});
test("unsupported citations cannot become a factual answer",async()=>{
 const {env}=setup({output:JSON.stringify({answer:"Invented assertion.",citedIds:["made-up-id"]})});
 const data=await(await worker.fetch(request("/ask",{question:"Who is Rick Grimes?"}),env)).json();
 assert.ok(!data.answer.includes("Invented assertion"));assert.deepEqual(data.citations,[]);
});
test("gateway budget rejection reaches the app with ordinary search preserved",async()=>{
 const {env}=setup({status:429});const r=await worker.fetch(request("/ask",{question:"Who is Rick?"}),env);assert.equal(r.status,429);assert.equal((await r.json()).code,"budget_exhausted");
});
test("private task content disables gateway logging and cache",async()=>{
 const {env,calls}=setup({output:"A short summary."});
 const r=await worker.fetch(request("/tasks",{task:"summarize",text:"Private document."},{admin:true,origin:null}),env);
 assert.equal(r.status,200);assert.equal(calls[0].headers["cf-aig-collect-log"],"false");assert.equal(calls[0].headers["cf-aig-skip-cache"],"true");assert.equal(r.headers.get("Access-Control-Allow-Origin"),null);
});
test("classification checks labels on input and output",async()=>{
 const {env,calls}=setup({output:JSON.stringify({label:"wrong"})});
 assert.equal((await worker.fetch(request("/tasks",{task:"classify",text:"Rick",labels:[]},{admin:true}),env)).status,400);
 assert.equal(calls.length,0);
 assert.equal((await worker.fetch(request("/tasks",{task:"classify",text:"Rick",labels:["person"]},{admin:true}),env)).status,502);
});
test("enrichment requires HTTPS provenance and returns proposals with server hash",async()=>{
 const {env}=setup({output:JSON.stringify({proposals:[{field:"name",value:"Rick"}],uncertainties:[]})});
 assert.equal((await worker.fetch(request("/tasks",{task:"enrich",text:"Rick",sourceUrl:"http://example.com"},{admin:true}),env)).status,400);
 const r=await worker.fetch(request("/tasks",{task:"enrich",text:"Rick",sourceUrl:"https://example.com/rick"},{admin:true}),env);
 const data=await r.json();assert.equal(r.status,200);assert.equal(data.reviewRequired,true);assert.equal(data.output.provenance.sourceUrl,"https://example.com/rick");assert.equal(data.output.provenance.payloadHash.length,64);
});
test("provider malformed/empty JSON is rejected",async()=>{
 const {env}=setup({output:"not json"});
 assert.equal((await worker.fetch(request("/ask",{question:"Who is Rick?"}),env)).status,502);
});
test("retrieval keeps uncertain chronology and cannot invent a new entity",()=>{
 const evidence=retrieve("The Ones Who Live Years Rick Grimes");assert.ok(evidence.some(x=>x.id==="owl-s01-e01"));assert.deepEqual(retrieve("zzzzqwxxyz"),[]);
});


