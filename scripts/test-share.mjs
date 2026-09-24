// Checks for shareable links: api/share.ts (preview HTML + redirect) and
// api/og.ts (1200×630 PNG). Needs a build first (dist/share-index.json):
//   npm run build && npm run test:share
// Set SHARE_OUT=<dir> to also write the rendered PNGs for a visual check.
import {build} from "esbuild";
import {mkdirSync,rmSync,writeFileSync,existsSync} from "node:fs";
import {join} from "node:path";
import {pathToFileURL} from "node:url";

if(!existsSync("dist/share-index.json")){console.error("dist/share-index.json missing — run npm run build first");process.exit(1)}
// Inside node_modules so the external @vercel/og resolves from the project.
const dir=join("node_modules",".cache","twdu-share-test");mkdirSync(dir,{recursive:true});
await build({entryPoints:{share:"api/share.ts",og:"api/og.ts"},bundle:true,format:"esm",platform:"node",outdir:dir,outExtension:{".js":".mjs"},external:["@vercel/og"],logLevel:"error",banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"}});
const abs=f=>pathToFileURL(join(process.cwd(),dir,f)).href;
const og=await import(abs("og.mjs")).catch(e=>{console.log(e);return null});
const share=await import(abs("share.mjs"));
let failed=0,passed=0;
const check=(name,ok,detail="")=>{if(ok){passed++;console.log("  ok  "+name)}else{failed++;console.log("  FAIL "+name+(detail?" — "+detail:""))}};
const req=(path)=>new Request("https://atlas.test"+path,{headers:{"x-forwarded-host":"atlas.test","x-forwarded-proto":"https"}});

const html=async(path)=>{const r=await share.GET(req(path));return {status:r.status,location:r.headers.get("location"),body:r.status===200?await r.text():""}};
const j=await html("/api/share?kind=j&id=daryl-dixon%2Bcarol-peletier&at=28100");
check("journey share page renders",j.status===200);
check("has og:title for both characters",/og:title" content="Daryl Dixon &amp; Carol Peletier/.test(j.body));
check("og:image points at the card endpoint",/og:image" content="https:\/\/atlas\.test\/api\/og\?kind=j&amp;id=daryl-dixon%2Bcarol-peletier&amp;at=28100"/.test(j.body));
check("large-image twitter card",/twitter:card" content="summary_large_image"/.test(j.body));
check("redirects people into the app state",j.body.includes('location.replace("/?j=daryl-dixon,carol-peletier&at=28100")'));
const p=await html("/api/share?kind=p&id=alexandria");
check("place share page",p.status===200&&/Alexandria · TWDU Atlas/.test(p.body)&&p.body.includes("/?place=alexandria"));
const e=await html("/api/share?kind=e&id=daryl-s01-e06");
check("episode share page",e.status===200&&/Coming Home/.test(e.body)&&e.body.includes("/?ep=daryl-s01-e06"));
const c=await html("/api/share?kind=c&id=rick-grimes");
check("character share page",c.status===200&&c.body.includes("/?who=rick-grimes"));
const bad=await html("/api/share?kind=j&id=%3Cscript%3E");
check("unknown ids fall back to the app root",bad.status===302&&bad.location==="https://atlas.test/");
const inj=await html("/api/share?kind=p&id=alexandria%22%3E%3Cscript%3E");
check("no reflected markup from the id",inj.status===302&&!inj.body.includes("<script>alert"));

if(!og){check("og module loads",false)}else{
 for(const [name,path] of [["journey","/api/og?kind=j&id=daryl-dixon"],["journey-at","/api/og?kind=j&id=daryl-dixon&at=28100"],["compare","/api/og?kind=j&id=daryl-dixon%2Bcarol-peletier"],["place","/api/og?kind=p&id=alexandria"],["episode","/api/og?kind=e&id=daryl-s01-e06"],["character","/api/og?kind=c&id=rick-grimes"]]){
  const t=Date.now();const r=await og.GET(req(path));const buf=Buffer.from(await r.arrayBuffer());
  const png=buf.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  check(`og ${name} is a 1200×630 PNG (${Math.round(buf.length/1024)} KB, ${Date.now()-t} ms)`,r.status===200&&png&&buf.readUInt32BE(16)===1200&&buf.readUInt32BE(20)===630,String(r.status));
  if(process.env.SHARE_OUT)writeFileSync(join(process.env.SHARE_OUT,`og-${name}.png`),buf);
 }
 const miss=await og.GET(req("/api/og?kind=e&id=nope"));
 check("og 404s unknown ids",miss.status===404);
}
rmSync(dir,{recursive:true,force:true});
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed?1:0);
