export default async function handler(req:Request){
  if(req.method!=="POST")return new Response("Method Not Allowed",{status:405,headers:{allow:"POST"}});
  try{
    const body=await req.json() as {metrics?:unknown[]};
    const accepted=Array.isArray(body.metrics)?Math.min(body.metrics.length,40):0;
    return Response.json({ok:true,accepted});
  }catch{return new Response("Invalid telemetry",{status:400})}
}
