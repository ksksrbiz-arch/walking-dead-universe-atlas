import {atlasData} from "../data";
import {getIndexedEpisodeIds} from "./entityIndex";

export type EntityKind="series"|"season"|"episode"|"location"|"character"|"community"|"faction"|"connection";
export type EntityRef={kind:EntityKind;id:string};

export type EntityEdge={
  id:string;
  from:EntityRef;
  to:EntityRef;
  type:string;
  confidence:"confirmed"|"approximate"|"source-derived";
};

const key=(kind:EntityKind,id:string)=>`${kind}:${id}`;

const entityIdSets:Record<EntityKind,Set<string>>={
  series:new Set(atlasData.series.map(x=>x.id)),
  season:new Set(atlasData.seasons.map(x=>x.id)),
  episode:new Set(atlasData.episodes.map(x=>x.id)),
  location:new Set(atlasData.locations.map(x=>x.id)),
  character:new Set(atlasData.characters.map(x=>x.id)),
  community:new Set(atlasData.communities.map(x=>x.id)),
  faction:new Set(atlasData.factions.map(x=>x.id)),
  connection:new Set(atlasData.connections.map(x=>x.id))
};

type ConnectionRecord={id:string;type:string;fromId?:string;toId?:string;certainty?:string};

const connectionEndpointKinds:Record<string,[EntityKind,EntityKind]>={
  "character-faction":["character","faction"],
  "character-location":["character","location"],
  "character-character":["character","character"],
  "character-community":["character","community"],
  "community-faction":["community","faction"],
  "faction-community":["faction","community"],
  "community-series":["community","series"],
  "faction-series":["faction","series"],
  "cross-series":["character","series"],
  "lore":["character","series"]
};

function resolveEntityKind(id:string):EntityKind|null{
  for(const kind of ["character","location","community","faction","series","season","episode","connection"] as EntityKind[]){
    if(entityIdSets[kind].has(id))return kind;
  }
  return null;
}

function resolveConnectionEndpoint(connection:ConnectionRecord,side:"from"|"to"):EntityRef|null{
  const id=side==="from"?connection.fromId:connection.toId;
  if(!id)return null;
  const expected=connectionEndpointKinds[connection.type]?.[side==="from"?0:1];
  const kind=expected&&entityIdSets[expected].has(id)?expected:resolveEntityKind(id);
  return kind?{kind,id}:null;
}

export function buildEntityGraph(){
  const nodes=new Map<string,EntityRef>();
  const edges:EntityEdge[]=[];
  const addNode=(kind:EntityKind,id:string)=>{if(id)nodes.set(key(kind,id),{kind,id})};
  const addEdge=(from:EntityRef,to:EntityRef,type:string,confidence:EntityEdge["confidence"]="source-derived")=>{
    addNode(from.kind,from.id); addNode(to.kind,to.id);
    edges.push({id:`${key(from.kind,from.id)}>${type}>${key(to.kind,to.id)}`,from,to,type,confidence});
  };

  for(const s of atlasData.series)addNode("series",s.id);
  for(const s of atlasData.seasons)addNode("season",s.id);
  for(const e of atlasData.episodes){
    addNode("episode",e.id);
    if(e.seriesId)addEdge({kind:"episode",id:e.id},{kind:"series",id:e.seriesId},"IN_SERIES");
    if(e.seasonId)addEdge({kind:"episode",id:e.id},{kind:"season",id:e.seasonId},"IN_SEASON");
    for(const id of e.locationIds||[])addEdge({kind:"episode",id:e.id},{kind:"location",id},"OCCURS_AT");
    for(const id of e.characterIds||[])addEdge({kind:"episode",id:e.id},{kind:"character",id},"FEATURES");
    for(const id of e.communityIds||[])addEdge({kind:"episode",id:e.id},{kind:"community",id},"INVOLVES");
    for(const id of e.factionIds||[])addEdge({kind:"episode",id:e.id},{kind:"faction",id},"INVOLVES");
    for(const id of e.connectionIds||[])addEdge({kind:"episode",id:e.id},{kind:"connection",id},"CONTEXT");
  }
  for(const l of atlasData.locations)addNode("location",l.id);
  for(const c of atlasData.characters)addNode("character",c.id);
  for(const c of atlasData.communities)addNode("community",c.id);
  for(const f of atlasData.factions)addNode("faction",f.id);

  const curated=(atlasData as any).connectionEpisodes?.connections||{};
  for(const [connectionId,evidence] of Object.entries(curated) as any){
    for(const episodeId of evidence.episodeIds||[])addEdge({kind:"connection",id:connectionId},{kind:"episode",id:episodeId},"DOCUMENTED_IN",evidence.evidenceKind==="direct"?"confirmed":"source-derived");
  }

  for(const x of atlasData.connections as ConnectionRecord[]){
    addNode("connection",x.id);
    const from=resolveConnectionEndpoint(x,"from");
    const to=resolveConnectionEndpoint(x,"to");
    if(from)addEdge({kind:"connection",id:x.id},from,"FROM",x.certainty==="confirmed"?"confirmed":"source-derived");
    if(to)addEdge({kind:"connection",id:x.id},to,"TO",x.certainty==="confirmed"?"confirmed":"source-derived");
  }

  const adjacency=new Map<string,EntityEdge[]>();
  for(const e of edges){
    const a=key(e.from.kind,e.from.id),b=key(e.to.kind,e.to.id);
    if(!adjacency.has(a))adjacency.set(a,[]);
    if(!adjacency.has(b))adjacency.set(b,[]);
    adjacency.get(a)!.push(e);
    adjacency.get(b)!.push(e);
  }
  return {nodes,edges,adjacency};
}

export function getCharacterEpisodeIds(characterId:string){
  const indexed=getIndexedEpisodeIds("byCharacter",characterId);
  const source=((atlasData.characterEpisodes as any).episodesByCharacter?.[characterId]||[]) as string[];
  return [...new Set([...indexed,...source])];
}

export function getLocationEpisodeIds(locationId:string){
  // Location history may intentionally include episodes where a location is
  // referenced by the broader atlas chronology but is not an episode-level
  // geography tag. Prefer the curated location history index for that use case.
  return ((atlasData.locationEpisodes as any).episodesByLocation?.[locationId]||[]) as string[];
}

export const entityGraph=buildEntityGraph();

export function getEpisodeConnectionIds(episodeId:string):string[]{
 const episode=atlasData.episodes.find((e:any)=>e.id===episodeId) as any;
 if(!episode)return [];
 const has=(kind:EntityKind,id:string)=>{
  if(kind==="episode")return episode.id===id;
  if(kind==="series")return episode.seriesId===id;
  if(kind==="character")return (episode.characterIds??[]).includes(id);
  if(kind==="location")return (episode.locationIds??[]).includes(id);
  if(kind==="community")return (episode.communityIds??[]).includes(id);
  if(kind==="faction")return (episode.factionIds??[]).includes(id);
  return false;
 };
 const direct=new Set<string>(episode.connectionIds??[]);
 const curated=((atlasData as any).connectionEpisodes?.connections||{}) as Record<string,{episodeIds:string[]}>;
 for(const [connectionId,evidence] of Object.entries(curated))if(evidence.episodeIds?.includes(episodeId))direct.add(connectionId);
 for(const connection of atlasData.connections as ConnectionRecord[]){
  const from=resolveConnectionEndpoint(connection,"from");
  const to=resolveConnectionEndpoint(connection,"to");
  if(from&&to&&has(from.kind,from.id)&&has(to.kind,to.id))direct.add(connection.id);
 }
 return [...direct];
}

export function getEntityNeighborhood(kind:EntityKind,id:string){
  const nodeKey=key(kind,id);
  const edges=entityGraph.adjacency.get(nodeKey)||[];
  return edges.map(edge=>{
    const ref=edge.from.kind===kind&&edge.from.id===id?edge.to:edge.from;
    return {ref,type:edge.type,confidence:edge.confidence};
  });
}
