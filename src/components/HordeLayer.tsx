import type {CSSProperties} from "react";

type Props={enabled:boolean;year:number;project?:(lat:number,lng:number)=>{x:number;y:number};onSelect:()=>void};

/**
 * M1 regional horde overlay. Coordinates are projected from a real geographic
 * anchor so the simulation remains attached to the map during pan and zoom.
 * The herd route and its movement are illustrative, not canon.
 */
export default function HordeLayer({enabled,year,project,onSelect}:Props){
 if(!enabled)return null;

 // Keep the prototype in the southeastern US, starting near Atlanta and
 // moving gradually northeast as the universe-year scrubber advances.
 const projectPoint=project??((latitude:number,longitude:number)=>({x:500+longitude*(476/180),y:300-latitude*(278/90)}));\n const elapsed=Math.max(0,Math.min(16,year-2010));
 const lat=33.75+elapsed*0.24;
 const lng=-84.39+elapsed*0.32;
 const center=projectPoint(lat,lng);
 const west=projectPoint(lat-0.75,lng-2.4);
 const east=projectPoint(lat+0.75,lng+2.4);
 const x=center.x,y=center.y;
 const dx=east.x-west.x,dy=east.y-west.y;
 const routeStart=projectPoint(lat-1.1,lng-3.8);
 const routeMid=projectPoint(lat+0.2,lng-1.6);
 const routeEnd=projectPoint(lat+1.2,lng+2.6);
 const walkers=Array.from({length:52},(_,i)=>({
  x:Math.sin(i*12.9898)*Math.max(8,Math.abs(dx)*0.075)+(i%7-3)*2.4,
  y:Math.cos(i*7.233)*Math.max(6,Math.abs(dx)*0.045)+(Math.floor(i/7)-3)*1.8,
  delay:(i%11)*-.23,
  duration:1.2+(i%5)*.25
 }));
 return <g className="hordeLayer" aria-label="Simulated horde layer">
  <path className="hordeTrail" d={`M ${routeStart.x} ${routeStart.y} Q ${routeMid.x} ${routeMid.y} ${x} ${y} T ${routeEnd.x} ${routeEnd.y}`}/>
  <g className="hordeSelectable" role="button" tabIndex={0} aria-label="Open simulated horde dossier" onClick={onSelect} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();onSelect()}}}>
   <ellipse className="hordeGlow" cx={x} cy={y} rx={Math.max(24,Math.abs(dx)*0.13)} ry={Math.max(18,Math.abs(dx)*0.085)}/>
   {walkers.map((w,i)=><g key={i} className="hordeWalker" style={{"--walk-delay":w.delay+"s","--walk-duration":w.duration+"s"} as CSSProperties} transform={`translate(${x+w.x} ${y+w.y})`}>
    <circle r={i%8===0?3.5:2.8}/><path d="M0 3v6m0-3-2.6 2.6M0 6l2.6 2.6"/>
   </g>)}
   <circle className="hordePulse" cx={x} cy={y} r="12"/>
   <text className="hordeTag" x={x+30} y={y-25}>SIMULATED HERD · M1</text>
   <text className="hordeSubTag" x={x+30} y={y-11}>Illustrative route · not canon</text>
  </g>
 </g>;
}
