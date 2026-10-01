import type {CSSProperties} from "react";
import {hordeLocation,hordeTrace,type Horde} from "../lib/hordes";
// Fixed offsets and negative delays keep the crowd stable across map renders.
const walkers=Array.from({length:18},(_,i)=>{const angle=i*2.399963, radius=Math.sqrt((i+.5)/18);return {x:Math.cos(angle)*18*radius,y:Math.sin(angle)*12*radius,delay:-i*.47,duration:1.8+(i%5)*.23}}).sort((a,b)=>a.y-b.y);
type Props={horde:Horde|null;phaseIndex:number;visible:Set<number>;zoom:number;project:(lat:number,lng:number)=>{x:number;y:number};onSelect:()=>void};
export default function HordeLayer({horde,phaseIndex,visible,zoom,project,onSelect}:Props){
 if(!horde||!visible.has(phaseIndex))return null;
 const phase=horde.phases[phaseIndex],location=hordeLocation(phase);
 if(!location)return null;
 const center=project(location.lat,location.lng);
 return <g className="hordeLayer" aria-label="Recorded walker herds">
  <g clipPath="url(#horde-land)">{hordeTrace(horde,phaseIndex,visible).map(({from,to},i)=>{const a=project(from.lat,from.lng),b=project(to.lat,to.lng);return <path key={i} className="hordeTrail" d={`M ${a.x} ${a.y} L ${b.x} ${b.y}`}><title>Recorded locations; exact route unknown</title></path>})}</g>
  <g className="hordeSelectable" data-horde-id={horde.id} data-horde-status={phase.status} role="button" tabIndex={0} aria-label={`Open ${horde.name}: ${phase.label}`} transform={`translate(${center.x} ${center.y}) scale(${1/zoom})`} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();onSelect()}}}>
   <circle r="25" fill="transparent"/><ellipse className="hordeGlow" rx="24" ry="19"/>
   {phase.status==="cleared"?<text className="hordeTag" textAnchor="middle" y="4">CLEARED</text>:<g aria-hidden="true">{walkers.map((w,i)=><g key={i} transform={`translate(${w.x} ${w.y})`} style={{"--walk-duration":`${w.duration*(phase.status==="gathering"?1.4:phase.status==="overrunning"?.8:1)}s`,"--walk-delay":`${w.delay}s`,"--shuffle-duration":`${5+i%4}s`} as CSSProperties}>
    <ellipse className="hordeShadow" cy="8" rx="2.6" ry=".8"/>
    <g className="hordeShuffle"><g className="hordeWalker">
     <circle cy="0" r="1.6"/><path className="hordeBody" d="M 0 2 L -.3 5.5 M 0 2.5 L -2 4.5 M 0 2.5 L 2 4"/>
     <path className="hordeLegBack" d="M -.3 5.5 L -1.5 8"/><path className="hordeLegFront" d="M -.3 5.5 L 1.5 8"/>
    </g></g>
   </g>)}</g>}
   <text className="hordeTag" textAnchor="middle" y="40">{horde.name}</text>
  </g>
 </g>;
}
