import {atlasData} from "../data";

export type RuntimeRelationship={kind:string;id:string;episodeIds:string[]};

const collections:Record<string,any[]>={character:atlasData.characters as any,location:atlasData.locations as any,community:atlasData.communities as any,faction:atlasData.factions as any,connection:atlasData.connections as any};
const episodeList=atlasData.episodes as any[];
const curated:any={character:atlasData.characterEpisodes,location:atlasData.locationEpisodes};

function directEpisodeIds(kind:string,id:string){
  const field=kind==="character"?"characterIds":kind==="location"?"locationIds":kind==="community"?"communityIds":kind==="faction"?"factionIds":kind==="connection"?"connectionIds":null;
  if(!field)return [];
  return episodeList.filter((episode:any)=>Array.isArray(episode[field])&&episode[field].includes(id)).map((episode:any)=>episode.id);
}

export async function getRuntimeMeta(){
  return {version:"5-local",generatedAt:"bundled",counts:{
    episodes:episodeList.length,
    characters:atlasData.characters.length,
    locations:atlasData.locations.length,
    communities:atlasData.communities.length,
    factions:atlasData.factions.length,
    connections:atlasData.connections.length,
  }};
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
