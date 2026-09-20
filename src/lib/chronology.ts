import {atlasData} from "../data";

export type ChronologyItem={
 id:string;
 kind:"episode"|"event";
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
 chronologyCache=[...episodeItems,...eventItems].sort((a,b)=>a.start-b.start||a.end-b.end||a.title.localeCompare(b.title));
 return chronologyCache;
}

export function filterChronology(year:number,seriesId?:string){
 return buildChronology().filter(x=>x.start<=year&&(!seriesId||x.seriesId===seriesId));
}

export function getSeriesWatchOrder(){
 return atlasData.watchOrder.filter((x:any)=>x.type!=="note");
}
