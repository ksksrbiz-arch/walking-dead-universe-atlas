import {hordeLocation,hordeTrace,type Horde} from "../lib/hordes";
type Props={horde:Horde|null;phaseIndex:number;visible:Set<number>;zoom:number;project:(lat:number,lng:number)=>{x:number;y:number};onSelect:()=>void};
export default function HordeLayer({horde,phaseIndex,visible,zoom,project,onSelect}:Props){
 if(!horde||!visible.has(phaseIndex))return null;
 const phase=horde.phases[phaseIndex],location=hordeLocation(phase);
 if(!location)return null;
 const center=project(location.lat,location.lng);
 return <g className="hordeLayer" aria-label="Recorded walker herds">
  <g clipPath="url(#horde-land)">{hordeTrace(horde,phaseIndex,visible).map(({from,to},i)=>{const a=project(from.lat,from.lng),b=project(to.lat,to.lng);return <path key={i} className="hordeTrail" d={`M ${a.x} ${a.y} L ${b.x} ${b.y}`}><title>Recorded locations; exact route unknown</title></path>})}</g>
  <g className="hordeSelectable" data-horde-id={horde.id} role="button" tabIndex={0} aria-label={`Open ${horde.name}: ${phase.label}`} transform={`translate(${center.x} ${center.y}) scale(${1/zoom})`} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();onSelect()}}}>
   <circle r="25" fill="transparent"/><ellipse className="hordeGlow" rx="24" ry="19"/>
   {phase.status==="cleared"?<text className="hordeTag" textAnchor="middle" y="4">CLEARED</text>:Array.from({length:18},(_,i)=><g key={i} fill="#e6ae85" color="#e6ae85" transform={`translate(${Math.sin(i*12.9898)*16} ${Math.cos(i*7.233)*10})`}><circle r="1.6"/><path d="M 0 2 V 5 M 0 5 L -2 8 M 0 5 L 2 8" stroke="currentColor" fill="none"/></g>)}
   <text className="hordeTag" textAnchor="middle" y="-28">{horde.name}</text>
  </g>
 </g>;
}
