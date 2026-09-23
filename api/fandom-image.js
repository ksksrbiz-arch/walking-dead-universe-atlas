const ALLOWED_HOSTS=new Set(["static.wikia.nocookie.net","vignette.wikia.nocookie.net"]);

export default async function handler(request){
  const requestUrl=new URL(request.url, "https://walking-dead-universe-atlas.vercel.app");
  const source=requestUrl.searchParams.get("url");
  if(!source)return new Response("Missing image URL",{status:400});
  let target;
  try{target=new URL(source)}catch{return new Response("Invalid image URL",{status:400})}
  if(target.protocol!=="https:"||!ALLOWED_HOSTS.has(target.hostname.toLowerCase()))return new Response("Image host not allowed",{status:403});
  try{
    const upstream=await fetch(target.toString(),{
      headers:{
        "user-agent":"TWDU-Atlas/1.0",
        "accept":"image/avif,image/webp,image/jpeg,image/png,image/gif,*/*;q=0.8",
        "referer":"https://walkingdead.fandom.com/"
      }
    });
    if(!upstream.ok)return new Response("Upstream image unavailable",{status:upstream.status===404?404:502,headers:{"cache-control":"public, max-age=60"}});
    const contentType=(upstream.headers.get("content-type")||"").split(";")[0];
    if(!/^image\\/(?:avif|webp|jpeg|png|gif)$/i.test(contentType))return new Response("Upstream response is not an image",{status:502});
    return new Response(upstream.body,{status:200,headers:{
      "content-type":contentType,
      "cache-control":"public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000",
      "x-content-source":"walking-dead-fandom"
    }});
  }catch{return new Response("Upstream image unavailable",{status:502})}
}
