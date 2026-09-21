import {useMemo,useState} from "react";
import type {CSSProperties} from "react";
import {describeEra} from "../lib/chronology";

type Props={
  year:number;
  playing:boolean;
  onYearChange:(year:number)=>void;
  onTogglePlaying:()=>void;
};

const MIN_YEAR=2010;
const MAX_YEAR=2028;
const SPAN=MAX_YEAR-MIN_YEAR;
const TICKS=[2010,2014,2018,2022,2028];

export default function MobileTimeBar({year,playing,onYearChange,onTogglePlaying}:Props){
  const [expanded,setExpanded]=useState(false);
  const percent=((year-MIN_YEAR)/SPAN)*100;
  const era=useMemo(()=>describeEra(year),[year]);
  return <section className={"mobileTimeBar "+(expanded?"expanded":"")} aria-label="Universe time control">
    <button className="mobileTimeSummary" onClick={()=>setExpanded(v=>!v)} aria-expanded={expanded}>
      <span><small>UNIVERSE TIME</small><b>{year}</b></span>
      <span className="mobileTimeSummaryMeta">{era.short}</span>
    </button>
    <button className={"mobileTimePlay "+(playing?"playing":"")} onClick={e=>{e.stopPropagation();onTogglePlaying()}} aria-label={playing?"Pause chronology":"Play chronology"}>{playing?"Ⅱ":"▶"}</button>
    <div className="mobileTimeTrackWrap">
      <div className="mobileTimeTrack" aria-hidden="true">
        <span className="mobileTimeProgress" style={{width:percent+"%"}}/>
        <span className="mobileTimeThumb" style={{left:percent+"%"}}/>
      </div>
      <input type="range" min={MIN_YEAR} max={MAX_YEAR} step=".01" value={year} onChange={e=>onYearChange(Number(e.target.value))} aria-label="Scrub universe year"/>
    </div>
    {expanded&&<div className="mobileTimeTicks">{TICKS.map(t=><button key={t} onClick={()=>onYearChange(t)} style={{"--tick":(((t-MIN_YEAR)/SPAN)*100)+"%"} as CSSProperties}>{t}</button>)}</div>}
  </section>;
}
