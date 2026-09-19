import { getStore } from "@netlify/blobs";
import type { Config } from "@netlify/functions";

export default async()=>{
  const store=getStore("atlas-runtime");
  const manifest=await store.get("media-manifest-v1",{type:"json"}) as any;
  if(!manifest)return;
  const sources=new Set<string>();
  for(const item of Object.values(manifest.media?.series??{}) as any[]) if(item?.keyArt)sources.add(item.keyArt);
  for(const item of Object.values(manifest.media?.places??{}) as any[]) if(item?.image)sources.add(item.image);
  for(const item of Object.values(manifest.media?.characters??{}) as any[]) if(item?.image)sources.add(item.image);
  for(const item of Object.values(manifest.media?.episodes??{}) as any[]) if(item?.image)sources.add(item.image);
  const base=Netlify.env.get("URL")||"https://walking-dead-universe-atlas.netlify.app";
  const targets=[...sources].slice(0,80);
  await Promise.allSettled(targets.map(async source=>{
    const u=new URL("/.netlify/images",base);
    u.searchParams.set("url",source);
    u.searchParams.set("w","1200");
    u.searchParams.set("q","78");
    await fetch(u);
  }));
  await store.setJSON("media-warm-state",{updatedAt:new Date().toISOString(),attempted:targets.length});
};
export const config:Config={schedule:"0 */6 * * *"};
