import records from "../../data/hordes.json";
import {episodeById,locationById} from "./lookup";
import {normalizeTemporalAnchor} from "./temporalEngine";
import {hasMapCoordinates} from "./atlasHelpers";

export type HordePhase={id:string;episodeId:string;locationId:string|null;label:string;description:string;driver:string;status:"moving"|"gathering"|"overrunning"|"cleared";sourceIndex:number};
export type Horde={id:string;name:string;seriesId:string;summary:string;sources:{title:string;url:string;checkedAt:string}[];phases:HordePhase[]};
export const hordes=records as Horde[];
/** Hide herd identities until at least one supporting episode is watched. */
export function selectableHordes(watched?:Set<string>){
 return hordes.filter(h=>!watched||h.phases.some(p=>watched.has(p.episodeId)));
}
/** Resolve the first eligible recorded event without revealing unwatched anchors. */
export function firstAvailablePhase(horde:Horde,watched?:Set<string>){
 return horde.phases.findIndex(p=>!watched||watched.has(p.episodeId));
}
/** Story year is inherited from the supporting episode, never its broadcast date. */
export function phaseYear(phase:HordePhase){
 const anchor=normalizeTemporalAnchor(episodeById.get(phase.episodeId));
 return anchor.start==null?null:Math.floor(anchor.start);
}
/** Include an event only inside its recorded story-year window. */
export function phaseAtYear(phase:HordePhase,year:number){
 const anchor=normalizeTemporalAnchor(episodeById.get(phase.episodeId));
 return anchor.start!=null&&anchor.end!=null&&year>=Math.floor(anchor.start)&&year<=Math.floor(anchor.end);
}
/** Apply all map and watch filters before exposing event labels or positions. */
export function availablePhases(horde:Horde,year:number,seriesId?:string,watched?:Set<string>){
 return horde.phases.map((phase,index)=>({phase,index})).filter(({phase})=>(!seriesId||horde.seriesId===seriesId)&&phaseAtYear(phase,year)&&(!watched||watched.has(phase.episodeId)));
}
/** Unknown or unmappable positions stay null rather than reusing an earlier pin. */
export function hordeLocation(phase:HordePhase){
 const location=phase.locationId?locationById.get(phase.locationId):undefined;
 return location&&hasMapCoordinates(location)?location:null;
}
/** Build schematic adjacent-place segments without bridging unknown or hidden events. */
export function hordeTrace(horde:Horde,index:number,visible:Set<number>){
 const segments:{from:NonNullable<ReturnType<typeof hordeLocation>>;to:NonNullable<ReturnType<typeof hordeLocation>>}[]=[];
 for(let i=1;i<=index;i++){
  if(!visible.has(i-1)||!visible.has(i))continue;
  const from=hordeLocation(horde.phases[i-1]),to=hordeLocation(horde.phases[i]);
  if(from&&to&&from.id!==to.id)segments.push({from,to});
 }
 return segments;
}
