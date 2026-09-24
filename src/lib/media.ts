import type {SyntheticEvent} from "react";
import localMedia from "../generated/media-local.json";
import fandomCanonical from "../../data/enrichment/fandom-canonical.json";
import mediaData from "../../data/media.json";
import {observeImageError} from "./performance";

const MEDIA_PROXY=import.meta.env.VITE_ATLAS_MEDIA_PROXY||"https://qflqfvoxdzkibpzfrwop.supabase.co/functions/v1/atlas-media";
const LOCAL_MEDIA=localMedia as Record<string,string>;

// Picks the best-matching image candidate for an entity out of the Fandom
// enrichment data by scoring name-token overlap, penalizing generic
// key-art/poster-style matches. This is the single source of truth for that
// heuristic - every surface that renders a character/location/episode image
// (people grid, character dossier, relationship graph, search, location
// cards/detail, episode detail/timeline) goes through this, so a fix here
// fixes every surface at once instead of drifting between hand-copied logic.
export function fandomEntityImage(entityType:"characters"|"locations"|"episodes",id:string,name:string){
 const record=(fandomCanonical as any)?.[entityType]?.[id];
 const candidates=[
  ...(Array.isArray(record?.image_urls)?record.image_urls:[]),
  ...(record?.details?.imageFiles||[]).flatMap((x:any)=>[x?.url,x?.thumbnail].filter(Boolean)),
  ...(Array.isArray(record?.hints?.imageGallery)?record.hints.imageGallery:[]),
  ...(Array.isArray(record?.hints?.image)?record.hints.image:record?.hints?.image?[record.hints.image]:[])
 ].filter((x:any)=>typeof x==="string"&&/^https?:\/\//i.test(x));
 if(!candidates.length)return "";
 const tokens=String(name).toLowerCase().replace(/[^a-z0-9 ]+/g," ").split(/\s+/).filter((x)=>x.length>=3&&!["the","tv","universe","series"].includes(x));
 const generic=/logo|title.?card|key.?art|series.?art|franchise|ensemble|group.?photo|cast.?photo|promo|poster|banner|background|wallpaper/i;
 const scored=[...new Set(candidates)].map((url:string)=>{
  const hay=url.toLowerCase().replace(/[_-]+/g," ");
  const matches=tokens.filter(t=>hay.includes(t)).length;
  let score=matches*30+(matches===tokens.length&&tokens.length?70:0);
  if(generic.test(hay))score-=90;
  return {url,score};
 }).sort((a,b)=>b.score-a.score);
 return scored[0]?.score>0?scored[0].url:"";
}

export type EntityImageMethod="curated"|"fandom"|"series-fallback"|"none";

// Curated data/media.json entry (a human- or ingestion-verified pick) always wins over the
// Fandom heuristic guess above; series key art is the last-resort fallback so a card never
// renders with nothing at all, unless a surface explicitly opts out (fallbackToSeriesArt:false)
// because showing generic art there would be worse than showing no image (e.g. LocationDetail's
// hero, where a wrong-looking generic fallback reads as a real photo of the wrong thing).
export function resolveCharacterImage(id:string,name:string,seriesIds?:string[],options?:{fallbackToSeriesArt?:boolean}):{image:string;method:EntityImageMethod}{
 const curated=(mediaData as any).characters?.[id];
 if(curated?.image)return {image:curated.image,method:"curated"};
 const fandomImage=fandomEntityImage("characters",id,name);
 if(fandomImage)return {image:fandomImage,method:"fandom"};
 if(options?.fallbackToSeriesArt!==false){
  const seriesId=seriesIds?.[0];
  const fallback=seriesId?((mediaData as any).series?.[seriesId]?.image||(mediaData as any).series?.[seriesId]?.keyArt):"";
  if(fallback)return {image:fallback,method:"series-fallback"};
 }
 return {image:"",method:"none"};
}

function isFandomImage(source:string){
  return /^https?:\/\/(?:static\.wikia\.nocookie\.net|vignette\.wikia\.nocookie\.net|images\.wikia\.nocookie\.net)\//i.test(source);
}

export function atlasImageUrl(source:string|undefined|null,width=1200,quality=78){
  if(!source)return "";
  if(source.startsWith("/"))return source;
  const local=LOCAL_MEDIA[source];
  if(local)return local;
  if(isFandomImage(source)||/^https?:\/\/(?:images|dimages)\.cds\.amcn\.com\//i.test(source)){
    const url=new URL(MEDIA_PROXY);
    url.searchParams.set("url",source);
    return url.toString();
  }
  return source;
}

// A proxied Fandom/AMC URL can fail (proxy hiccup, size cap, dead upstream) even when the
// raw source itself still resolves. On first failure, retry once against the raw source
// directly, bypassing the proxy. A second failure hides the image (no loop, and no
// broken-image glyph) so whatever placeholder sits behind it shows instead.
export function onAtlasImageError(e:SyntheticEvent<HTMLImageElement>,source:string){
  const img=e.currentTarget;
  if(!source||img.dataset.fallback==="1"){img.dataset.failed="1";img.style.visibility="hidden";return;}
  observeImageError(source);
  img.dataset.fallback="1";
  img.removeAttribute("srcset");
  img.src=source;
}

export function atlasImageSrcSet(source:string|undefined|null,widths=[480,768,1200]){
  if(!source)return undefined;
  const local=LOCAL_MEDIA[source];
  if(local)return widths.map(w=>`${local} ${w}w`).join(", ");
  return undefined;
}
