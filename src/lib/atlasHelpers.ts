import {atlasData} from "../data";
import type {Location} from "../data";
import episodeMedia from "../../data/episodeMedia.json";
import {fandomEntityImage,onAtlasImageError,resolveCharacterImage} from "./media";

// Image candidate scoring and the character priority chain live in ./media
// (single source of truth, also used by EntityGraphView and the media manifest).
export {fandomEntityImage,onAtlasImageError};

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

// (0,0) is the source data's "coordinates not yet researched" sentinel, never a
// real TWDU location — treat it as unplaced regardless of the certainty field.
export const hasMapCoordinates=(location:Location)=>Number.isFinite(Number(location.lat))&&Number.isFinite(Number(location.lng))&&!(Number(location.lat)===0&&Number(location.lng)===0);

export const prettyType=(type?:string)=>String(type||"").replaceAll("-"," ");
const CONNECTION_TYPE_LABELS:Record<string,string>={
 "character-character":"Relationship","character-faction":"Person · faction","character-location":"Person · place","character-community":"Person · community",
 "community-faction":"Community · faction","community-community":"Between communities","faction-community":"Faction · community","community-series":"Community · series",
 "faction-series":"Faction · series","cross-series":"Cross-series","lore":"Lore"
};
export const connectionTypeLabel=(type?:string)=>CONNECTION_TYPE_LABELS[String(type)]||prettyType(type);

// Category is a light classification of each connection's documented label
// (data/README.md "Connection categories") — never a new relationship fact.
const CONNECTION_CATEGORY_LABELS:Record<string,string>={family:"Family",conflict:"Conflict",affiliation:"Affiliation",crossover:"Crossover"};
export const connectionCategoryLabel=(category?:string)=>CONNECTION_CATEGORY_LABELS[String(category)]||prettyType(category);

// ---- Images ---------------------------------------------------------------
const media=(atlasData as any).media;
export const episodeMediaRecord=(id:string)=>(episodeMedia as any).episodes?.[id];
export const episodeImage=(e:{id:string;title:string;seriesId?:string})=>media?.episodes?.[e.id]?.image||episodeMediaRecord(e.id)?.image||fandomEntityImage("episodes",e.id,e.title)||"";
export const locationImage=(l:{id:string;name:string})=>media?.places?.[l.id]?.image||fandomEntityImage("locations",l.id,l.name)||"";
// Curated > Fandom match > series art, via the shared resolver.
export const characterImage=(c:{id:string;name:string;seriesIds?:string[]})=>resolveCharacterImage(c.id,c.name,c.seriesIds).image;
export const seriesKeyArt=(seriesId?:string)=>seriesId?media?.series?.[seriesId]?.image||media?.series?.[seriesId]?.keyArt||"":"";
