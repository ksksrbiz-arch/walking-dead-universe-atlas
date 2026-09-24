import type {Location} from "../data";
import {buildEpisodeWatchOrder,compareEpisodesChronologically} from "./chronology";
import {getCharacterEpisodeIds} from "./entityGraph";
import {characterById,episodeById,locationById} from "./lookup";

// Character journeys, derived only from what the atlas actually records:
// the episodes a character appears in, those episodes' places, and the
// in-universe story order. There is no travel data, so a "leg" means "the next
// recorded place": drawn as a straight line from the nearest place the
// character was just recorded at, and labelled with the episodes on either
// side of it — never an invented route or date.
//
// Episode place lists are episode-level (a TWD season-8 episode lists
// Alexandria, the Sanctuary, the Kingdom and the Hilltop). Ordering those
// per episode zig-zags through the same four places dozens of times, so the
// model works in chapters: while an episode shares any place with the current
// chapter the character is "around" those places and only newly reached places
// become stops; an episode with no overlap starts a new chapter (a relocation).
//
// Pure module (no React, no DOM, no import.meta) so the share/OG function can
// reuse it server-side.

export type JourneyStop={
 index:number;
 location:Location;
 /** Episodes (story order) that place this character here. */
 episodeIds:string[];
 startYear:number|null;
 endYear:number|null;
 seriesId:string;
 /** 1-based number of this distinct place, in first-visit order. */
 place:number;
 /** 1 on the first visit, 2+ when the journey comes back. */
 visit:number;
 /** Story-order rank of the first evidencing episode (fractional when one episode yields several stops). */
 rank:number;
 /** Increments whenever the character leaves every place they were around. */
 chapter:number;
 /** Stop this one was reached from (null for the very first place). */
 from:number|null;
};
export type JourneyLeg={
 index:number;from:number;to:number;
 /** Last episode recorded at the origin, first episode recorded at the destination. */
 leaveEpisodeId:string;arriveEpisodeId:string;
 /** Great-circle distance between the two places — not a travelled route. */
 km:number;
 crossesSeries:boolean;
};
export type Journey={
 characterId:string;
 name:string;
 stops:JourneyStop[];
 legs:JourneyLeg[];
 /** Every episode considered, story order (includes episodes with no mapped place). */
 episodeIds:string[];
 /** Episodes removed by spoiler-safe mode. */
 hiddenEpisodeCount:number;
 /** Episodes kept that have no mapped place. */
 unplacedEpisodeCount:number;
 stats:{places:number;revisits:number;series:string[];km:number;firstYear:number|null;lastYear:number|null};
};

export const isPlaced=(l?:Location|null):l is Location=>!!l&&Number.isFinite(Number(l.lat))&&Number.isFinite(Number(l.lng))&&!(Number(l.lat)===0&&Number(l.lng)===0);

let rankCache:Map<string,number>|null=null;
/** Story-order rank (0-based) for every episode, shared with the Watch order. */
export function episodeRank(id:string){
 if(!rankCache)rankCache=new Map(buildEpisodeWatchOrder().map((e,i)=>[e.id,i]));
 return rankCache.get(id)??Number.MAX_SAFE_INTEGER;
}

export function haversineKm(a:{lat:number|string;lng:number|string},b:{lat:number|string;lng:number|string}){
 const R=6371,toRad=(d:number)=>d*Math.PI/180;
 const la1=toRad(Number(a.lat)),la2=toRad(Number(b.lat)),dLa=la2-la1,dLo=toRad(Number(b.lng)-Number(a.lng));
 const h=Math.sin(dLa/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dLo/2)**2;
 return 2*R*Math.asin(Math.min(1,Math.sqrt(h)));
}

const yearOf=(e:any,end=false)=>{const y=Number(end?e.timelineEnd??e.timelineStart:e.timelineStart??e.timelineEnd);return Number.isFinite(y)&&y>0?y:null};

export type JourneyOptions={
 /** Spoiler-safe: only episodes in this set count (e.g. the viewer's watched episodes). */
 onlyEpisodes?:Set<string>|null;
};

export function buildJourney(characterId:string,options:JourneyOptions={}):Journey{
 const all=getCharacterEpisodeIds(characterId).map(id=>episodeById.get(id)).filter(Boolean) as any[];
 all.sort((a,b)=>episodeRank(a.id)-episodeRank(b.id)||compareEpisodesChronologically(a,b));
 const only=options.onlyEpisodes;
 const eps=only?all.filter(e=>only.has(e.id)):all;
 const stops:JourneyStop[]=[],legs:JourneyLeg[]=[];
 const placeNumbers=new Map<string,number>(),visits=new Map<string,number>();
 // The places the character is currently "around" (see chapter note above).
 let active=new Map<string,JourneyStop>(),chapter=0,unplaced=0;
 const extend=(s:JourneyStop,e:any)=>{
  if(s.episodeIds[s.episodeIds.length-1]!==e.id)s.episodeIds.push(e.id);
  const y0=yearOf(e),y1=yearOf(e,true);
  if(y0!=null)s.startYear=s.startYear==null?y0:Math.min(s.startYear,y0);
  if(y1!=null)s.endYear=s.endYear==null?y1:Math.max(s.endYear,y1);
 };
 for(const e of eps){
  const locs=[...new Set((e.locationIds??[]) as string[])].map(id=>locationById.get(id)).filter(isPlaced);
  if(!locs.length){unplaced++;continue}
  const continuing=locs.some(l=>active.has(l.id));
  const origins=[...active.values()];
  if(!continuing){active=new Map();chapter++}
  let k=0;
  for(const l of locs){
   const here=active.get(l.id);
   if(here){extend(here,e);continue}
   // Newly reached place: the leg starts at the nearest place the character
   // was recorded at just before (this episode's earlier arrivals included).
   const pool=[...active.values(),...(continuing?[]:origins)];
   const from=pool.reduce<JourneyStop|null>((best,s)=>!best||haversineKm(s.location,l)<haversineKm(best.location,l)?s:best,null);
   if(!placeNumbers.has(l.id))placeNumbers.set(l.id,placeNumbers.size+1);
   const visit=(visits.get(l.id)??0)+1;visits.set(l.id,visit);
   const stop:JourneyStop={index:stops.length,location:l,episodeIds:[],startYear:null,endYear:null,seriesId:e.seriesId,place:placeNumbers.get(l.id)!,visit,rank:episodeRank(e.id)+k++/100,chapter,from:from?.index??null};
   extend(stop,e);stops.push(stop);active.set(l.id,stop);
   if(from){
    const leave=from.episodeIds[from.episodeIds.length-1];
    legs.push({index:legs.length,from:from.index,to:stop.index,leaveEpisodeId:leave,arriveEpisodeId:e.id,km:Math.round(haversineKm(from.location,l)),crossesSeries:(episodeById.get(leave) as any)?.seriesId!==e.seriesId});
   }
  }
 }
 const years=stops.flatMap(s=>[s.startYear,s.endYear]).filter((y):y is number=>y!=null);
 return {
  characterId,
  name:(characterById.get(characterId) as any)?.name??characterId,
  stops,legs,
  episodeIds:eps.map(e=>e.id),
  hiddenEpisodeCount:all.length-eps.length,
  unplacedEpisodeCount:unplaced,
  stats:{
   places:placeNumbers.size,
   revisits:stops.length-placeNumbers.size,
   series:[...new Set(eps.map(e=>e.seriesId))],
   km:legs.reduce((s,l)=>s+l.km,0),
   firstYear:years.length?Math.min(...years):null,
   lastYear:years.length?Math.max(...years):null
  }
 };
}

// ---- Playback across one or more journeys ------------------------------------
// A beat is one moment in story order at which at least one of the compared
// characters reaches a stop. Stepping through beats plays every journey in
// lockstep, so comparing Daryl and Carol shows who moved when.
export type JourneyBeat={rank:number;moves:{journey:number;stop:number}[]};

export function buildBeats(journeys:Journey[]):JourneyBeat[]{
 const byRank=new Map<number,JourneyBeat>();
 journeys.forEach((j,ji)=>j.stops.forEach((s,si)=>{
  let beat=byRank.get(s.rank);
  if(!beat){beat={rank:s.rank,moves:[]};byRank.set(s.rank,beat)}
  beat.moves.push({journey:ji,stop:si});
 }));
 return [...byRank.values()].sort((a,b)=>a.rank-b.rank);
}

/** Index of each journey's current stop at a beat (-1 = not started yet). */
export function positionsAt(journeys:Journey[],beats:JourneyBeat[],cursor:number){
 const rank=beats[Math.max(0,Math.min(cursor,beats.length-1))]?.rank??-1;
 return journeys.map(j=>{let at=-1;for(const s of j.stops){if(s.rank<=rank)at=s.index;else break}return at});
}

/** Last beat whose story year is at or before `year` (for syncing the year scrubber). */
export function beatForYear(journeys:Journey[],beats:JourneyBeat[],year:number){
 let found=0;
 beats.forEach((b,i)=>{const m=b.moves[0];const y=journeys[m.journey]?.stops[m.stop]?.startYear;if(y!=null&&y<=year)found=i});
 return found;
}

export function beatYear(journeys:Journey[],beat?:JourneyBeat){
 const m=beat?.moves[0];return m?journeys[m.journey]?.stops[m.stop]?.startYear??null:null;
}

// ---- Crossings ------------------------------------------------------------------
// "Together": an episode both characters appear in, at one of its mapped
// places. "Same ground": a place both journeys pass through, but never in a
// shared episode — they were there at different times.
export type Crossing={a:number;b:number;location:Location;episodeIds:string[];together:boolean};

export function findCrossings(journeys:Journey[]):Crossing[]{
 const out:Crossing[]=[];
 for(let a=0;a<journeys.length;a++)for(let b=a+1;b<journeys.length;b++){
  const A=journeys[a],B=journeys[b];
  const shared=new Set(A.episodeIds.filter(id=>B.episodeIds.includes(id)));
  const together=new Map<string,string[]>();
  for(const id of [...shared].sort((x,y)=>episodeRank(x)-episodeRank(y))){
   for(const lid of ((episodeById.get(id) as any)?.locationIds??[]) as string[]){
    if(!isPlaced(locationById.get(lid)))continue;
    together.set(lid,[...(together.get(lid)??[]),id]);
   }
  }
  for(const [lid,ids] of together)out.push({a,b,location:locationById.get(lid)!,episodeIds:ids,together:true});
  const placesA=new Map(A.stops.map(s=>[s.location.id,s])),placesB=new Set(B.stops.map(s=>s.location.id));
  for(const [lid,s] of placesA)if(placesB.has(lid)&&!together.has(lid))out.push({a,b,location:s.location,episodeIds:[],together:false});
 }
 return out.sort((x,y)=>Number(y.together)-Number(x.together)||y.episodeIds.length-x.episodeIds.length||x.location.name.localeCompare(y.location.name));
}

// Journeys are drawn in slot colours (not series colours) so two characters
// from the same show stay distinguishable. Chosen for contrast on the dark map.
export const JOURNEY_COLORS=["#f2b84b","#5ec8e0","#ef6f86"] as const;
export const MAX_COMPARE=3;

/** Characters with at least two mapped stops, most-travelled first (compare picker). */
let travellersCache:{id:string;name:string;places:number}[]|null=null;
export function journeyCandidates(){
 if(!travellersCache){
  travellersCache=[...characterById.keys()].map(id=>{const j=buildJourney(id);return {id,name:j.name,places:j.stats.places,stops:j.stops.length}})
   .filter(x=>x.stops>1).map(({id,name,places})=>({id,name,places})).sort((a,b)=>b.places-a.places||a.name.localeCompare(b.name));
 }
 return travellersCache;
}

// ---- Share state ------------------------------------------------------------------
export function parseJourneyIds(raw:string|null|undefined){
 return [...new Set(String(raw||"").split(/[,+ ]/).map(s=>s.trim()).filter(id=>characterById.has(id)))].slice(0,MAX_COMPARE);
}
