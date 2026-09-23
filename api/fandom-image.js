const ALLOWED_HOSTS=new Set(["static.wikia.nocookie.net","vignette.wikia.nocookie.net"]);
const MAX_BYTES=8*1024*1024;

export default async function handler(req,res){
  const source=typeof req.query?.url==="string"?req.query.url:"";
  if(!source){res.statusCode=400;return res.end("Missing image URL");}
  let target;
  try{target=new URL(source)}catch{res.statusCode=400;return res.end("Invalid image URL");}
  if(target.protocol!=="https:"||!ALLOWED_HOSTS.has(target.hostname.toLowerCase())){res.statusCode=403;return res.end("Image host not allowed");}
  try{
    const upstream=await fetch(target.toString(),{headers:{
      "user-agent":"TWDU-Atlas/1.0",
      "accept":"image/avif,image/webp,image/jpeg,image/png,image/gif,*/*;q=0.8",
      "referer":"https://walkingdead.fandom.com/"
    }});
    if(!upstream.ok){res.statusCode=upstream.status===404?404:502;return res.end("Upstream image unavailable");}
    const contentType=(upstream.headers.get("content-type")||"").split(";")[0];
    if(!/^image\\/(?:avif|webp|jpeg|png|gif)$/i.test(contentType)){res.statusCode=502;return res.end("Upstream response is not an image");}
    const body=Buffer.from(await upstream.arrayBuffer());
    if(body.length>MAX_BYTES){res.statusCode=413;return res.end("Image too large");}
    res.setHeader("Content-Type",contentType);
    res.setHeader("Cache-Control","public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000");
    res.setHeader("X-Content-Source","walking-dead-fandom");
    res.statusCode=200;
    return res.end(body);
  }catch{res.statusCode=502;return res.end("Upstream image unavailable");}
}
