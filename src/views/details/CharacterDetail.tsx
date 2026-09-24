import {Fragment,useEffect,useMemo,useState} from "react";
import type {CSSProperties} from "react";
import Icon from "../../components/Icon";
import MiniTimeline from "../../components/MiniTimeline";
import {ActionBar,Chip,EpisodeRow,Hero,PlaceChips,Section,Stats,certaintyTone} from "../../components/ui";
import {useAtlas} from "../../lib/atlasContext";
import {atlasData} from "../../data";
import {characterById,episodesFor,locationsFor} from "../../lib/lookup";
import {getCharacterEpisodeIds} from "../../lib/entityGraph";
import {getRuntimeEpisodeIds} from "../../lib/runtime";
import {characterImage,hasMapCoordinates} from "../../lib/atlasHelpers";
import {seriesColor,seriesShort} from "../../lib/series";
import {ConnectionList,Gallery,GraphSection,WikiSection,fandomRecord,useEntityPhotos,useLightbox} from "./shared";

export default function CharacterDetail({id}:{id:string}){
 const {showCharacterJourney,watched}=useAtlas();
 const character=characterById.get(id) as any;
 const [runtimeIds,setRuntimeIds]=useState<string[]|null>(null);
 const [showAll,setShowAll]=useState(false);
 useEffect(()=>{let active=true;setRuntimeIds(null);setShowAll(false);void getRuntimeEpisodeIds("character",id).then(ids=>{if(active)setRuntimeIds(ids)});return()=>{active=false}},[id]);
 const eps=useMemo(()=>episodesFor(runtimeIds??getCharacterEpisodeIds(id)),[id,runtimeIds]);
 const places=useMemo(()=>locationsFor(eps.flatMap(e=>e.locationIds??[])),[eps]);
 const spans=useMemo(()=>{
  const out:{seriesId:string;count:number;start:number;end:number}[]=[];
  for(const e of eps){
   const last=out[out.length-1];const s=Number(e.timelineStart??e.timelineEnd??0),en=Number(e.timelineEnd??e.timelineStart??0);
   if(last?.seriesId===e.seriesId){last.count++;last.end=en||last.end;}
   else out.push({seriesId:e.seriesId,count:1,start:s,end:en});
  }
  return out;
 },[eps]);
 const hero=character?characterImage(character):"";
 const page=fandomRecord("characters",id)?.fandom_url;
 const photos=useEntityPhotos("characters",id,hero,[],page);
 const lightbox=useLightbox();
 if(!character)return <p className="empty">Character record not found.</p>;
 const links=(atlasData.connections as any[]).filter(c=>c.fromId===id||c.toId===id).map(c=>c.id);
 const accent=seriesColor(character.seriesIds?.[0]);
 const seen=eps.filter(e=>watched.has(e.id)).length;
 const firstYear=eps.length?Number(eps[0].timelineStart??eps[0].timelineEnd):null;
 const visible=showAll?eps:eps.slice(0,6);
 const mappedPlaces=places.filter(hasMapCoordinates).length;
 return <div className="detail">
  <Hero portrait image={hero} creditPage={page} onImage={()=>lightbox.open(photos.items,0)} accent={accent} icon="person" kicker={<>Character · {(character.seriesIds||[]).map((s:string)=>seriesShort(s)).join(" · ")}</>} title={character.name}>
   <div className="chipRow">{firstYear?<Chip icon="clock">From {firstYear}</Chip>:null}<Chip tone={certaintyTone(character.certainty)}>{character.certainty||"tracked"}</Chip></div>
  </Hero>
  <ActionBar>
   <button className="btn primary" disabled={!mappedPlaces} onClick={()=>showCharacterJourney(id)}><Icon name="route"/>{mappedPlaces?`Trace journey · ${mappedPlaces} places`:"No mapped journey"}</button>
  </ActionBar>
  <Stats items={[{label:"Episodes",value:eps.length},{label:"Places",value:places.length},{label:"Series",value:(character.seriesIds||[]).length},{label:"You've seen",value:eps.length?`${Math.round(seen/eps.length*100)}%`:"—"}]}/>
  {spans.length>0&&<Section title="Journey across the universe">
   <div className="journeyRail">{spans.map((s,i)=><div key={s.seriesId+i} className="journeyStep" style={{"--c":seriesColor(s.seriesId)} as CSSProperties}><b>{seriesShort(s.seriesId)}</b><span>{s.count} ep</span><small>{s.start}{s.end&&s.end!==s.start?"–"+s.end:""}</small></div>)}</div>
   <MiniTimeline items={eps.filter(e=>e.timelineStart!=null||e.timelineEnd!=null).map(e=>({id:e.id,start:Number(e.timelineStart??e.timelineEnd),end:Number(e.timelineEnd??e.timelineStart),title:e.title,color:seriesColor(e.seriesId)}))}/>
  </Section>}
  <Section title="Episodes" count={eps.length}>
   {eps.length?<><div className="stack">{visible.map((e,i)=>{const prev=visible[i-1];return <Fragment key={e.id}>
    {prev&&prev.seriesId!==e.seriesId&&<div className="transition" style={{"--c":seriesColor(e.seriesId)} as CSSProperties}><Icon name="arrow"/>Crosses into {seriesShort(e.seriesId)}</div>}
    <EpisodeRow episode={e}/>
   </Fragment>})}</div>
   {eps.length>6&&<button className="showMore" onClick={()=>setShowAll(v=>!v)}>{showAll?"Show less":`Show all ${eps.length}`}<Icon name="chevronDown" className={showAll?"flip":""}/></button>}</>
   :<p className="empty">No episode-level appearances recorded yet.</p>}
  </Section>
  <Gallery items={photos.items} loading={photos.loading} onOpen={i=>lightbox.open(photos.items,i)}/>
  {places.length>0&&<Section title="Places" count={places.length}><PlaceChips locations={places}/></Section>}
  <ConnectionList ids={links} perspective={id}/>
  <WikiSection entityType="characters" entityId={id}/>
  <GraphSection root={"character:"+id}/>
  {lightbox.view}
 </div>;
}
