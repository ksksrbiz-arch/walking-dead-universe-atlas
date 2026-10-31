import assert from "node:assert/strict";
import {build} from "esbuild";
import {mkdtemp,rm} from "node:fs/promises";
import {join,resolve} from "node:path";
import {pathToFileURL} from "node:url";

const dir=await mkdtemp(resolve("node_modules/.atlas-resilience-"));
const originalFetch=globalThis.fetch;
const envKeys=["CRON_SECRET","FANDOM_SYNC_ENDPOINT","FANDOM_SYNC_TOKEN","MEDIA_SYNC_ENDPOINT","MEDIA_SYNC_TOKEN"];
const originalEnv=Object.fromEntries(envKeys.map(key=>[key,process.env[key]]));
try{
 await build({entryPoints:{fandom:"api/cron/fandom-sync.ts",media:"api/cron/media-sync.ts",galleries:"src/lib/galleries.ts",ai:"src/lib/atlasAI.ts"},bundle:true,platform:"node",format:"esm",outdir:dir,outExtension:{".js":".mjs"},external:["react"],define:{"import.meta.env":"{}"}});
 const load=name=>import(pathToFileURL(join(dir,name+".mjs")).href);
 for(const [name,prefix] of [["fandom","FANDOM"],["media","MEDIA"]]){
  const {GET}=await load(name);
  let calls=0;
  globalThis.fetch=async()=>{calls++;return Response.json({ok:true})};
  process.env[prefix+"_SYNC_ENDPOINT"]="https://sync.example.test/";
  process.env[prefix+"_SYNC_TOKEN"]="test-upstream-token";
  const request=auth=>new Request("https://atlas.test/api/cron/"+name+"-sync",{headers:auth?{authorization:auth}:{}});
  delete process.env.CRON_SECRET;
  assert.equal((await GET(request("Bearer undefined"))).status,401);
  process.env.CRON_SECRET="";
  assert.equal((await GET(request("Bearer "))).status,401);
  process.env.CRON_SECRET="test-cron-secret";
  for(const auth of [null,"Bearer wrong"])assert.equal((await GET(request(auth))).status,401);
  assert.equal(calls,0,"unauthorized requests never dispatch");
  assert.equal((await GET(request("Bearer test-cron-secret"))).status,202);
  assert.equal(calls,1);
  console.log("PASS "+name+" sync fails closed and accepts the configured secret");
 }
 const {getFandomGallery}=await load("galleries");
 let calls=0;
 const valid={rick:[{p:"a/ab/Rick.jpg",t:"Rick",w:640,h:480},null,{p:42}]};
 globalThis.fetch=async()=>{calls++;if(calls===1)throw Error("offline");return Response.json(valid)};
 assert.deepEqual(await getFandomGallery("characters","rick"),[]);
 const [a,b]=await Promise.all([getFandomGallery("characters","rick"),getFandomGallery("characters","rick")]);
 assert.equal(a.length,1);assert.deepEqual(a,b);assert.equal(calls,2);
 await getFandomGallery("characters","rick");assert.equal(calls,2);
 assert.deepEqual(await getFandomGallery("characters","constructor"),[]);
 globalThis.fetch=async()=>new Response("unavailable",{status:503});
 assert.deepEqual(await getFandomGallery("locations","rick"),[]);
 globalThis.fetch=async()=>Response.json(null);
 assert.deepEqual(await getFandomGallery("locations","rick"),[]);
 globalThis.fetch=async()=>Response.json(valid);
 assert.equal((await getFandomGallery("locations","rick")).length,1);
 console.log("PASS galleries recover from network, HTTP and malformed-data failures; concurrent loads coalesce");
 const {askAtlas}=await load("ai");
 for(const result of [null,{ok:true,answer:"test",citations:[null]},{ok:true,answer:"test",citations:[{id:"rick",title:"Rick",kind:"wrong",sources:[]}]}]){
  globalThis.fetch=async()=>Response.json(result);
  await assert.rejects(askAtlas("Who is Rick?",new AbortController().signal),/Ordinary search still works/);
 }
 globalThis.fetch=async()=>Response.json({ok:true,answer:"Supported",citations:[{id:"rick-grimes",title:"Rick",kind:"character",sources:[]}]});
 assert.equal((await askAtlas("Who is Rick?",new AbortController().signal)).answer,"Supported");
 console.log("PASS malformed AI responses stay errors instead of crashing search");
}finally{
 globalThis.fetch=originalFetch;
 for(const key of envKeys){if(originalEnv[key]===undefined)delete process.env[key];else process.env[key]=originalEnv[key]}
 await rm(dir,{recursive:true,force:true});
}
