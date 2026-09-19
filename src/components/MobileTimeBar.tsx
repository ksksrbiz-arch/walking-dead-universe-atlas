import {useState} from "react";
import type {CSSProperties} from "react";

type Props={
  year:number;
  playing:boolean;
  onYearChange:(year:number)=>void;
  onTogglePlaying:()=>void;
};

const TICKS=[2010,2014,2018,2022,2027];

export default function MobileTimeBar({year,playing,onYearChange,onTogglePlaying}:Props){
  const [expanded,setExpanded]=useState(false);
  const percent=((year-2010)/(2027-2010))*100;
  return <section className={"mobileTimeBar "+(expanded?"expanded":"")} aria-label="Universe time control">
    <button className="mobileTimeSummary" onClick={()=>setExpanded(v=>!v)} aria-expanded={expanded}>
      <span><small>UNIVERSE TIME</small><b>{year}</b></span>
      <span className="mobileTimeSummaryMeta">{year===2010?"OUTBREAK":year===2027?"CURRENT ERA":"STORY YEAR"}</span>
    </button>
    <button className={"mobileTimePlay "+(playing?"playing":"")} onClick={e=>{e.stopPropagation();onTogglePlaying()}} aria-label={playing?"Pause chronology":"Play chronology"}>{playing?"Ⅱ":"▶"}</button>
    <div className="mobileTimeTrackWrap">
      <div className="mobileTimeTrack" aria-hidden="true">
        <span className="mobileTimeProgress" style={{width:percent+"%"}}/>
        <span className="mobileTimeThumb" style={{left:percent+"%"}}/>
      </div>
      <input type="range" min="2010" max="2027" step=".01" value={year} onChange={e=>onYearChange(Number(e.target.value))} aria-label="Scrub universe year"/>
    </div>
    {expanded&&<div className="mobileTimeTicks">{TICKS.map(t=><button key={t} onClick={()=>onYearChange(t)} style={{"--tick":(((t-2010)/17)*100)+"%"} as CSSProperties}>{t}</button>)}</div>}
  </section>;
}
