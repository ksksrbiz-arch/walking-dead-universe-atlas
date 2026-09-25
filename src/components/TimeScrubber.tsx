import {memo,useMemo,useRef} from "react";
import type {CSSProperties,PointerEvent as ReactPointerEvent} from "react";
import Icon from "./Icon";
import {buildChronology,describeEra,UNIVERSE_MIN_YEAR,UNIVERSE_MAX_YEAR} from "../lib/chronology";
import {META,SERIES_KEYS} from "../lib/series";
import {clamp} from "../lib/atlasHelpers";

const YEARS=Array.from({length:UNIVERSE_MAX_YEAR-UNIVERSE_MIN_YEAR+1},(_,i)=>UNIVERSE_MIN_YEAR+i);

// Stacked per-series episode counts for every universe year, built once.
let activityCache:{year:number;parts:{id:string;color:string;n:number}[];total:number}[]|null=null;
function activity(){
 if(activityCache)return activityCache;
 const all=buildChronology().filter(x=>x.kind==="episode");
 activityCache=YEARS.map(year=>{
  const parts=SERIES_KEYS.map(k=>({id:META[k].id,color:META[k].color,n:all.filter(x=>x.seriesId===META[k].id&&Math.round(x.start)<=year&&Math.round(x.end)>=year).length})).filter(p=>p.n);
  return {year,parts,total:parts.reduce((s,p)=>s+p.n,0)};
 });
 return activityCache;
}

const Bars=memo(function Bars({seriesId}:{seriesId?:string}){
 const data=activity();
 const max=Math.max(1,...data.map(d=>d.total));
 return <div className="scrubBars" aria-hidden="true">{data.map(d=><span key={d.year} className="scrubBar">{d.parts.filter(p=>!seriesId||p.id===seriesId).map((p,i)=><i key={i} style={{height:(p.n/max*100)+"%",background:p.color} as CSSProperties}/>)}</span>)}</div>;
});

type Props={year:number;onYear:(y:number)=>void;playing:boolean;onTogglePlay:()=>void;seriesId?:string;activeCount:number;placeCount:number;compact?:boolean};

// The universe-year control. The whole histogram is the drag surface (a native
// range input only moves from its thumb on iOS), so a thumb swipe anywhere
// across the bars scrubs time.
export default function TimeScrubber({year,onYear,playing,onTogglePlay,seriesId,activeCount,placeCount,compact}:Props){
 const era=useMemo(()=>describeEra(year),[year]);
 const track=useRef<HTMLDivElement|null>(null);
 const dragging=useRef(false);
 const yearAt=(x:number)=>{const r=track.current!.getBoundingClientRect();return clamp(UNIVERSE_MIN_YEAR+Math.floor((x-r.left)/r.width*YEARS.length),UNIVERSE_MIN_YEAR,UNIVERSE_MAX_YEAR)};
 const down=(e:ReactPointerEvent<HTMLDivElement>)=>{e.stopPropagation();dragging.current=true;e.currentTarget.setPointerCapture?.(e.pointerId);onYear(yearAt(e.clientX))};
 const move=(e:ReactPointerEvent<HTMLDivElement>)=>{if(!dragging.current)return;e.stopPropagation();const y=yearAt(e.clientX);if(y!==year)onYear(y)};
 const up=()=>{dragging.current=false};
 const pct=(year-UNIVERSE_MIN_YEAR+.5)/YEARS.length*100;
 return <div className={"scrubber"+(compact?" compact":"")}>
  <div className="scrubHead">
   <div className="scrubYear"><b key={year}>{year}</b><span><em>{era.short}</em><small>{activeCount} episodes · {placeCount} places</small></span></div>
   <button className={"playBtn"+(playing?" on":"")} onClick={onTogglePlay} aria-label={playing?"Pause time":"Play through time"}><Icon name={playing?"pause":"play"}/></button>
  </div>
  <div className="scrubTrack" ref={track} role="slider" tabIndex={0} aria-label="Universe year" aria-valuemin={UNIVERSE_MIN_YEAR} aria-valuemax={UNIVERSE_MAX_YEAR} aria-valuenow={year} aria-valuetext={`${year}, ${era.title}`}
   onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
   onKeyDown={e=>{if(e.key==="ArrowLeft"||e.key==="ArrowDown"){e.preventDefault();onYear(Math.max(UNIVERSE_MIN_YEAR,year-1))}else if(e.key==="ArrowRight"||e.key==="ArrowUp"){e.preventDefault();onYear(Math.min(UNIVERSE_MAX_YEAR,year+1))}else if(e.key==="Home"){e.preventDefault();onYear(UNIVERSE_MIN_YEAR)}else if(e.key==="End"){e.preventDefault();onYear(UNIVERSE_MAX_YEAR)}}}>
   <Bars seriesId={seriesId}/>
   <span className="scrubFuture" style={{left:pct+"%"}}/>
   <span className="scrubThumb" style={{left:pct+"%"}}/>
  </div>
  <div className="scrubAxis" aria-hidden="true">{[2010,2014,2018,2022,2026].map(y=><span key={y} style={{left:((y-UNIVERSE_MIN_YEAR+.5)/YEARS.length*100)+"%"}}>{y}</span>)}</div>
 </div>;
}
