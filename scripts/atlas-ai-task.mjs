import {readFile,writeFile} from "node:fs/promises";
import {resolve} from "node:path";

const [task,inputPath,...args]=process.argv.slice(2);
const help="Usage: npm run ai:task -- <summarize|classify|extract|enrich|document|code|general> <text-file> [--labels label1,label2] [--source-url https://...] [--output output.json]";
if(!task||!inputPath||!["summarize","classify","extract","enrich","document","code","general"].includes(task)){console.error(help);process.exit(2);}
const options={};
for(let i=0;i<args.length;i+=2){if(!["--labels","--source-url","--output"].includes(args[i])||!args[i+1]){console.error(help);process.exit(2);}options[args[i]]=args[i+1];}
let token=process.env.ATLAS_TASK_TOKEN;
if(!token){
 try{const vars=await readFile(new URL("../workers/atlas-ai/.dev.vars",import.meta.url),"utf8");token=/^ATLAS_TASK_TOKEN=(.+)$/m.exec(vars)?.[1]?.trim();}catch{}
}
if(!token){console.error("Set ATLAS_TASK_TOKEN in your environment or workers/atlas-ai/.dev.vars. Never put it in a VITE_ variable.");process.exit(2);}
const text=await readFile(resolve(inputPath),"utf8");
const endpoint=(process.env.ATLAS_AI_ENDPOINT||"https://walking-dead-atlas-ai.skdev-371.workers.dev").replace(/\/$/,"");
const response=await fetch(endpoint+"/tasks",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify({task,text,labels:options["--labels"]?.split(",").map(x=>x.trim()),sourceUrl:options["--source-url"]}),signal:AbortSignal.timeout(25000)});
const result=await response.json();
if(!response.ok){console.error(result.error||"Atlas AI task failed.");process.exit(1);}
const output=JSON.stringify(result,null,2)+"\n";
if(options["--output"])await writeFile(resolve(options["--output"]),output);else process.stdout.write(output);


