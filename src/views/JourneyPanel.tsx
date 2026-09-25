import {useMemo,useRef,useState} from "react";
import type {CSSProperties,KeyboardEvent as ReactKeyboardEvent,PointerEvent as ReactPointerEvent} from "react";
import Icon from "../components/Icon";
import {AtlasImage,EpisodeRow,Note,Section,ShowMore,SeriesTag,Stats} from "../components/ui";
import {useAtlas} from "../lib/atlasContext";
import {JOURNEY_COLORS,MAX_COMPARE,findCrossings,journeyCandidates} from "../lib/journeys";
import type {Journey,JourneyBeat,JourneyStop} from "../lib/journeys";
import {episodeById,episodeCode} from "../lib/lookup";
import {clamp,locationImage,prettyType} from "../lib/atlasHelpers";
import {seriesShort} from "../lib/series";
import {PortraitImage} from "./details/shared";

export type JourneyControls={
 journeys:Journey[];
 beats:JourneyBeat[];
 cursor:number;
 positions:number[];
 playing:boolean;
 onTogglePlay:()=>void;
 onStep:(beat:number)=>void;
 onStop:(journey:number,stop:number)=>void;
 onAdd:(id:string)=>void;
 onRemove:(id:string)=>void;
 spoilerSafe:boolean;
 onSpoilerSafe:(on:boolean)=>void;
 onShare:()=>void;
 onExit:()=>void;
};

const km=(n:number)=>n>=1000?(n/1000).toFixed(n>=10000?0:1)+"k":String(n);
const years=(s:JourneyStop)=>s.startYear==null?"year unknown":s.endYear&&s.endYear!==s.startYear?`${s.startYear}–${s.endYear}`:String(s.startYear);
const epLabel=(id:string)=>{const e=episodeById.get(id) as any;return e?`${seriesShort(e.seriesId)} ${episodeCode(e)} “${e.title}”`:id};

/** Which journey/stop a beat is "about" — the first character who moves at it. */
function beatStop(c:JourneyControls,beat=c.cursor){
 const m=c.beats[beat]?.moves[0];
 return m?{journey:m.journey,stop:c.journeys[m.journey]?.stops[m.stop]}:null;
}

// Story-order transport: step, play, and a drag track across every beat.
// The whole track is the drag surface (same pattern as TimeScrubber).
export function JourneyPlayer({c}:{c:JourneyControls}){
 const track=useRef<HTMLDivElement|null>(null);
 const dragging=useRef(false);
 const n=c.beats.length;
 if(!n)return null;
 const now=beatStop(c);
 const at=(x:number)=>{const r=track.current!.getBoundingClientRect();return clamp(Math.round((x-r.left)/r.width*(n-1)),0,n-1)};
 const down=(e:ReactPointerEvent<HTMLDivElement>)=>{e.stopPropagation();dragging.current=true;e.currentTarget.setPointerCapture?.(e.pointerId);c.onStep(at(e.clientX))};
 const move=(e:ReactPointerEvent<HTMLDivElement>)=>{if(!dragging.current)return;e.stopPropagation();const i=at(e.clientX);if(i!==c.cursor)c.onStep(i)};
 const key=(e:ReactKeyboardEvent)=>{
  const step={ArrowRight:1,ArrowUp:1,ArrowLeft:-1,ArrowDown:-1,PageUp:10,PageDown:-10}[e.key];
  if(step){e.preventDefault();c.onStep(clamp(c.cursor+step,0,n-1))}
  else if(e.key==="Home"){e.preventDefault();c.onStep(0)}else if(e.key==="End"){e.preventDefault();c.onStep(n-1)}
 };
 const single=c.journeys.length===1;
 const label=single?`Stop ${c.cursor+1} of ${n}`:`Step ${c.cursor+1} of ${n}`;
 return <div className="journeyPlayer">
  <div className="journeyPlayerTop">
   <button className="iconBtn ghost" onClick={()=>c.onStep(Math.max(0,c.cursor-1))} disabled={c.cursor<=0} aria-label="Previous stop"><Icon name="prev"/></button>
   <button className="playBtn" onClick={c.onTogglePlay} aria-label={c.playing?"Pause journey":"Play journey"}><Icon name={c.playing?"pause":"play"}/></button>
   <button className="iconBtn ghost" onClick={()=>c.onStep(Math.min(n-1,c.cursor+1))} disabled={c.cursor>=n-1} aria-label="Next stop"><Icon name="next"/></button>
   <div className="journeyNow" aria-live="polite">
    <small>{label}{now?.stop?.startYear?` · ${now.stop.startYear}`:""}</small>
    <b style={{"--jc":JOURNEY_COLORS[now?.journey??0]} as CSSProperties}>{!single&&now&&<i className="jdot"/>}{now?.stop?.location.name??"—"}</b>
   </div>
  </div>
  <div ref={track} className="journeyTrack" role="slider" tabIndex={0} aria-label="Journey position" aria-valuemin={1} aria-valuemax={n} aria-valuenow={c.cursor+1} aria-valuetext={`${label}: ${now?.stop?.location.name??""}`} onKeyDown={key} onPointerDown={down} onPointerMove={move} onPointerUp={()=>{dragging.current=false}} onPointerCancel={()=>{dragging.current=false}}>
   <span className="journeyTrackFill" style={{width:(n>1?c.cursor/(n-1)*100:100)+"%"}}/>
   {c.beats.map((b,i)=>{const s=c.journeys[b.moves[0].journey]?.stops[b.moves[0].stop];const chapterStart=s&&(i===0||s.from==null||s.chapter!==c.journeys[b.moves[0].journey].stops[s.from]?.chapter);return <i key={i} className={"journeyTick"+(i<=c.cursor?" past":"")+(chapterStart?" chapter":"")} style={{left:(n>1?i/(n-1)*100:0)+"%","--jc":JOURNEY_COLORS[b.moves[0].journey]} as CSSProperties}/>})}
   <span className="journeyThumb" style={{left:(n>1?c.cursor/(n-1)*100:100)+"%"}}/>
  </div>
 </div>;
}

function StopCard({j,ji,stop,c}:{j:Journey;ji:number;stop:JourneyStop;c:JourneyControls}){
 const {openLocation,openEpisode}=useAtlas();
 const leg=j.legs.find(l=>l.to===stop.index);
 const from=leg?j.stops[leg.from]:null;
 const image=locationImage(stop.location);
 const episodes=stop.episodeIds.map(id=>episodeById.get(id)).filter(Boolean) as any[];
 return <article className="stopCard" style={{"--jc":JOURNEY_COLORS[ji]} as CSSProperties}>
  <button className="stopCardMedia" onClick={()=>openLocation(stop.location.id)} aria-label={`Open ${stop.location.name}`}>
   <AtlasImage src={image} width={640} sizes="(max-width: 899px) 100vw, 440px"/>
   <span className="stopCardBadge">{stop.place}</span>
  </button>
  <div className="stopCardBody">
   <small>{c.journeys.length>1&&<><i className="jdot"/>{j.name} · </>}{stop.visit>1?`Back again (visit ${stop.visit})`:`Place ${stop.place} of ${j.stats.places}`} · {years(stop)}</small>
   <h3><button className="linkish" onClick={()=>openLocation(stop.location.id)}>{stop.location.name}</button></h3>
   <div className="chipRow"><SeriesTag seriesId={stop.seriesId}/><span className="chip">{prettyType(stop.location.type)}</span><span className="chip">{stop.episodeIds.length} episode{stop.episodeIds.length===1?"":"s"}</span></div>
   {leg&&from&&<div className="legEvidence">
    <p><Icon name="route"/><span>From <button className="linkish" onClick={()=>openLocation(from.location.id)}>{from.location.name}</button> · {km(leg.km)} km straight-line{leg.crossesSeries?" · crosses series":""}</span></p>
    {leg.leaveEpisodeId===leg.arriveEpisodeId
     ?<p className="evidence"><small>Both places in</small><button className="linkish" onClick={()=>openEpisode(leg.arriveEpisodeId)}>{epLabel(leg.arriveEpisodeId)}</button></p>
     :<>
      <p className="evidence"><small>Last there</small><button className="linkish" onClick={()=>openEpisode(leg.leaveEpisodeId)}>{epLabel(leg.leaveEpisodeId)}</button></p>
      <p className="evidence"><small>First here</small><button className="linkish" onClick={()=>openEpisode(leg.arriveEpisodeId)}>{epLabel(leg.arriveEpisodeId)}</button></p>
     </>}
   </div>}
   {!leg&&<p className="legEvidence"><Icon name="flag"/><span>Where the journey starts.</span></p>}
  </div>
  <ShowMore items={episodes} limit={3} label="All episodes here" render={e=><EpisodeRow key={e.id} episode={e}/>}/>
 </article>;
}

function ComparePicker({c}:{c:JourneyControls}){
 const [open,setOpen]=useState(false);
 const [q,setQ]=useState("");
 const full=c.journeys.length>=MAX_COMPARE;
 const list=useMemo(()=>journeyCandidates().filter(x=>!c.journeys.some(j=>j.characterId===x.id)&&(!q||x.name.toLowerCase().includes(q.trim().toLowerCase()))),[c.journeys,q]);
 return <div className="comparePicker">
  <div className="compareChips">
   {c.journeys.map((j,ji)=><span key={j.characterId} className="compareChip" style={{"--jc":JOURNEY_COLORS[ji]} as CSSProperties}>
    <i className="jdot"/>{j.name}
    {c.journeys.length>1&&<button onClick={()=>c.onRemove(j.characterId)} aria-label={`Remove ${j.name} from comparison`}><Icon name="close"/></button>}
   </span>)}
   {!full&&<button className="compareAdd" onClick={()=>setOpen(v=>!v)} aria-expanded={open}><Icon name={open?"close":"plus"}/>{open?"Done":"Compare"}</button>}
  </div>
  {open&&!full&&<div className="comparePanel">
   <label className="field"><Icon name="search"/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Add a character" aria-label="Find a character to compare" autoFocus/></label>
   <div className="stack compareList">{list.slice(0,40).map(x=><button key={x.id} className="row" onClick={()=>{c.onAdd(x.id);setQ("");setOpen(false)}}>
    <PortraitImage id={x.id} name={x.name} size="sm"/>
    <span className="rowText"><b>{x.name}</b><small>{x.places} places</small></span>
    <Icon name="plus" className="rowChevron"/>
   </button>)}{!list.length&&<p className="empty">No match.</p>}</div>
  </div>}
 </div>;
}

function Crossings({c}:{c:JourneyControls}){
 const {openLocation}=useAtlas();
 const crossings=useMemo(()=>findCrossings(c.journeys),[c.journeys]);
 if(c.journeys.length<2)return null;
 const together=crossings.filter(x=>x.together),apart=crossings.filter(x=>!x.together);
 const pair=(x:{a:number;b:number})=><span className="pairDots"><i className="jdot" style={{"--jc":JOURNEY_COLORS[x.a]} as CSSProperties}/><i className="jdot" style={{"--jc":JOURNEY_COLORS[x.b]} as CSSProperties}/></span>;
 return <>
  <Section level={2} title="Crossed paths" count={together.length}>
   {together.length?<ShowMore items={together} limit={5} render={x=><button key={x.a+"-"+x.b+x.location.id} className="row crossingRow" onClick={()=>openLocation(x.location.id)}>
    {pair(x)}
    <span className="rowText"><small>{c.journeys[x.a].name.split(" ")[0]} & {c.journeys[x.b].name.split(" ")[0]} · together</small><b>{x.location.name}</b><em>{x.episodeIds.length} shared episode{x.episodeIds.length===1?"":"s"} · first {epLabel(x.episodeIds[0])}</em></span>
    <Icon name="chevron" className="rowChevron"/>
   </button>}/>:<p className="empty">No shared episodes at a mapped place{c.spoilerSafe?" in what you've watched":""}.</p>}
  </Section>
  {apart.length>0&&<Section level={2} title="Same ground, different times" count={apart.length} collapsible defaultOpen={false}>
   <ShowMore items={apart} limit={6} render={x=><button key={x.a+"-"+x.b+x.location.id} className="row crossingRow" onClick={()=>openLocation(x.location.id)}>
    {pair(x)}<span className="rowText"><small>{c.journeys[x.a].name.split(" ")[0]} & {c.journeys[x.b].name.split(" ")[0]} · never in the same episode</small><b>{x.location.name}</b></span><Icon name="chevron" className="rowChevron"/>
   </button>}/>
  </Section>}
 </>;
}

export default function JourneyPanel({c,showPlayer}:{c:JourneyControls;showPlayer:boolean}){
 const [listFor,setListFor]=useState(0);
 const {journeys}=c;
 const single=journeys.length===1;
 const hidden=journeys.reduce((s,j)=>s+j.hiddenEpisodeCount,0);
 const empty=journeys.every(j=>!j.stops.length);
 // Characters who reach a new stop at this beat get the full card; the rest show where they are.
 const beat=c.beats[c.cursor];
 const movers=new Set(beat?.moves.map(m=>m.journey)??[]);
 const listJourney=journeys[Math.min(listFor,journeys.length-1)];
 return <div className="page journeyPage">
  <header className="journeyHead">
   <div className="journeyFaces">{journeys.map((j,ji)=><span key={j.characterId} style={{"--jc":JOURNEY_COLORS[ji]} as CSSProperties}><PortraitImage id={j.characterId} name={j.name} size="md"/></span>)}</div>
   <div className="journeyTitle"><small>{single?"Journey":"Compare journeys"}</small><h1>{journeys.map(j=>j.name).join(" · ")}</h1></div>
   <div className="journeyHeadActions">
    <button className="iconBtn ghost" onClick={c.onShare} aria-label="Share this journey"><Icon name="share"/></button>
    <button className="iconBtn ghost" onClick={c.onExit} aria-label="Exit journey"><Icon name="close"/></button>
   </div>
  </header>

  {showPlayer&&<JourneyPlayer c={c}/>}

  {single?<Stats items={[
   {label:"Places",value:journeys[0].stats.places},
   {label:"Straight-line km",value:km(journeys[0].stats.km)},
   {label:"Series",value:journeys[0].stats.series.length},
   {label:"Returns",value:journeys[0].stats.revisits}
  ]}/>:<div className="compareStats">{journeys.map((j,ji)=><div key={j.characterId} style={{"--jc":JOURNEY_COLORS[ji]} as CSSProperties}><i className="jdot"/><b>{j.name}</b><span>{j.stats.places} places · {km(j.stats.km)} km · {j.stats.firstYear??"?"}–{j.stats.lastYear??"?"}</span></div>)}</div>}

  <ComparePicker c={c}/>

  <label className="switchRow">
   <span><b>Spoiler-safe</b><small>{c.spoilerSafe?(hidden?`${hidden} unwatched episode${hidden===1?"":"s"} hidden`:"Everything here is watched"):"Only show what you've watched"}</small></span>
   <input type="checkbox" role="switch" checked={c.spoilerSafe} onChange={e=>c.onSpoilerSafe(e.target.checked)}/>
  </label>

  {empty?<Note icon="eyeOff">{c.spoilerSafe?"Nothing on this journey is marked watched yet. Mark episodes as watched (or turn off spoiler-safe) to reveal it.":"No mapped places recorded for this journey yet."}</Note>:<>
   <Section level={2} title={single?"Now":"At this step"}>
    <div className="stack">
     {journeys.map((j,ji)=>{
      const at=c.positions[ji],stop=j.stops[at];
      if(!stop)return <p key={j.characterId} className="waitingRow" style={{"--jc":JOURNEY_COLORS[ji]} as CSSProperties}><i className="jdot"/>{j.name} hasn't set out yet.</p>;
      if(movers.has(ji)||single)return <StopCard key={j.characterId} j={j} ji={ji} stop={stop} c={c}/>;
      return <button key={j.characterId} className="waitingRow" style={{"--jc":JOURNEY_COLORS[ji]} as CSSProperties} onClick={()=>c.onStop(ji,at)}><i className="jdot"/>{j.name} is around <b>{stop.location.name}</b> · {years(stop)}</button>;
     })}
    </div>
   </Section>

   <Crossings c={c}/>

   <Section level={2} title="Every stop" count={listJourney?.stops.length}>
    {journeys.length>1&&<div className="segmented" role="tablist">{journeys.map((j,ji)=><button key={j.characterId} role="tab" aria-selected={listFor===ji} className={listFor===ji?"active":""} onClick={()=>setListFor(ji)}>{j.name.split(" ")[0]}</button>)}</div>}
    {listJourney&&<ShowMore items={listJourney.stops} limit={8} label="Show all stops" render={s=>{const ji=journeys.indexOf(listJourney);const current=c.positions[ji]===s.index;const chapterStart=s.from==null||listJourney.stops[s.from]?.chapter!==s.chapter;return <button key={s.index} className={"row stopRow"+(current?" isCurrent":"")+(s.index>c.positions[ji]?" isAhead":"")+(chapterStart&&s.index>0?" newChapter":"")} style={{"--jc":JOURNEY_COLORS[ji]} as CSSProperties} onClick={()=>c.onStop(ji,s.index)} aria-current={current?"step":undefined}>
     <span className="stopNum">{s.place}</span>
     <span className="rowText"><small>{years(s)} · {seriesShort(s.seriesId)} · {s.episodeIds.length} ep{s.visit>1?" · return":""}</small><b>{s.location.name}</b></span>
     {current&&<Icon name="navigate" className="rowChevron"/>}
    </button>}}/>}
   </Section>
  </>}

  <Note>Journeys come from the episodes each character appears in and those episodes' recorded places, in story order. Lines connect each newly reached place to the nearest place the character was just recorded at — they are not travelled routes, and an episode's places may not all involve this character.{journeys.some(j=>j.unplacedEpisodeCount)?` ${journeys.reduce((s,j)=>s+j.unplacedEpisodeCount,0)} episode(s) have no mapped place.`:""}</Note>
 </div>;
}
