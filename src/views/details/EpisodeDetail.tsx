import {useMemo} from "react";
import type {CSSProperties} from "react";
import Icon from "../../components/Icon";
import {ActionBar,Chip,Hero,Note,PlaceChips,Section,WatchToggle,certaintyTone} from "../../components/ui";
import {useAtlas} from "../../lib/atlasContext";
import {buildEpisodeWatchOrder} from "../../lib/chronology";
import {characterById,episodeById,episodeCode,locationsFor,sourceById,storyRange} from "../../lib/lookup";
import {getEpisodeConnectionIds} from "../../lib/entityGraph";
import {episodeImage,episodeMediaRecord,hasMapCoordinates,seriesKeyArt} from "../../lib/atlasHelpers";
import {SERIES_BY_ID,seriesColor,seriesShort} from "../../lib/series";
import {ConnectionList,Gallery,GraphSection,PortraitStrip,WikiSection} from "./shared";
import {atlasData} from "../../data";

export default function EpisodeDetail({id}:{id:string}){
 const {openEpisode,showEpisodeOnMap,watched}=useAtlas();
 const episode=episodeById.get(id) as any;
 const order=useMemo(()=>buildEpisodeWatchOrder(),[]);
 if(!episode)return <p className="empty">Episode record not found.</p>;
 const meta=SERIES_BY_ID[episode.seriesId];
 const index=order.findIndex(x=>x.id===id);
 const prev=order[index-1],next=order[index+1];
 const locations=locationsFor(episode.locationIds??[]);
 const mapped=locations.filter(hasMapCoordinates);
 const characters=(episode.characterIds??[]).map((cid:string)=>characterById.get(cid)).filter(Boolean) as any[];
 const connectionIds=getEpisodeConnectionIds(id);
 const media=(atlasData as any).media?.episodes?.[id]??episodeMediaRecord(id);
 const image=episodeImage(episode)||seriesKeyArt(episode.seriesId);
 const gallery=[...new Set([...(Array.isArray(media?.gallery)?media.gallery:[]),...(media?.image?[media.image]:[])].filter(Boolean))].slice(0,18) as string[];
 const sources=(episode.sources??[]).map((sid:string)=>sourceById.get(sid)).filter(Boolean) as any[];
 const airDate=episode.airDate?new Date(episode.airDate+"T00:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):null;
 return <div className="detail">
  <Hero image={image} accent={meta?.color} icon="film" kicker={<><span className="dot" style={{background:seriesColor(episode.seriesId)} as CSSProperties}/>{meta?.name} · {episodeCode(episode)}</>} title={episode.title}>
   <div className="chipRow">
    <Chip icon="clock">Story year {storyRange(episode)}</Chip>
    {airDate&&<Chip>Aired {airDate}</Chip>}
    <Chip tone={certaintyTone(episode.certainty)}>{episode.certainty}</Chip>
   </div>
  </Hero>
  <ActionBar>
   <WatchToggle id={id} title={episode.title}/>
   <button className="btn" disabled={!mapped.length} onClick={()=>showEpisodeOnMap(id)}><Icon name="map"/>{mapped.length?`Show ${mapped.length} on map`:"No mapped places"}</button>
  </ActionBar>

  <nav className="storyNav" aria-label="Story order">
   {prev?<button onClick={()=>openEpisode(prev.id)}><Icon name="back"/><span><small>Before · {seriesShort(prev.seriesId)} {episodeCode(prev)}{watched.has(prev.id)?" ✓":""}</small><b>{prev.title}</b></span></button>:<span/>}
   <div className="storyPos"><b>#{index+1}</b><small>of {order.length}</small></div>
   {next?<button className="next" onClick={()=>openEpisode(next.id)}><span><small>After · {seriesShort(next.seriesId)} {episodeCode(next)}{watched.has(next.id)?" ✓":""}</small><b>{next.title}</b></span><Icon name="chevron"/></button>:<span/>}
  </nav>

  {locations.length>0&&<Section title="Where it happens" count={locations.length}><PlaceChips locations={locations}/></Section>}
  {characters.length>0&&<Section title="Who's in it" count={characters.length}><PortraitStrip characters={characters}/></Section>}
  <ConnectionList ids={connectionIds}/>
  <Gallery title="Frames" items={gallery.map((src,i)=>({src,title:i===0?"Primary frame":`Frame ${i+1}`}))}/>
  <WikiSection entityType="episodes" entityId={id}/>
  {sources.length>0&&<Section title="Sources" count={sources.length} collapsible defaultOpen={false}>
   <div className="stack">{sources.map(s=><a key={s.id} className="row sourceRow" href={s.url} target="_blank" rel="noreferrer"><span className="rowText"><small>{String(s.type||"source").replaceAll("-"," ")}</small><b>{s.title}</b>{s.note&&<em>{s.note}</em>}</span><Icon name="external" className="rowChevron"/></a>)}</div>
  </Section>}
  <GraphSection root={"episode:"+id}/>
  <Note>Air date and in-universe chronology are tracked separately. Uncertain placements stay labeled ({episode.timelinePrecision||"unknown"} precision).</Note>
 </div>;
}
