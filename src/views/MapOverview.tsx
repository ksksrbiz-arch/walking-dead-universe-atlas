import {useMemo} from "react";
import type {CSSProperties} from "react";
import Icon from "../components/Icon";
import {AtlasImage,PlaceRow,Section,ShowMore,WatchToggle} from "../components/ui";
import {useAtlas} from "../lib/atlasContext";
import {buildChronology,describeEra} from "../lib/chronology";
import {episodeById,episodeCode} from "../lib/lookup";
import {episodeImage,hasMapCoordinates} from "../lib/atlasHelpers";
import {seriesColor,seriesShort} from "../lib/series";
import type {Location} from "../data";

export function EpisodeCard({episode}:{episode:any}){
 const {openEpisode,watched}=useAtlas();
 return <div className={"episodeCard"+(watched.has(episode.id)?" isWatched":"")} style={{"--c":seriesColor(episode.seriesId)} as CSSProperties}>
  <button className="episodeCardMain" onClick={()=>openEpisode(episode.id)}>
   <span className="episodeCardArt"><Icon name="film"/><AtlasImage src={episodeImage(episode)} width={520} sizes="220px"/></span>
   <span className="episodeCardText"><small><span className="dot"/>{seriesShort(episode.seriesId)} · {episodeCode(episode)}</small><b>{episode.title}</b></span>
  </button>
  <WatchToggle id={episode.id} title={episode.title} compact/>
 </div>;
}

// Map tab, nothing selected: "what is happening in the universe this year".
// The year scrubber sits above this in the sheet header.
export default function MapOverview({year,seriesId,locations,onOpenTimeline}:{year:number;seriesId?:string;locations:Location[];onOpenTimeline:()=>void}){
 const era=useMemo(()=>describeEra(year),[year]);
 const active=useMemo(()=>buildChronology().filter(x=>x.kind==="episode"&&x.start<=year&&x.end>=year&&(!seriesId||x.seriesId===seriesId)).map(x=>episodeById.get(x.id)).filter(Boolean) as any[],[year,seriesId]);
 const mapped=locations.filter(hasMapCoordinates);
 const unplaced=locations.filter(l=>!hasMapCoordinates(l));
 const fresh=mapped.filter(l=>l.year===year);
 const older=mapped.filter(l=>l.year!==year).sort((a,b)=>b.year-a.year||a.name.localeCompare(b.name));
 return <div className="overview">
  <div className="eraCard">
   <small>Story era</small>
   <b>{era.title}</b>
   <span>{active.length} episode{active.length===1?"":"s"} · {mapped.length} places on the map{fresh.length?` · ${fresh.length} new`:""}</span>
  </div>
  <Section title={`Happening in ${year}`} count={active.length} action={active.length>0?<button className="textBtn" onClick={onOpenTimeline}>Timeline<Icon name="chevron"/></button>:undefined}>
   {active.length?<div className="carousel">{active.slice(0,24).map(e=><EpisodeCard key={e.id} episode={e}/>)}</div>:<p className="empty">No episodes are anchored to {year}. Drag the year to explore.</p>}
  </Section>
  {fresh.length>0&&<Section title={`New in ${year}`} count={fresh.length}><ShowMore items={fresh} limit={6} render={l=><PlaceRow key={l.id} location={l} isNew/>}/></Section>}
  {older.length>0&&<Section title="Already on the map" count={older.length}><ShowMore items={older} limit={fresh.length?4:8} render={l=><PlaceRow key={l.id} location={l}/>}/></Section>}
  {unplaced.length>0&&<Section title="Not placed on map" count={unplaced.length} collapsible defaultOpen={false}><div className="stack">{unplaced.map(l=><PlaceRow key={l.id} location={l} note="Coordinates unknown — not guessed"/>)}</div></Section>}
 </div>;
}
