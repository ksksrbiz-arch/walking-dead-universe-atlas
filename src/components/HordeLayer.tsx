import {useEffect,useMemo,useRef,useState} from "react";

type Props={enabled:boolean;year:number;onSelect:()=>void};
type Walker={x:number;y:number;phase:number;speed:number};

/**
 * M1 regional horde overlay. The route and scale are explicitly illustrative,
 * never presented as a canonical Walking Dead sighting.
 * Coordinates use the Atlas' 1000x600 Equal Earth SVG world coordinate space.
 */
export default function HordeLayer({enabled,year,onSelect}:Props){
 const canvasRef=useRef<SVGSVGElement|null>(null);
 const [phase,setPhase]=useState(0);
 const reduced=useMemo(()=>typeof window!=="undefined"&&window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,[ ]);
 useEffect(()=>{
  if(!enabled||reduced)return;
  let raf=0;let last=0;let elapsed=0;
  const tick=(now:number)=>{if(last)elapsed+=Math.min(48,now-last);last=now;setPhase(elapsed/1000);raf=requestAnimationFrame(tick)};
  raf=requestAnimationFrame(tick);
  return()=>cancelAnimationFrame(raf);
 },[enabled,reduced]);
 if(!enabled)return null;
 const time=Math.max(0,year-2010);
 const baseX=projectedX(time,phase,reduced);
 const baseY=projectedY(time,phase,reduced);
 const walkers:Walker[]=Array.from({length:44},(_,i)=>({
  x:Math.sin(i*12.9898)*17+(i%7-3)*2.2,
  y:Math.cos(i*7.233)*10+(Math.floor(i/7)-3)*1.6,
  phase:i*1.71,speed:.55+(i%5)*.12
 }));
 return <g className="hordeLayer" aria-label="Simulated horde layer">
  <path className="hordeTrail" d={`M ${baseX-95} ${baseY+44} Q ${baseX-30} ${baseY+8} ${baseX} ${baseY} T ${baseX+95} ${baseY-42}`}/>
  <g className="hordeSelectable" role="button" tabIndex={0} aria-label="Open simulated horde dossier" onClick={onSelect} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();onSelect()}}}>
   <ellipse className="hordeGlow" cx={baseX} cy={baseY} rx="38" ry="24"/>
   {walkers.map((w,i)=><g key={i} transform={`translate(${baseX+w.x+Math.sin(phase*w.speed+w.phase)*2.3} ${baseY+w.y+Math.cos(phase*w.speed+w.phase)*1.6}) rotate(${Math.sin(phase+w.phase)*13})`} className="hordeWalker">
    <circle r={i%8===0?2.5:1.8}/><path d="M0 2.2v4.5m0-2.5-2 2m2-2 2 2"/>
   </g>)}
   <circle className="hordePulse" cx={baseX} cy={baseY} r="9"/>
   <text className="hordeTag" x={baseX+24} y={baseY-21}>SIMULATED HERD · M1</text>
   <text className="hordeSubTag" x={baseX+24} y={baseY-8}>Illustrative route · not canon</text>
  </g>
 </g>;
}
function projectedX(yearOffset:number,phase:number,reduced:boolean){return 203+Math.min(36,yearOffset*2)+(reduced?0:Math.sin(phase*.23)*5)}
function projectedY(yearOffset:number,phase:number,reduced:boolean){return 354-Math.min(22,yearOffset*1.2)+(reduced?0:Math.cos(phase*.19)*4)}
