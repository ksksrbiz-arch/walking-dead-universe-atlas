import {useEffect,useMemo,useState} from "react";
import Icon from "../../components/Icon";
import MiniTimeline from "../../components/MiniTimeline";
import {ActionBar,Chip,EpisodeRow,Hero,Note,Section,ShowMore,Stats,certaintyTone} from "../../components/ui";
import {useAtlas} from "../../lib/atlasContext";
import {atlasData} from "../../data";
import {characterById,episodesFor,locationById} from "../../lib/lookup";
import {getLocationEpisodeIds} from "../../lib/entityGraph";
import {getRuntimeEpisodeIds} from "../../lib/runtime";
import {hasMapCoordinates,locationImage,prettyType} from "../../lib/atlasHelpers";
import {SERIES_BY_ID,seriesColor} from "../../lib/series";
import {ConnectionList,Gallery,GraphSection,PortraitStrip,WikiSection,fandomRecord,useEntityPhotos,useLightbox} from "./shared";

export default function LocationDetail({id}:{id:string}){
 const {showLocationOnMap,watched}=useAtlas();
 const location=locationById.get(id);
 const [runtimeIds,setRuntimeIds]=useState<string[]|null>(null);
 useEffect(()=>{let active=true;setRuntimeIds(null);void getRuntimeEpisodeIds("location",id).then(ids=>{if(active)setRuntimeIds(ids)});return()=>{active=false}},[id]);
 const direct=useMemo(()=>episodesFor((atlasData.episodes as any[]).filter(e=>(e.locationIds??[]).includes(id)).map(e=>e.id)),[id]);
 const historical=useMemo(()=>{const strict=new Set(direct.map(e=>e.id));return episodesFor((runtimeIds??getLocationEpisodeIds(id)).filter(x=>!strict.has(x)))},[id,direct,runtimeIds]);
 const characters=useMemo(()=>{
  const counts=new Map<string,number>();
  for(const e of direct)for(const c of e.characterIds??[])counts.set(c,(counts.get(c)??0)+1);
  return [...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,16).map(([cid,count])=>({...(characterById.get(cid) as any),count})).filter(c=>c.id);
 },[direct]);
 const hero=location?locationImage(location):"";
 const page=fandomRecord("locations",id)?.fandom_url;
 const photos=useEntityPhotos("locations",id,hero,[],page);
 const lightbox=useLightbox();
 if(!location)return <p className="empty">Location record not found.</p>;
 const meta=SERIES_BY_ID[location.seriesId];
 const events=(atlasData.events as any[]).filter(e=>e.locationIds?.includes(id));
 const links=(atlasData.connections as any[]).filter(c=>c.fromId===id||c.toId===id).map(c=>c.id);
 const years=direct.map(e=>Number(e.timelineStart??e.timelineEnd)).filter(n=>Number.isFinite(n)&&n>0);
 const span=years.length?(Math.min(...years)===Math.max(...years)?String(years[0]):`${Math.min(...years)}–${Math.max(...years)}`):`${location.year}+`;
 const seen=direct.filter(e=>watched.has(e.id)).length;
 const mapped=hasMapCoordinates(location);
 return <div className="detail">
  <Hero image={hero||photos.items[0]?.src} creditPage={page} onImage={()=>lightbox.open(photos.items,0)} accent={meta?.color} icon="pin" kicker={<><span className="dot" style={{background:seriesColor(location.seriesId)}}/>{meta?.name} · {prettyType(location.type)}</>} title={location.name}>
   <div className="chipRow"><Chip icon="clock">First seen {location.year}</Chip><Chip tone={certaintyTone(location.certainty)}>{location.certainty}</Chip></div>
  </Hero>
  <ActionBar>
   <button className="btn primary" disabled={!mapped} onClick={()=>showLocationOnMap(id)}><Icon name="locate"/>{mapped?"Center on map":"Not placed on map"}</button>
  </ActionBar>
  <Stats items={[{label:"Episodes here",value:direct.length},{label:"Story span",value:span},{label:"You've seen",value:direct.length?`${seen}/${direct.length}`:"—"},{label:"Also referenced",value:historical.length}]}/>
  {direct.length>0&&<Section title="On the timeline"><MiniTimeline items={direct.map(e=>({id:e.id,start:Number(e.timelineStart??e.timelineEnd??location.year),end:Number(e.timelineEnd??e.timelineStart??location.year),title:e.title,color:seriesColor(e.seriesId)}))} markYear={location.year}/></Section>}
  <Section title="Episodes set here" count={direct.length}>
   {direct.length?<ShowMore items={direct} limit={5} render={e=><EpisodeRow key={e.id} episode={e}/>}/>:<p className="empty">No episode is directly tied to this place yet.</p>}
  </Section>
  <Gallery items={photos.items} loading={photos.loading} onOpen={i=>lightbox.open(photos.items,i)}/>
  {characters.length>0&&<Section title="Seen here" count={characters.length}><PortraitStrip characters={characters}/></Section>}
  {historical.length>0&&<Section title="Also referenced in" count={historical.length} collapsible defaultOpen={false}><ShowMore items={historical} limit={5} render={e=><EpisodeRow key={e.id} episode={e} thumb={false} note="Broader location association"/>}/></Section>}
  {events.length>0&&<Section title="Story eras here" count={events.length}><div className="stack">{events.map(e=><div className="row staticRow" key={e.id}><span className="yearBadge">{e.year}</span><span className="rowText"><b>{e.title}</b><small>{e.certainty}</small></span></div>)}</div></Section>}
  <ConnectionList ids={links}/>
  <WikiSection entityType="locations" entityId={id}/>
  <GraphSection root={"location:"+id}/>
  {lightbox.view}
  <Note icon="pin">Direct episode geography is kept separate from broader references. Approximate placements stay labeled.</Note>
 </div>;
}
