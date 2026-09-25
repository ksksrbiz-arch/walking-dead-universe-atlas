import type {SyntheticEvent} from "react";
import localMedia from "../generated/media-local.json";
import fandomCanonical from "../../data/enrichment/fandom-canonical.json";
import mediaData from "../../data/media.json";
import {observeImageError} from "./performance";

// `?.`: this module is also bundled into the share/OG function (no Vite env there).
const MEDIA_PROXY=import.meta.env?.VITE_ATLAS_MEDIA_PROXY||"https://qflqfvoxdzkibpzfrwop.supabase.co/functions/v1/atlas-media";
// source URL -> locally generated resized copies. A plain string is a single
// local file (legacy cache-amc-media output); an object maps width -> path
// (media:resize output, used for AMC sources whose CDN cannot resize).
type LocalEntry=string|Record<string,string>;
const LOCAL_MEDIA=localMedia as Record<string,LocalEntry>;

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

// The first image on the entity's *own* matched wiki page (its infobox image).
// For episodes this is the episode's still and needs no name-token match —
// filenames like "FTWD_1x01_Traffic_Jam.jpg" never contain the title "Pilot".
const GENERIC_IMAGE=/logo|title.?card|key.?art|series.?art|franchise|poster|banner|wallpaper/i;
export function fandomPrimaryImage(entityType:"characters"|"locations"|"episodes",id:string){
 const urls=(fandomCanonical as any)?.[entityType]?.[id]?.image_urls;
 return (Array.isArray(urls)?urls:[]).find((u:string)=>typeof u==="string"&&/^https?:\/\//.test(u)&&!GENERIC_IMAGE.test(u))||"";
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

export function isFandomImage(source:string){
  return /^https?:\/\/(?:static\.wikia\.nocookie\.net|vignette\.wikia\.nocookie\.net|images\.wikia\.nocookie\.net)\//i.test(source);
}
const isAmcImage=(source:string)=>/^https?:\/\/(?:images|dimages)\.cds\.amcn\.com\//i.test(source);

// Fandom's image CDN resizes on request (…/revision/latest/scale-to-width-down/W):
// a full-size still is ~1.2 MB, the 320px variant ~16 KB. Every Fandom image is
// requested at the width it is displayed at instead of at source size.
export function fandomScaled(source:string,width:number){
  if(!isFandomImage(source))return source;
  const w=Math.max(16,Math.round(width));
  if(/\/scale-to-width(?:-down)?\/\d+/.test(source))return source.replace(/\/scale-to-width(?:-down)?\/\d+/,"/scale-to-width-down/"+w);
  if(/\/revision\/latest/.test(source))return source.replace(/\/revision\/latest/,"/revision/latest/scale-to-width-down/"+w);
  return source;
}

function localVariants(source:string):[number,string][]{
  const entry=LOCAL_MEDIA[source];
  if(!entry)return [];
  if(typeof entry==="string")return [[1600,entry]];
  return Object.entries(entry).map(([w,p])=>[Number(w),p] as [number,string]).sort((a,b)=>a[0]-b[0]);
}

function proxied(source:string){
  const url=new URL(MEDIA_PROXY);
  url.searchParams.set("url",source);
  return url.toString();
}

export function atlasImageUrl(source:string|undefined|null,width=1200,_quality=78){
  if(!source)return "";
  if(source.startsWith("/"))return source;
  const local=localVariants(source);
  if(local.length)return (local.find(([w])=>w>=width)??local[local.length-1])[1];
  if(isFandomImage(source))return proxied(fandomScaled(source,width));
  if(isAmcImage(source))return proxied(source);
  return source;
}

// Responsive candidates. Fandom sources get CDN-resized widths; AMC sources
// get their locally generated WebP variants (see scripts/resize-amc-media.mjs).
export function atlasImageSrcSet(source:string|undefined|null,widths=[480,768,1200]){
  if(!source||source.startsWith("/"))return undefined;
  const local=localVariants(source);
  if(local.length>1)return local.map(([w,p])=>`${p} ${w}w`).join(", ");
  if(isFandomImage(source))return widths.map(w=>`${proxied(fandomScaled(source,w))} ${w}w`).join(", ");
  return undefined;
}

// A tiny (~1 KB) version used as a blurred placeholder while the real image
// loads. Only available where the host can resize (Fandom) or a small local
// variant exists; otherwise the caller's gradient placeholder shows.
export function atlasImagePlaceholder(source:string|undefined|null){
  if(!source)return "";
  const local=localVariants(source);
  if(local.length&&local[0][0]<=360)return local[0][1];
  if(isFandomImage(source))return proxied(fandomScaled(source,40));
  return "";
}

export type MediaCredit={label:string;href?:string};
export function mediaCredit(source:string|undefined|null,page?:string):MediaCredit|null{
  if(!source)return null;
  if(isFandomImage(source))return {label:"Walking Dead Wiki (Fandom)",href:page||"https://walkingdead.fandom.com/"};
  if(isAmcImage(source))return {label:"AMC",href:page||"https://www.amc.com/"};
  if(source.startsWith("/media/characters/"))return {label:"Atlas artwork"};
  return null;
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
  // Direct (unproxied) retry, still resized where the host allows it.
  img.src=isFandomImage(source)?fandomScaled(source,Math.max(320,Math.round((img.clientWidth||400)*2))):source;
}
