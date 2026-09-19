import type {Context} from "@netlify/functions";
import {getStore} from "@netlify/blobs";

type Metric={name:string;value:number;ts:number;details?:Record<string,string|number|boolean|null>};
type Payload={sessionId?:string;viewport?:{w?:number;h?:number;dpr?:number};reducedMotion?:boolean;metrics?:Metric[]};

export default async (req:Request,_context:Context)=>{
  if(req.method!=="POST")return new Response("Method Not Allowed",{status:405,headers:{allow:"POST"}});
  try{
    const body=(await req.json()) as Payload;
    if(!Array.isArray(body.metrics)||body.metrics.length===0||body.metrics.length>40)return new Response("Invalid metrics",{status:400});
    const clean=body.metrics.filter(m=>typeof m?.name==="string"&&m.name.length<80&&Number.isFinite(m.value)).slice(0,40);
    if(!clean.length)return new Response("No valid metrics",{status:400});
    const store=getStore("atlas-runtime");
    const key="telemetry-v1";
    const current=await store.get(key,{type:"json"}) as any;
    const totals:Record<string,{count:number;sum:number;max:number}> = current?.totals||{};
    for(const m of clean){
      const t=totals[m.name]??{count:0,sum:0,max:0};
      t.count++;t.sum+=m.value;t.max=Math.max(t.max,m.value);totals[m.name]=t;
    }
    const next={
      version:1,
      updatedAt:new Date().toISOString(),
      sessions:Math.min(Number(current?.sessions||0)+1,10000000),
      totals
    };
    await store.setJSON(key,next);
    return new Response(JSON.stringify({ok:true,accepted:clean.length}),{headers:{"content-type":"application/json","cache-control":"no-store"}});
  }catch{
    return new Response("Invalid telemetry",{status:400});
  }
};
export const config={path:"/api/atlas/telemetry"};
