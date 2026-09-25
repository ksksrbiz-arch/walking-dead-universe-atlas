import {useMemo,useRef,useState} from "react";
import type {CSSProperties,PointerEvent as ReactPointerEvent} from "react";
import Icon from "../components/Icon";
import {EpisodeRow,Section} from "../components/ui";
import {useAtlas} from "../lib/atlasContext";
import {atlasData} from "../data";
import {buildChronology,buildEpisodeWatchOrder,describeEra,UNIVERSE_MIN_YEAR,UNIVERSE_MAX_YEAR} from "../lib/chronology";
import {episodeById,characterById} from "../lib/lookup";
import {META,SERIES_KEYS,SERIES_BY_ID,seriesColor,seriesShort} from "../lib/series";
import {clamp} from "../lib/atlasHelpers";

const YEARS=Array.from({length:UNIVERSE_MAX_YEAR-UNIVERSE_MIN_YEAR+1},(_,i)=>UNIVERSE_MIN_YEAR+i);

// Series × year activity grid. Drag across it to scrub the universe year —
// the whole grid is one scrub surface rather than 150 tiny buttons.
export function ActivityHeatmap({year,onYear,seriesId}:{year:number;onYear:(y:number)=>void;seriesId?:string}){
 const all=buildChronology();
 const lanes=useMemo(()=>SERIES_KEYS.filter(k=>all.some(x=>x.seriesId===META[k].id)&&(!seriesId||META[k].id===seriesId)),[all,seriesId]);
 const grid=useMemo(()=>{
  const map=new Map<string,number>();let max=1;
  for(const item of all){
   if(item.kind!=="episode")continue;
   for(let y=Math.max(UNIVERSE_MIN_YEAR,Math.round(item.start));y<=Math.min(UNIVERSE_MAX_YEAR,Math.round(item.end));y++){
    const k=item.seriesId+"|"+y;const n=(map.get(k)??0)+1;map.set(k,n);max=Math.max(max,n);
   }
  }
  return {map,max};
 },[all]);
 const track=useRef<HTMLDivElement|null>(null);
 const dragging=useRef(false);
 const yearAt=(clientX:number)=>{const r=track.current!.getBoundingClientRect();return clamp(UNIVERSE_MIN_YEAR+Math.floor((clientX-r.left)/r.width*YEARS.length),UNIVERSE_MIN_YEAR,UNIVERSE_MAX_YEAR)};
 const down=(e:ReactPointerEvent<HTMLDivElement>)=>{dragging.current=true;e.currentTarget.setPointerCapture?.(e.pointerId);onYear(yearAt(e.clientX))};
 const move=(e:ReactPointerEvent<HTMLDivElement>)=>{if(dragging.current){const y=yearAt(e.clientX);if(y!==year)onYear(y)}};
 const up=()=>{dragging.current=false};
 const col=(year-UNIVERSE_MIN_YEAR)/YEARS.length*100;
 return <div className="heatmap" aria-label="Story activity by series and year">
  <div className="heatLabels">{lanes.map(k=><span key={k} style={{"--c":META[k].color} as CSSProperties}><i/>{META[k].short}</span>)}</div>
  <div className="heatScroll">
   <div className="heatTrack" ref={track} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} role="slider" tabIndex={0} aria-valuemin={UNIVERSE_MIN_YEAR} aria-valuemax={UNIVERSE_MAX_YEAR} aria-valuenow={year} aria-label="Universe year" onKeyDown={e=>{if(e.key==="ArrowLeft"){e.preventDefault();onYear(Math.max(UNIVERSE_MIN_YEAR,year-1))}if(e.key==="ArrowRight"){e.preventDefault();onYear(Math.min(UNIVERSE_MAX_YEAR,year+1))}}}>
    <span className="heatCursor" style={{left:col+"%",width:100/YEARS.length+"%"}}/>
    {lanes.map(k=><div className="heatLane" key={k}>{YEARS.map(y=>{const n=grid.map.get(META[k].id+"|"+y)??0;return <span key={y} className={n?"on":""} style={{"--c":META[k].color,"--a":n?String(.28+.72*Math.sqrt(n/grid.max)):"0"} as CSSProperties} title={`${META[k].name} · ${y} · ${n} episode${n===1?"":"s"}`}/>})}</div>)}
    <div className="heatAxis">{YEARS.map(y=><span key={y} className={y===year?"cur":""}>{y%2===0||y===year?String(y).slice(2):""}</span>)}</div>
   </div>
  </div>
 </div>;
}

export default function TimelineView(){
 const {year,setYear,openCharacter}=useAtlas();
 const [filter,setFilter]=useState<string|null>(null);
 const listRef=useRef<HTMLDivElement|null>(null);
 const order=useMemo(()=>buildEpisodeWatchOrder(),[]);
 const counts=useMemo(()=>{const m=new Map<string,number>();for(const e of order)m.set(e.seriesId,(m.get(e.seriesId)??0)+1);return m},[order]);
 const groups=useMemo(()=>{
  const byYear=new Map<number,{episodes:any[];events:any[]}>();
  const bucket=(y:number)=>{if(!byYear.has(y))byYear.set(y,{episodes:[],events:[]});return byYear.get(y)!};
  for(const e of order){if(filter&&e.seriesId!==filter)continue;const y=Number.isFinite(e.start)&&e.start>0?Math.floor(e.start):0;bucket(y).episodes.push(episodeById.get(e.id))}
  for(const ev of (atlasData as any).universeEvents??[]){if(filter&&ev.seriesId!==filter)continue;bucket(Number(ev.year)||0).events.push(ev)}
  return [...byYear.entries()].sort((a,b)=>(a[0]||9999)-(b[0]||9999));
 },[order,filter]);
 const era=describeEra(year);
 const jump=(y:number)=>{
  const next=clamp(y,UNIVERSE_MIN_YEAR,UNIVERSE_MAX_YEAR);setYear(next);
  const target=groups.find(([gy])=>gy>=next)?.[0];
  if(target!=null)requestAnimationFrame(()=>listRef.current?.querySelector("#tl-"+target)?.scrollIntoView({block:"start",behavior:"smooth"}));
 };
 const webisodes=(atlasData as any).webisodes;
 return <div className="page timelinePage">
  <header className="pageHead">
   <div><small>Universe timeline</small><h1>{year} <span>{era.short}</span></h1></div>
   <div className="stepper"><button onClick={()=>jump(year-1)} aria-label="Previous year"><Icon name="back"/></button><button onClick={()=>jump(year+1)} aria-label="Next year"><Icon name="chevron"/></button></div>
  </header>
  <ActivityHeatmap year={year} onYear={jump} seriesId={filter??undefined}/>
  <div className="filterRow" role="group" aria-label="Filter by series">
   <button className={!filter?"active":""} aria-pressed={!filter} onClick={()=>setFilter(null)}>All <b>{order.length}</b></button>
   {SERIES_KEYS.filter(k=>counts.get(META[k].id)).map(k=><button key={k} className={filter===META[k].id?"active":""} aria-pressed={filter===META[k].id} style={{"--c":META[k].color} as CSSProperties} onClick={()=>setFilter(f=>f===META[k].id?null:META[k].id)}><i/>{META[k].short} <b>{counts.get(META[k].id)}</b></button>)}
  </div>
  <div className="listTools"><span>{order.length} episodes in story order</span><button className="textBtn" onClick={()=>jump(year)}>Jump to {year}<Icon name="chevronDown"/></button></div>
  <div className="yearList" ref={listRef}>
   {groups.map(([y,g])=><section key={y} id={"tl-"+y} className={"yearGroup"+(y===year?" isCurrent":"")}>
    <button className="yearHead" onClick={()=>y&&setYear(y)}><b>{y||"Undated"}</b>{y>0&&<span>{describeEra(y).short}</span>}<small>{g.episodes.length} ep</small></button>
    {g.events.map((ev:any)=><div key={ev.id} className="row eventRow" style={{"--c":seriesColor(ev.seriesId)} as CSSProperties}><span className="eventGlyph"><Icon name="spark"/></span><span className="rowText"><small>{seriesShort(ev.seriesId)} · universe event{ev.date?" · "+ev.date:""}</small><b>{ev.title}</b>{ev.description&&<em>{ev.description}</em>}
     {ev.characterIds?.length>0&&<span className="chipList">{ev.characterIds.map((cid:string)=>{const c=characterById.get(cid) as any;return c&&<button key={cid} className="linkChip" onClick={()=>openCharacter(cid)}><Icon name="person"/>{c.name}</button>})}</span>}
    </span></div>)}
    <div className="stack">{g.episodes.map(e=><EpisodeRow key={e.id} episode={e}/>)}</div>
   </section>)}
  </div>
  {webisodes?.series?.length>0&&<Section level={2} title="Webisodes & specials" count={webisodes.totalEpisodes} collapsible defaultOpen={false}>
   <div className="stack">{webisodes.series.map((w:any)=><div className="row staticRow" key={w.id} style={{"--c":seriesColor(w.seriesId)} as CSSProperties}><span className="yearBadge">{w.releaseStart?.slice(0,4)||"?"}</span><span className="rowText"><small>{SERIES_BY_ID[w.seriesId]?.short||w.seriesId} · {w.episodeCount} parts · release order</small><b>{w.title}</b></span></div>)}</div>
   <p className="note"><Icon name="info"/><span>Webisodes stay a release-order layer; exact in-universe dates are not available for every installment.</span></p>
  </Section>}
 </div>;
}
