import { getStore } from "@netlify/blobs";
import type { Config } from "@netlify/functions";
import episodeMedia from "../../data/episodeMedia.json";
import media from "../../data/media.json";

export default async () => {
  const store=getStore("atlas-runtime");
  const key="media-manifest-v2";
  let manifest=await store.get(key,{type:"json"}) as any;
  const sourceUpdatedAt=(episodeMedia as any).updatedAt||"";
  if(!manifest || manifest.sourceUpdatedAt!==sourceUpdatedAt){
    manifest={version:2,generatedAt:new Date().toISOString(),sourceUpdatedAt,episodeMedia,media};
    await store.setJSON(key,manifest);
  }
  return new Response(JSON.stringify(manifest),{
    headers:{
      "content-type":"application/json; charset=utf-8",
      "Netlify-CDN-Cache-Control":"public, durable, max-age=3600, stale-while-revalidate=86400",
      "cache-control":"public, max-age=300, stale-while-revalidate=3600"
    }
  });
};
export const config:Config={path:"/api/atlas/media"};
