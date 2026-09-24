import {Fragment,useEffect,useMemo,useState} from "react";
import type {CSSProperties} from "react";
import Icon from "../../components/Icon";
import MiniTimeline from "../../components/MiniTimeline";
import {ActionBar,Chip,EpisodeRow,Hero,PlaceChips,Section,Stats,certaintyTone} from "../../components/ui";
import {useAtlas} from "../../lib/atlasContext";
import {atlasData} from "../../data";
import {characterById,episodeById,episodesFor,locationsFor} from "../../lib/lookup";
import {getCharacterEpisodeIds} from "../../lib/entityGraph";
import {getRuntimeEpisodeIds} from "../../lib/runtime";
import {characterImage,hasMapCoordinates} from "../../lib/atlasHelpers";
import {seriesColor,seriesShort} from "../../lib/series";
import {ConnectionList,GraphSection,WikiSection,fandomRecord} from "./shared";

// data/characters.json's own status (alive/deceased/unknown, sourced from
// the character's Fandom infobox — see data/README.md) wins when present;
// the Fandom-hints path is free-form ("Deceased", "Missing") and only a
// fallback for the day that enrichment stage actually publishes it.
const STATUS_LABELS:Record<string,string>={alive:"Alive",deceased:"Deceased",unknown:"Unknown fate"};
function statusTone(status:unknown):"good"|"warn"|"muted"{
 const text=(Array.isArray(status)?status.join(" "):String(status)).toLowerCase();
 if(/deceased|dead|killed/.test(text))return "warn";
 if(/missing|unknown|presumed/.test(text))return "muted";
 return "good";
}

export default function CharacterDetail({id}:{id:string}){
 const {showCharacterJourney,watched,followed,toggleFollowed,jumpToTimelineYear,openEpisode}=useAtlas();
 const character=characterById.get(id) as any;
 const wiki=fandomRecord("characters",id);
 const status=character.status??(wiki?.hints?.status??wiki?.fields?.status);
 const statusLabel=STATUS_LABELS[status]??(Array.isArray(status)?status.join(" · "):status);
 const deathEpisode=character.deathEpisodeId?episodeById.get(character.deathEpisodeId) as any:null;
 const aliases=wiki?.hints?.aliases??wiki?.fields?.aliases;
 const isFollowed=followed.has(id);
 const [runtimeIds,setRuntimeIds]=useState<string[]|null>(null);
 const [showAll,setShowAll]=useState(false);
 useEffect(()=>{let active=true;setRuntimeIds(null);setShowAll(false);void getRuntimeEpisodeIds("character",id).then(ids=>{if(active)setRuntimeIds(ids)});return()=>{active=false}},[id]);
 const eps=useMemo(()=>episodesFor(runtimeIds??getCharacterEpisodeIds(id)),[id,runtimeIds]);
 const places=useMemo(()=>locationsFor(eps.flatMap(e=>e.locationIds??[])),[eps]);
 const universeEvents=useMemo(()=>((atlasData as any).universeEvents as any[]).filter(ev=>(ev.characterIds??[]).includes(id)),[id]);
 const spans=useMemo(()=>{
  const out:{seriesId:string;count:number;start:number;end:number}[]=[];
  for(const e of eps){
   const last=out[out.length-1];const s=Number(e.timelineStart??e.timelineEnd??0),en=Number(e.timelineEnd??e.timelineStart??0);
   if(last?.seriesId===e.seriesId){last.count++;last.end=en||last.end;}
   else out.push({seriesId:e.seriesId,count:1,start:s,end:en});
  }
  return out;
 },[eps]);
 if(!character)return <p className="empty">Character record not found.</p>;
 const links=(atlasData.connections as any[]).filter(c=>c.fromId===id||c.toId===id).map(c=>c.id);
 const accent=seriesColor(character.seriesIds?.[0]);
 const seen=eps.filter(e=>watched.has(e.id)).length;
 const firstYear=eps.length?Number(eps[0].timelineStart??eps[0].timelineEnd):null;
 const visible=showAll?eps:eps.slice(0,6);
 const mappedPlaces=places.filter(hasMapCoordinates).length;
 return <div className="detail">
  <Hero portrait image={characterImage(character)} accent={accent} icon="person" kicker={<>Character · {(character.seriesIds||[]).map((s:string)=>seriesShort(s)).join(" · ")}</>} title={character.name}>
   {aliases&&<p className="aliasLine">Also known as {Array.isArray(aliases)?aliases.join(" · "):aliases}</p>}
   <div className="chipRow">{firstYear?<Chip icon="clock">From {firstYear}</Chip>:null}<Chip tone={certaintyTone(character.certainty)}>{character.certainty||"tracked"}</Chip>{status&&<Chip tone={statusTone(status)}>{statusLabel}</Chip>}</div>
   {deathEpisode&&<button className="deathLine" onClick={()=>openEpisode(deathEpisode.id)}><Icon name="skull"/>Died in "{deathEpisode.title}"<Icon name="chevron" className="rowChevron"/></button>}
  </Hero>
  <ActionBar>
   <button className="btn primary" disabled={!mappedPlaces} onClick={()=>showCharacterJourney(id)}><Icon name="route"/>{mappedPlaces?`Trace journey · ${mappedPlaces} places`:"No mapped journey"}</button>
   <button className={"followToggle"+(isFollowed?" on":"")} aria-pressed={isFollowed} aria-label={isFollowed?`Unfollow ${character.name}`:`Follow ${character.name}`} onClick={()=>toggleFollowed(id)}><Icon name="star"/></button>
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
  {places.length>0&&<Section title="Places" count={places.length}><PlaceChips locations={places}/></Section>}
  {universeEvents.length>0&&<Section title="Universe events" count={universeEvents.length}>
   <div className="stack">{universeEvents.map(ev=><button key={ev.id} className="row eventRow" style={{"--c":seriesColor(ev.seriesId)} as CSSProperties} onClick={()=>jumpToTimelineYear(ev.year)}>
    <span className="eventGlyph"><Icon name="spark"/></span>
    <span className="rowText">
     <small>{seriesShort(ev.seriesId)} · {ev.year}{ev.date?" · "+ev.date:""}{ev.locationIds?.length?" · "+locationsFor(ev.locationIds).map((l:any)=>l.name).join(", "):""}</small>
     <b>{ev.title}</b>
     {ev.description&&<em>{ev.description}</em>}
    </span>
    <Icon name="chevron" className="rowChevron"/>
   </button>)}</div>
  </Section>}
  <ConnectionList ids={links} perspective={id}/>
  <WikiSection entityType="characters" entityId={id}/>
  <GraphSection root={"character:"+id}/>
 </div>;
}
