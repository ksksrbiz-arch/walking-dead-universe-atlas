import {memo} from "react";
import type {CSSProperties} from "react";
import type {Journey} from "../lib/journeys";
import {JOURNEY_COLORS} from "../lib/journeys";
import {characterById} from "../lib/lookup";
import {characterImage} from "../lib/atlasHelpers";
import {atlasImageUrl} from "../lib/media";

type Project=(lat:number,lng:number)=>{x:number;y:number};

// Gentle arc instead of a straight segment: A→B and a later B→A stay
// distinguishable, and long hops read as travel rather than a border line.
// Purely visual — distances in the panel are labelled as straight-line km.
function arc(a:{x:number;y:number},b:{x:number;y:number}){
 const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
 const bend=Math.min(len*.18,40);
 const mx=(a.x+b.x)/2-dy/len*bend,my=(a.y+b.y)/2+dx/len*bend;
 return `M${a.x} ${a.y}Q${mx} ${my} ${b.x} ${b.y}`;
}

/** Routes under the markers: travelled legs solid, the leg just taken animates in, the rest is a faint preview. */
export const JourneyRoutes=memo(function JourneyRoutes({journeys,positions,project,cursorKey}:{journeys:Journey[];positions:number[];project:Project;cursorKey:number}){
 return <g className="journeyRoutes" aria-hidden="true">{journeys.map((j,ji)=>{
  const at=positions[ji];
  return <g key={j.characterId} style={{"--jc":JOURNEY_COLORS[ji]} as CSSProperties}>
   {j.legs.map(l=>{
    const a=project(Number(j.stops[l.from].location.lat),Number(j.stops[l.from].location.lng)),b=project(Number(j.stops[l.to].location.lat),Number(j.stops[l.to].location.lng));
    if(Math.hypot(b.x-a.x,b.y-a.y)<.4)return null;
    const state=l.to>at?"ahead":l.to===at?"latest":"done";
    return <path key={l.index+(state==="latest"?"-"+cursorKey:"")} className={"journeyLeg "+state} d={arc(a,b)} pathLength={1}/>;
   })}
  </g>;
 })}</g>;
});

/** Portrait pins at each character's current stop, above the markers. */
export const JourneyAvatars=memo(function JourneyAvatars({journeys,positions,project,zoom}:{journeys:Journey[];positions:number[];project:Project;zoom:number}){
 // Characters standing on the same place fan out side by side.
 const byPlace=new Map<string,number[]>();
 journeys.forEach((j,ji)=>{const s=j.stops[positions[ji]];if(s)byPlace.set(s.location.id,[...(byPlace.get(s.location.id)??[]),ji])});
 return <g className="journeyAvatars" aria-hidden="true">{journeys.map((j,ji)=>{
  const stop=j.stops[positions[ji]];if(!stop)return null;
  const p=project(Number(stop.location.lat),Number(stop.location.lng));
  const group=byPlace.get(stop.location.id)??[ji],slot=group.indexOf(ji),dx=(slot-(group.length-1)/2)*30;
  const c=characterById.get(j.characterId) as any;
  const src=c?characterImage(c):"";
  const initials=j.name.split(/\s+/).map(w=>w[0]).slice(0,2).join("");
  return <g key={j.characterId} className="journeyAvatar" transform={`translate(${p.x} ${p.y})`} style={{"--jc":JOURNEY_COLORS[ji]} as CSSProperties}>
   <g transform={`scale(${1/zoom})`}>
    <g transform={`translate(${dx} -30)`}><g key={stop.index} className="journeyAvatarBody">
     <path className="journeyAvatarTail" d="M-6 12 L0 22 L6 12Z"/>
     <circle className="journeyAvatarRing" r="16"/>
     <text className="journeyAvatarInitials" textAnchor="middle" dominantBaseline="central">{initials}</text>
     {src&&<>
      <clipPath id={"jav-"+ji}><circle r="13.5"/></clipPath>
      <image href={atlasImageUrl(src,96)} x="-13.5" y="-13.5" width="27" height="27" clipPath={`url(#jav-${ji})`} preserveAspectRatio="xMidYMid slice"/>
     </>}
    </g></g>
   </g>
  </g>;
 })}</g>;
});
