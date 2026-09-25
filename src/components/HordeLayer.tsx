import type {CSSProperties} from "react";

type Props={enabled:boolean;year:number;onSelect:()=>void};

/**
 * M1 regional horde overlay. The route and scale are illustrative and are
 * never presented as a canonical Walking Dead sighting.
 * Coordinates use the Atlas' 1000x600 Equal Earth SVG world coordinate space.
 */
export default function HordeLayer({enabled,year,onSelect}:Props){
 if(!enabled)return null;
 const offset=Math.max(0,year-2010);
 const x=203+Math.min(36,offset*2);
 const y=354-Math.min(22,offset*1.2);
 const walkers=Array.from({length:44},(_,i)=>({
  x:Math.sin(i*12.9898)*17+(i%7-3)*2.2,
  y:Math.cos(i*7.233)*10+(Math.floor(i/7)-3)*1.6,
  delay:(i%11)*-.23,
  duration:1.2+(i%5)*.25
 }));
 return <g className="hordeLayer" aria-label="Simulated horde layer">
  <path className="hordeTrail" d={`M ${x-95} ${y+44} Q ${x-30} ${y+8} ${x} ${y} T ${x+95} ${y-42}`}/>
  <g className="hordeSelectable" role="button" tabIndex={0} aria-label="Open simulated horde dossier" onClick={onSelect} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();onSelect()}}}>
   <ellipse className="hordeGlow" cx={x} cy={y} rx="38" ry="24"/>
   {walkers.map((w,i)=><g key={i} className="hordeWalker" style={{"--walk-delay":w.delay+"s","--walk-duration":w.duration+"s"} as CSSProperties} transform={`translate(${x+w.x} ${y+w.y})`}>
    <circle r={i%8===0?2.5:1.8}/><path d="M0 2.2v4.5m0-2.5-2 2m2-2 2 2"/>
   </g>)}
   <circle className="hordePulse" cx={x} cy={y} r="9"/>
   <text className="hordeTag" x={x+24} y={y-21}>SIMULATED HERD · M1</text>
   <text className="hordeSubTag" x={x+24} y={y-8}>Illustrative route · not canon</text>
  </g>
 </g>;
}
