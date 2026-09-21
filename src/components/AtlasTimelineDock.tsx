import {memo,useMemo,useRef} from "react";
import type {CSSProperties} from "react";
import {atlasData,SeriesKey} from "../data";
import {buildChronology} from "../lib/chronology";

const META:Record<SeriesKey,{id:string;name:string;color:string;short:string}>={
 TWD:{id:"twd",name:"The Walking Dead",color:"#e7e7e1",short:"TWD"},
 FTWD:{id:"ftwd",name:"Fear the Walking Dead",color:"#d4a64b",short:"FEAR"},
 TALES:{id:"tales",name:"Tales of the Walking Dead",color:"#d68168",short:"TALES"},
 WB:{id:"wb",name:"World Beyond",color:"#72a9c5",short:"WORLD BEYOND"},
 OWL:{id:"owl",name:"The Ones Who Live",color:"#d26e6b",short:"TOWL"},
 DARYL:{id:"daryl",name:"Daryl Dixon",color:"#9d88c8",short:"DARYL"},
 DEAD:{id:"dead",name:"Dead City",color:"#5bb29b",short:"DEAD CITY"},
 MORE_TALES:{id:"more-tales",name:"More Tales from the TWDU",color:"#c46b9a",short:"MORE TALES"}
};
const ORDER:SeriesKey[]=["TWD","FTWD","TALES","WB","OWL","DARYL","DEAD","MORE_TALES"];
const MIN_YEAR=2010;
const MAX_YEAR=2027;
const pos=(value:number)=>((Math.max(MIN_YEAR,Math.min(MAX_YEAR,value))-MIN_YEAR)/(MAX_YEAR-MIN_YEAR))*100;

type ChronologyLike={id:string;kind:string;start:number;end:number;title:string};

// A lane's item set only changes when the series filter changes, not on every year
// tick — but the whole dock re-renders on every tick (the cursor position and the
// active/inactive lane highlight both depend on the current year). Without this
// split, all ~380 chronology items across every lane were being torn down and
// rebuilt as fresh <button> elements on every single tick, which is the same class
// of cost the map's country paths had. Memoizing the button list separately (keyed
// on the stable items array + selection, not year) means a year tick only touches
// the cheap parts: the lane's active class and the cursor position.
const TimelineLane=memo(function TimelineLane({meta,items,active,selectedEpisode,year,onEpisode,onYearChange}:{
 meta:{color:string;short:string};items:ChronologyLike[];active:boolean;selectedEpisode?:string|null;year:number;
 onEpisode:(id:string)=>void;onYearChange:(year:number)=>void;
}){
 // onEpisode/onYearChange are freshly-created closures from App on every render (they
 // aren't wrapped in useCallback there), so putting them directly in the deps below
 // would invalidate this memo on every year tick — the exact cost this exists to avoid.
 // Reading them through a ref keeps the memo keyed on what actually stays stable
 // (the items array + selection) while still always calling the latest callback.
 const callbacks=useRef({onEpisode,onYearChange});
 callbacks.current={onEpisode,onYearChange};
 const buttons=useMemo(()=>items.map(item=>{
   const left=pos(item.start);const width=Math.max(.42,pos(item.end)-left);
   const isSelected=item.id===selectedEpisode;
   return <button key={item.id} className={"atlasTimelineItem "+(item.kind==="event"?"event":item.kind==="universe-event"?"universe-event":"episode")+(isSelected?" selected":"")} style={{left:left+"%",width:Math.min(18,Math.max(width,item.kind==="event"?.55:.62))+"%","--item":meta.color} as CSSProperties} title={item.title} onClick={()=>item.kind==="episode"?callbacks.current.onEpisode(item.id):callbacks.current.onYearChange(item.start)} aria-label={item.title}><i/></button>;
 }),[items,selectedEpisode,meta.color]);
 return <div className={"atlasTimelineLane "+(active?"active":"")}>
   <button className="atlasTimelineLaneLabel" onClick={()=>onYearChange(items.find(x=>x.start>=year)?.start??year)} style={{"--lane":meta.color} as CSSProperties}>{meta.short}</button>
   <div className="atlasTimelineTrack">{buttons}</div>
  </div>;
});

type Props={year:number;onYearChange:(year:number)=>void;series:SeriesKey|"ALL";onEpisode:(id:string)=>void;selectedEpisode?:string|null;playing:boolean;onTogglePlaying:()=>void;onConnections:()=>void};

export default function AtlasTimelineDock({year,onYearChange,series,onEpisode,selectedEpisode,playing,onTogglePlaying,onConnections}:Props){
 const all=useMemo(()=>buildChronology(),[]);
 // Lanes are a fixed-height grid tuned for series that actually have chronology items;
 // an always-empty lane (e.g. an announced series with no episodes yet) would overflow
 // the dock's fixed height and clip the year scrubber below it.
 const laneOrder=useMemo(()=>ORDER.filter(key=>all.some(x=>x.seriesId===META[key].id)),[all]);
 const visible=useMemo(()=>all.filter(item=>series==="ALL"||item.seriesId===META[series].id),[all,series]);
 const itemsByLane=useMemo(()=>{
  const map={} as Record<SeriesKey,ChronologyLike[]>;
  for(const key of laneOrder)map[key]=visible.filter(x=>x.seriesId===META[key].id);
  return map;
 },[visible,laneOrder]);
 const counts=useMemo(()=>ORDER.reduce((acc,key)=>{acc[key]=visible.filter(x=>x.seriesId===META[key].id).length;return acc},{} as Record<SeriesKey,number>),[visible]);
 const yearEvents=useMemo(()=>visible.filter(x=>x.start<=year&&x.end>=year),[visible,year]);
 const activeSeries=useMemo(()=>new Set(yearEvents.map(x=>x.seriesId)),[yearEvents]);
 const selected=selectedEpisode?visible.find(x=>x.id===selectedEpisode):null;
 return <section className="atlasTimelineDock" aria-label="Universe chronology">
  <div className="atlasTimelineHead">
   <div className="atlasTimelineTitle"><span className="timelineLiveDot"/><div><small>UNIVERSE CHRONOLOGY</small><b>{year}</b></div><span className="timelineCount">{yearEvents.length} active</span></div>
   <div className="atlasTimelineActions"><button className="atlasConnectionsButton" onClick={onConnections} aria-label="Open universe connections">{atlasData.connections.length} LINKS</button><button className={playing?"playing":""} onClick={onTogglePlaying} aria-label={playing?"Pause chronology":"Play chronology"}>{playing?"Ⅱ":"▶"}</button><output>{selected?.title||"Drag the chronology"}</output></div>
  </div>
  <div className="atlasTimelineBody">
   <div className="atlasTimelineScale">{[2010,2012,2014,2016,2018,2020,2022,2024,2026,2027].map(y=><button key={y} style={{left:pos(y)+"%"}} onClick={()=>onYearChange(y)}>{y}</button>)}</div>
   <div className="atlasTimelineLanes">
    {laneOrder.map(key=><TimelineLane key={key} meta={META[key]} items={itemsByLane[key]} active={activeSeries.has(META[key].id)} selectedEpisode={selectedEpisode} year={year} onEpisode={onEpisode} onYearChange={onYearChange}/>)}
    <div className="atlasTimelineCursor" style={{left:pos(year)+"%"}} aria-hidden="true"><span/></div>
   </div>
   <div className="atlasTimelineFooter"><span>{Object.values(counts).reduce((a,b)=>a+b,0)} chronology records</span><input type="range" min={MIN_YEAR} max={MAX_YEAR} step=".01" value={year} onChange={e=>onYearChange(Number(e.target.value))} aria-label="Scrub universe chronology"/><span>2027</span></div>
  </div>
 </section>
}
