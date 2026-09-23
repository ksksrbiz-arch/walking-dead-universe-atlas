import episodeMedia from "../../data/episodeMedia.json";
import media from "../../data/media.json";

export default async function handler(){
  return new Response(JSON.stringify({
    version:"5-vercel",
    episodeMedia,
    media,
  }),{headers:{
    "content-type":"application/json; charset=utf-8",
    "cache-control":"public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
    "x-atlas-runtime-version":"5-vercel",
  }});
}
