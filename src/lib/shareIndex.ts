import {atlasData} from "../data";
import {buildEpisodeWatchOrder} from "./chronology";
import {buildBeats,buildJourney,journeyCandidates,isPlaced} from "./journeys";
import {characterEpisodeCounts,episodeCode,locationEpisodeCounts,storyRange} from "./lookup";
import {fandomEntityImage,fandomPrimaryImage,fandomScaled,isFandomImage} from "./media";
import {locationImage,prettyType} from "./atlasHelpers";
import {SERIES_BY_ID} from "./series";

// Compact, precomputed facts for link previews. `vite build` writes this to
// dist/share-index.json (vite.config.ts); api/share.ts and api/og.ts fetch it
// from their own deployment, so the functions never import the atlas data or
// re-run the journey model at request time. Everything here is derived from
// the same modules the app uses — no separate copy of the logic.

export type ShareJourney={places:number;km:number;series:string[];years:[number|null,number|null];stops:[number,number][];legs:[number,number][];beats:number[]};
export type ShareIndex={
 version:1;
 series:Record<string,{name:string;short:string;color:string}>;
 characters:Record<string,{name:string;image?:string;series:string[];episodes:number;journey?:ShareJourney}>;
 locations:Record<string,{name:string;type:string;series:string;year:number;image?:string;lat?:number;lng?:number;episodes:number}>;
 episodes:Record<string,{title:string;code:string;series:string;year:string;image?:string;order:number}>;
};

// Preview renderers fetch images server-side; only the Fandom CDN resizes and
// can be asked for JPEG/PNG (AMC originals are 1 MB+, local variants are WebP).
function previewImage(...candidates:(string|undefined|null)[]){
 const src=candidates.find(c=>c&&isFandomImage(c));
 if(!src)return undefined;
 const scaled=fandomScaled(src,640);
 return scaled+(scaled.includes("?")?"&":"?")+"format=original";
}

export function buildShareIndex():ShareIndex{
 const series:ShareIndex["series"]={};
 for(const [id,s] of Object.entries(SERIES_BY_ID))series[id]={name:s.name,short:s.short,color:s.color};
 const travellers=new Set(journeyCandidates().map(c=>c.id));
 const characters:ShareIndex["characters"]={};
 for(const c of atlasData.characters as any[]){
  const entry:ShareIndex["characters"][string]={name:c.name,image:previewImage(fandomPrimaryImage("characters",c.id),fandomEntityImage("characters",c.id,c.name)),series:c.seriesIds??[],episodes:characterEpisodeCounts.get(c.id)??0};
  if(travellers.has(c.id)){
   const j=buildJourney(c.id);
   entry.journey={
    places:j.stats.places,km:j.stats.km,series:j.stats.series,years:[j.stats.firstYear,j.stats.lastYear],
    stops:j.stops.map(s=>[Number(s.location.lat),Number(s.location.lng)]),
    legs:j.legs.map(l=>[l.from,l.to]),
    // Story-rank of every stop ×100 — the same value the app writes to ?at=.
    beats:buildBeats([j]).map(b=>Math.round(b.rank*100))
   };
  }
  characters[c.id]=entry;
 }
 const locations:ShareIndex["locations"]={};
 for(const l of atlasData.locations as any[]){
  locations[l.id]={name:l.name,type:prettyType(l.type),series:l.seriesId,year:Number(l.year)||0,image:previewImage(locationImage(l),fandomEntityImage("locations",l.id,l.name)),episodes:locationEpisodeCounts.get(l.id)??0,...(isPlaced(l)?{lat:Number(l.lat),lng:Number(l.lng)}:{})};
 }
 const order=new Map(buildEpisodeWatchOrder().map((e,i)=>[e.id,i+1]));
 const episodes:ShareIndex["episodes"]={};
 for(const e of atlasData.episodes as any[]){
  episodes[e.id]={title:e.title,code:episodeCode(e),series:e.seriesId,year:storyRange(e),image:previewImage(fandomPrimaryImage("episodes",e.id),fandomEntityImage("episodes",e.id,e.title)),order:order.get(e.id)??0};
 }
 return {version:1,series,characters,locations,episodes};
}
