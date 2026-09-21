import {atlasData} from "../data";

export type ChronologyItem={
 id:string;
 kind:"episode"|"event"|"universe-event";
 seriesId:string;
 seasonId?:string;
 episodeNumber?:number;
 title:string;
 start:number;
 end:number;
 precision:string;
 certainty:string;
 locationIds?:string[];
 characterIds?:string[];
 communityIds?:string[];
 factionIds?:string[];
 connectionIds?:string[];
 sources?:string[];
};

// atlasData is static after load, so the built (and sorted) chronology never changes
// between calls. Every caller only reads/filters the result, so it's safe to build it
// once and reuse it — this was previously being rebuilt and re-sorted from scratch on
// every call, including every autoplay tick and every episode-detail navigation.
let chronologyCache:ChronologyItem[]|null=null;
export function buildChronology(){
 if(chronologyCache)return chronologyCache;
 const episodes=(atlasData as any).episodes ?? [];
 const episodeItems:ChronologyItem[]=episodes.map((e:any)=>({
  id:e.id,kind:"episode",seriesId:e.seriesId,seasonId:e.seasonId,episodeNumber:e.episodeNumber,
  title:e.title,start:e.timelineStart ?? e.timelineEnd ?? e.airDate?.slice(0,4) ?? 0,
  end:e.timelineEnd ?? e.timelineStart ?? e.airDate?.slice(0,4) ?? 0,
  precision:e.timelinePrecision ?? "unknown",certainty:e.certainty ?? "unknown",locationIds:e.locationIds??[],characterIds:e.characterIds??[],communityIds:e.communityIds??[],factionIds:e.factionIds??[],connectionIds:e.connectionIds??[],sources:e.sources??[]
 }));
 const eventItems:ChronologyItem[]=atlasData.events.map((e:any)=>({
  id:e.id,kind:"event",seriesId:e.seriesId,title:e.title,start:e.year,end:e.year,
  precision:e.precision ?? "year",certainty:e.certainty ?? "unknown",locationIds:e.locationIds??[],characterIds:e.characterIds??[],communityIds:e.communityIds??[],factionIds:e.factionIds??[],connectionIds:e.connectionIds??[],sources:e.sources??[]
 }));
 const universeEventItems:ChronologyItem[]=(atlasData as any).universeEvents.map((e:any)=>({
  id:e.id,kind:"universe-event",seriesId:e.seriesId,title:e.title,start:Number(e.year),end:Number(e.year),
  precision:e.date?"day":"year",certainty:e.certainty ?? "unknown",locationIds:e.locationIds??[],characterIds:e.characterIds??[],communityIds:e.communityIds??[],factionIds:e.factionIds??[],connectionIds:e.connectionIds??[],sources:e.sources??[]
 }));
 chronologyCache=[...episodeItems,...eventItems,...universeEventItems].sort((a,b)=>a.start-b.start||a.end-b.end||a.title.localeCompare(b.title));
 return chronologyCache;
}

export function filterChronology(year:number,seriesId?:string){
 return buildChronology().filter(x=>x.start<=year&&(!seriesId||x.seriesId===seriesId));
}

export function getSeriesWatchOrder(){
 return atlasData.watchOrder.filter((x:any)=>x.type!=="note");
}

// events.json is a curated set of named story-era markers (e.g. "TWD S3 — Prison /
// Woodbury", "Dead City — Manhattan") anchored to the same in-universe year system as
// everything else. The current year is otherwise shown as a bare number everywhere in
// the UI, which tells a visitor *when* they are but not *where in the story* — the
// product's stated loop is Time -> Story -> Geography, so the year needs a narrative
// label riding along with it. Sorting once and reusing (like buildChronology's cache)
// avoids re-sorting ~15 items on every year-scrub tick.
let eraCache:{year:number;title:string}[]|null=null;
export function describeEra(year:number):{title:string;short:string}{
 if(!eraCache)eraCache=[...atlasData.events].map((e:any)=>({year:Number(e.year),title:e.title})).sort((a,b)=>b.year-a.year);
 const era=eraCache.find(e=>e.year<=year)??eraCache[eraCache.length-1];
 if(!era)return {title:"Unmapped era",short:"UNMAPPED"};
 const short=era.title.includes(" — ")?era.title.split(" — ")[1]:era.title;
 return {title:era.title,short};
}

export type EpisodeWatchOrderItem=ChronologyItem & {
 sequence:number;
 chronologyStatus:"anchored"|"shared-year"|"unknown";
 orderingBasis:"timeline-anchor"|"timeline-window";
};

export function buildEpisodeWatchOrder(){
 const episodes=buildChronology().filter(x=>x.kind==="episode");
 return episodes.map((item,index,all)=>{
  const sameWindow=all.some(other=>other.id!==item.id&&other.start===item.start&&other.end===item.end);
  const unknown=item.precision==="unknown"||!Number.isFinite(item.start)||item.start<=0;
  return {
   ...item,
   sequence:index+1,
   chronologyStatus:unknown?"unknown":sameWindow?"shared-year":"anchored",
   orderingBasis:item.precision==="year"?"timeline-window":"timeline-anchor"
  } as EpisodeWatchOrderItem;
 });
}

export function getEpisodeWatchOrder(seriesId?:string){
 const order=buildEpisodeWatchOrder();
 return seriesId?order.filter(item=>item.seriesId===seriesId):order;
}
