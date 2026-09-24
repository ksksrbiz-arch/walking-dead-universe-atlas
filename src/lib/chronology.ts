import {atlasData} from "../data";
import {getAnchorYearBounds,normalizeTemporalAnchor,compareTemporalAnchors} from "./temporalEngine";

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

let seriesWatchOrderCache:any[]|null=null;
export function getSeriesWatchOrder(){
 if(!seriesWatchOrderCache)seriesWatchOrderCache=atlasData.watchOrder.filter((x:any)=>x.type!=="note");
 return seriesWatchOrderCache;
}

// The universe year axis (outbreak through the latest anchored story year) is used by
// every chronological visualization in the app — the timeline dock, the mobile time
// bar, and any mini-timeline embedded in an entity detail panel. Defining it once here
// means a future chronology correction that pushes the latest year further only needs
// updating in one place, instead of the three-plus hardcoded copies this replaced.
const yearBounds=getAnchorYearBounds(buildChronology().filter(x=>x.start>0));
export const UNIVERSE_MIN_YEAR=Math.min(2010,yearBounds.min);
export const UNIVERSE_MAX_YEAR=Math.max(2028,yearBounds.max);
export function yearToPercent(year:number,min=UNIVERSE_MIN_YEAR,max=UNIVERSE_MAX_YEAR){
 return ((Math.max(min,Math.min(max,year))-min)/(max-min))*100;
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

const seasonNumberBySeasonId=new Map((atlasData.seasons as any[]).map(s=>[s.id,s.season]));

// Many episodes only carry year-level timeline precision (an entire season, or even
// several consecutive seasons, sharing one approximate year), so sorting purely on
// start/end left large same-year clusters ordered by nothing but title text — season 2
// could sort ahead of season 1's pilot, and cross-series ties resolved alphabetically
// rather than by the curated cross-series sequence. watchOrder.json's series-level
// scaffold exists specifically to break those ties (its own note says episode-level
// chronology should still win whenever it actually differs); this was previously wired
// up (getSeriesWatchOrder) but never consulted by the actual episode ordering.
function scaffoldIndex(seriesId:string,seasonNumber:number|undefined):number{
 if(seasonNumber==null)return Infinity;
 const scaffold=getSeriesWatchOrder();
 const index=scaffold.findIndex((w:any)=>w.seriesId===seriesId&&seasonNumber>=w.startSeason&&seasonNumber<=w.endSeason);
 return index===-1?Infinity:index;
}

const resolveStart=(e:any):number=>{const anchor=normalizeTemporalAnchor(e);return anchor.start==null?Number.POSITIVE_INFINITY:anchor.start;};
const resolveEnd=(e:any):number=>{const anchor=normalizeTemporalAnchor(e);return anchor.end==null?Number.POSITIVE_INFINITY:anchor.end;};

// Shared by every place in the app that lists a character's/group's/year's
// episodes and needs them in genuine story order, not just "same approximate
// year, whatever order the source data happened to be in" — accepts either a
// raw episodes.json record (timelineStart/timelineEnd) or a ChronologyItem
// (start/end).
export function compareEpisodesChronologically(a:any,b:any):number{
 const seasonA=seasonNumberBySeasonId.get(a.seasonId||""),seasonB=seasonNumberBySeasonId.get(b.seasonId||"");
 const temporal=compareTemporalAnchors(normalizeTemporalAnchor(a),normalizeTemporalAnchor(b));
 return (temporal==="before"?-1:temporal==="after"?1:0)
  ||resolveStart(a)-resolveStart(b)
  ||resolveEnd(a)-resolveEnd(b)
  ||scaffoldIndex(a.seriesId,seasonA)-scaffoldIndex(b.seriesId,seasonB)
  ||(seasonA??Infinity)-(seasonB??Infinity)
  ||(a.episodeNumber??Infinity)-(b.episodeNumber??Infinity)
  ||String(a.title||"").localeCompare(String(b.title||""));
}

export function buildEpisodeWatchOrder(){
 const episodes=[...buildChronology().filter(x=>x.kind==="episode")].sort(compareEpisodesChronologically);
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
