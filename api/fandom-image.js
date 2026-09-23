const ALLOWED_HOSTS=new Set(["static.wikia.nocookie.net","vignette.wikia.nocookie.net"]);
const MAX_BYTES=8*1024*1024;

module.exports=async function handler(req,res){
  const source=typeof req.query?.url==="string"?req.query.url:"";
  if(!source)return res.status(400).send("Missing image URL");
  let target;
  try{target=new URL(source)}catch{return res.status(400).send("Invalid image URL")}
  if(target.protocol!=="https:"||!ALLOWED_HOSTS.has(target.hostname.toLowerCase()))return res.status(403).send("Image host not allowed");
  try{
    const upstream=await fetch(target.toString(),{
      headers:{
        "user-agent":"TWDU-Atlas/1.0",
        "accept":"image/avif,image/webp,image/jpeg,image/png,image/gif,*/*;q=0.8",
        "referer":"https://walkingdead.fandom.com/"
      }
    });
    if(!upstream.ok)return res.status(upstream.status===404?404:502).send("Upstream image unavailable");
    const contentType=(upstream.headers.get("content-type")||"").split(";")[0];
    if(!/^image\\/(?:avif|webp|jpeg|png|gif)$/i.test(contentType))return res.status(502).send("Upstream response is not an image");
    const body=Buffer.from(await upstream.arrayBuffer());
    if(body.length>MAX_BYTES)return res.status(413).send("Image too large");
    res.setHeader("Content-Type",contentType);
    res.setHeader("Cache-Control","public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000");
    res.setHeader("X-Content-Source","walking-dead-fandom");
    return res.status(200).send(body);
  }catch{return res.status(502).send("Upstream image unavailable")}
};
