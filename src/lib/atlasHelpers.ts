import type {SyntheticEvent} from "react";
import {atlasData} from "../data";
import type {Location} from "../data";
import fandomCanonical from "../../data/enrichment/fandom-canonical.json";
import episodeMedia from "../../data/episodeMedia.json";
import {observeImageError} from "./performance";

export const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));

// ---- Map layers -----------------------------------------------------------
export type MapLayer="ALL"|"SETTLEMENTS"|"FACILITIES"|"LANDMARKS"|"INFRASTRUCTURE"|"REGIONS";
export const MAP_LAYERS:MapLayer[]=["ALL","SETTLEMENTS","FACILITIES","LANDMARKS","INFRASTRUCTURE","REGIONS"];
export const MAP_LAYER_LABELS:Record<MapLayer,string>={ALL:"Everything",SETTLEMENTS:"Settlements",FACILITIES:"Facilities",LANDMARKS:"Landmarks",INFRASTRUCTURE:"Routes & infrastructure",REGIONS:"Regions"};
const LOCATION_LAYER_TYPES:Record<Exclude<MapLayer,"ALL">,Set<string>>={
 SETTLEMENTS:new Set(["city","town","community","stronghold","safe-zone","neighborhood","district","residence","farm","ranch","reservation","outpost","trading-center"]),
 FACILITIES:new Set(["facility","hospital","prison","medical-facility","military-facility","industrial","hotel","retail","store","restaurant","workshop","store-plaza","church","stadium","bunker"]),
 LANDMARKS:new Set(["landmark","park","boat","cabin","vineyard","jungle","crash-site"]),
 INFRASTRUCTURE:new Set(["dam","route","bridge","transit","rail-yard","dock","river","international-border"]),
 REGIONS:new Set(["region","country","state","territory","county","island"])
};
export const locationMapLayer=(type:string):MapLayer=>{
 for(const [layer,types] of Object.entries(LOCATION_LAYER_TYPES) as [Exclude<MapLayer,"ALL">,Set<string>][])if(types.has(type))return layer;
 return "LANDMARKS";
};

export type LocationIcon="city"|"community"|"facility"|"hospital"|"farm"|"prison"|"boat"|"route"|"region"|"residence"|"ranch"|"dam"|"territory"|"country"|"landmark"|"stronghold";
const DIRECT_ICONS=new Set(["city","community","facility","hospital","farm","prison","boat","route","region","residence","ranch","dam","territory","country","landmark","stronghold"]);
const ICON_ALIASES:Record<string,LocationIcon>={
 town:"community",neighborhood:"community",district:"community","safe-zone":"stronghold",outpost:"stronghold",reservation:"community","trading-center":"community",
 "medical-facility":"hospital","military-facility":"facility",industrial:"facility",hotel:"facility",retail:"facility",store:"facility",restaurant:"facility",workshop:"facility","store-plaza":"facility",church:"landmark",stadium:"landmark",park:"landmark",cabin:"residence",bunker:"stronghold",vineyard:"farm",jungle:"region","crash-site":"landmark",island:"region",state:"region",county:"region",bridge:"route",transit:"route","rail-yard":"route",dock:"route",river:"route","international-border":"route"
};
export const locationIconName=(type:string):LocationIcon=>DIRECT_ICONS.has(type)?type as LocationIcon:(ICON_ALIASES[type]||"facility");

// Unknown (0,0) placements must never render at null island.
export const hasMapCoordinates=(location:Location)=>Number.isFinite(Number(location.lat))&&Number.isFinite(Number(location.lng))&&!(Number(location.lat)===0&&Number(location.lng)===0&&location.certainty==="unknown");

export const prettyType=(type?:string)=>String(type||"").replaceAll("-"," ");
const CONNECTION_TYPE_LABELS:Record<string,string>={
 "character-character":"Relationship","character-faction":"Person · faction","character-location":"Person · place","character-community":"Person · community",
 "community-faction":"Community · faction","community-community":"Between communities","faction-community":"Faction · community","community-series":"Community · series",
 "faction-series":"Faction · series","cross-series":"Cross-series","lore":"Lore"
};
export const connectionTypeLabel=(type?:string)=>CONNECTION_TYPE_LABELS[String(type)]||prettyType(type);

// ---- Images ---------------------------------------------------------------
// First failure retries the unproxied source; a second failure hides the image
// so the styled placeholder behind it shows instead of a broken-image glyph.
export const onAtlasImageError=(e:SyntheticEvent<HTMLImageElement>,source:string)=>{
 const img=e.currentTarget;
 if(!source||img.dataset.fallback==="1"){img.dataset.failed="1";img.style.visibility="hidden";return;}
 observeImageError(source);img.dataset.fallback="1";img.removeAttribute("srcset");img.src=source;
};

export const fandomEntityImage=(entityType:"characters"|"locations"|"episodes",id:string,name:string)=>{
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
};

const media=(atlasData as any).media;
export const episodeMediaRecord=(id:string)=>(episodeMedia as any).episodes?.[id];
export const episodeImage=(e:{id:string;title:string;seriesId?:string})=>media?.episodes?.[e.id]?.image||episodeMediaRecord(e.id)?.image||fandomEntityImage("episodes",e.id,e.title)||"";
export const locationImage=(l:{id:string;name:string})=>media?.places?.[l.id]?.image||fandomEntityImage("locations",l.id,l.name)||"";
export const characterImage=(c:{id:string;name:string})=>media?.characters?.[c.id]?.image||fandomEntityImage("characters",c.id,c.name)||"";
export const seriesKeyArt=(seriesId?:string)=>seriesId?media?.series?.[seriesId]?.keyArt||"":"";
