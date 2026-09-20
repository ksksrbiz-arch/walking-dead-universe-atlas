import {useMemo} from "react";
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

type Props={year:number;onYearChange:(year:number)=>void;series:SeriesKey|"ALL";onEpisode:(id:string)=>void;selectedEpisode?:string|null;playing:boolean;onTogglePlaying:()=>void;onConnections:()=>void};

export default function AtlasTimelineDock({year,onYearChange,series,onEpisode,selectedEpisode,playing,onTogglePlaying,onConnections}:Props){
 const all=useMemo(()=>buildChronology(),[]);
 const visible=useMemo(()=>all.filter(item=>series==="ALL"||item.seriesId===META[series].id),[all,series]);
 const counts=useMemo(()=>ORDER.reduce((acc,key)=>{acc[key]=visible.filter(x=>x.seriesId===META[key].id).length;return acc},{} as Record<SeriesKey,number>),[visible]);
 const pos=(value:number)=>((Math.max(MIN_YEAR,Math.min(MAX_YEAR,value))-MIN_YEAR)/(MAX_YEAR-MIN_YEAR))*100;
 const yearEvents=useMemo(()=>visible.filter(x=>x.start<=year&&x.end>=year),[visible,year]);
 const activeSeries=new Set(yearEvents.map(x=>x.seriesId));
 const selected=selectedEpisode?visible.find(x=>x.id===selectedEpisode):null;
 return <section className="atlasTimelineDock" aria-label="Universe chronology">
  <div className="atlasTimelineHead">
   <div className="atlasTimelineTitle"><span className="timelineLiveDot"/><div><small>UNIVERSE CHRONOLOGY</small><b>{year}</b></div><span className="timelineCount">{yearEvents.length} active</span></div>
   <div className="atlasTimelineActions"><button className="atlasConnectionsButton" onClick={onConnections} aria-label="Open universe connections">{atlasData.connections.length} LINKS</button><button className={playing?"playing":""} onClick={onTogglePlaying} aria-label={playing?"Pause chronology":"Play chronology"}>{playing?"Ⅱ":"▶"}</button><output>{selected?.title||"Drag the chronology"}</output></div>
  </div>
  <div className="atlasTimelineBody">
   <div className="atlasTimelineScale">{[2010,2012,2014,2016,2018,2020,2022,2024,2026,2027].map(y=><button key={y} style={{left:pos(y)+"%"}} onClick={()=>onYearChange(y)}>{y}</button>)}</div>
   <div className="atlasTimelineLanes">
    {ORDER.map(key=>{const meta=META[key];const items=visible.filter(x=>x.seriesId===meta.id);const active=activeSeries.has(meta.id);return <div className={"atlasTimelineLane "+(active?"active":"")} key={key}>
      <button className="atlasTimelineLaneLabel" onClick={()=>onYearChange(items.find(x=>x.start>=year)?.start??year)} style={{"--lane":meta.color} as CSSProperties}>{meta.short}</button>
      <div className="atlasTimelineTrack">{items.map(item=>{const left=pos(item.start);const width=Math.max(.42,pos(item.end)-left);const isSelected=item.id===selectedEpisode;return <button key={item.id} className={"atlasTimelineItem "+(item.kind==="event"?"event":"episode")+(isSelected?" selected":"")} style={{left:left+"%",width:Math.min(18,Math.max(width,item.kind==="event" ? .55 : .62))+"%","--item":meta.color} as CSSProperties} title={item.title} onClick={()=>item.kind==="episode"?onEpisode(item.id):onYearChange(item.start)} aria-label={item.title}><i/></button>})}</div>
     </div>})}
    <div className="atlasTimelineCursor" style={{left:pos(year)+"%"}} aria-hidden="true"><span/></div>
   </div>
   <div className="atlasTimelineFooter"><span>{counts.TWD+counts.FTWD+counts.TALES+counts.WB+counts.OWL+counts.DARYL+counts.DEAD} chronology records</span><input type="range" min={MIN_YEAR} max={MAX_YEAR} step=".01" value={year} onChange={e=>onYearChange(Number(e.target.value))} aria-label="Scrub universe chronology"/><span>2027</span></div>
  </div>
 </section>
}