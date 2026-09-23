import episodes from "../data/episodes.json";
import characters from "../data/characters.json";
import locations from "../data/locations.json";
import communities from "../data/communities.json";
import factions from "../data/factions.json";
import connections from "../data/connections.json";
import characterEpisodes from "../../data/characterEpisodes.json";
import locationEpisodes from "../../data/locationEpisodes.json";

export type RuntimeRelationship={kind:string;id:string;episodeIds:string[]};

const collections:Record<string,any[]>={character:characters as any,location:locations as any,community:communities as any,faction:factions as any,connection:connections as any};
const episodeList=episodes as any[];
const curated:any={character:characterEpisodes,location:locationEpisodes};

function directEpisodeIds(kind:string,id:string){
  const field=kind==="character"?"characterIds":kind==="location"?"locationIds":kind==="community"?"communityIds":kind==="faction"?"factionIds":kind==="connection"?"connectionIds":null;
  if(!field)return [];
  return episodeList.filter((episode:any)=>Array.isArray(episode[field])&&episode[field].includes(id)).map((episode:any)=>episode.id);
}

export async function getRuntimeMeta(){
  return {version:"5-local",generatedAt:"bundled",counts:{episodes:episodeList.length,characters:(characters as any[]).length,locations:(locations as any[]).length,communities:(communities as any[]).length,factions:(factions as any[]).length,connections:(connections as any[]).length}};
}

export async function getRuntimeRelationships(kind:string,id:string):Promise<RuntimeRelationship|null>{
  if(!collections[kind])return null;
  const ids=new Set<string>(directEpisodeIds(kind,id));
  const curatedIndex=curated[kind]?.["episodesBy"+kind.charAt(0).toUpperCase()+kind.slice(1)];
  for(const episodeId of curatedIndex?.[id]??[])ids.add(episodeId);
  return {kind,id,episodeIds:[...ids]};
}

const relationshipCache=new Map<string,RuntimeRelationship>();
export async function getRuntimeEpisodeIds(kind:string,id:string):Promise<string[]|null>{
  const key=kind+":"+id;
  const cached=relationshipCache.get(key);
  if(cached)return cached.episodeIds;
  const relationship=await getRuntimeRelationships(kind,id);
  if(!relationship)return null;
  relationshipCache.set(key,relationship);
  return relationship.episodeIds;
}
