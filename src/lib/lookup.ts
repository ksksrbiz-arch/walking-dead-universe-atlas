import {atlasData} from "../data";
import type {Location} from "../data";
import {compareEpisodesChronologically} from "./chronology";

// atlasData is static after load. The UI previously resolved every id with
// Array.find over the full registries (hundreds of linear scans per render in
// the detail panels); these maps make each lookup O(1).
const index=<T extends {id:string}>(items:T[])=>new Map(items.map(x=>[x.id,x]));

export const episodeById=index(atlasData.episodes as any[]);
export const locationById=index(atlasData.locations as Location[]);
export const characterById=index(atlasData.characters as any[]);
export const communityById=index(atlasData.communities as any[]);
export const factionById=index(atlasData.factions as any[]);
export const connectionById=index(atlasData.connections as any[]);
export const seriesById=index(atlasData.series as any[]);
export const sourceById=index(atlasData.sources as any[]);

export const episodesFor=(ids:string[])=>ids.map(id=>episodeById.get(id)).filter(Boolean).sort(compareEpisodesChronologically) as any[];
export const locationsFor=(ids:Iterable<string>)=>[...new Set(ids)].map(id=>locationById.get(id)).filter(Boolean) as Location[];

// Display name for any registry id, used where a record's kind is not known.
// Prefer resolveConnectionEndpoint when the kind *is* known (ids collide across kinds).
export function entityName(id:string){
 const item:any=characterById.get(id)??locationById.get(id)??communityById.get(id)??factionById.get(id)??seriesById.get(id)??connectionById.get(id)??episodeById.get(id);
 return item?.name||item?.title||item?.label||id;
}

export const episodeCode=(e:{seasonId?:string;episodeNumber?:number})=>`S${String(e.seasonId??"").slice(-2)}E${String(e.episodeNumber??"").padStart(2,"0")}`;
export const storyYear=(e:any):number|null=>{
 const y=Number(e?.timelineStart??e?.start??e?.timelineEnd??e?.end);
 return Number.isFinite(y)&&y>0?y:null;
};
export const storyRange=(e:any)=>{
 const s=Number(e?.timelineStart??e?.start),en=Number(e?.timelineEnd??e?.end??s);
 if(!Number.isFinite(s)||s<=0)return "?";
 return en&&en!==s?`${s}–${en}`:String(s);
};

// Episode count per character, derived from episode records (the characters.json
// episodeCount field is not populated for every record).
export const characterEpisodeCounts=(()=>{
 const counts=new Map<string,number>();
 for(const e of atlasData.episodes as any[])for(const id of e.characterIds??[])counts.set(id,(counts.get(id)??0)+1);
 return counts;
})();
export const locationEpisodeCounts=(()=>{
 const counts=new Map<string,number>();
 for(const e of atlasData.episodes as any[])for(const id of e.locationIds??[])counts.set(id,(counts.get(id)??0)+1);
 return counts;
})();
