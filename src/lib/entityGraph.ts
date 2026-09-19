import {atlasData} from "../data";

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
    for(const id of e.locationIds||[])addEdge({kind:"episode",id:e.id},{kind:"location",id}, "OCCURS_AT");
    for(const id of e.characterIds||[])addEdge({kind:"episode",id:e.id},{kind:"character",id}, "FEATURES");
    for(const id of e.communityIds||[])addEdge({kind:"episode",id:e.id},{kind:"community",id}, "INVOLVES");
    for(const id of e.factionIds||[])addEdge({kind:"episode",id:e.id},{kind:"faction",id}, "INVOLVES");
    for(const id of e.connectionIds||[])addEdge({kind:"episode",id:e.id},{kind:"connection",id}, "CONTEXT");
  }
  for(const l of atlasData.locations)addNode("location",l.id);
  for(const c of atlasData.characters)addNode("character",c.id);
  for(const c of atlasData.communities)addNode("community",c.id);
  for(const f of atlasData.factions)addNode("faction",f.id);
  for(const x of atlasData.connections){
    addNode("connection",x.id);
    if(x.fromId)addEdge({kind:"connection",id:x.id},{kind:"character",id:x.fromId},"FROM");
    if(x.toId)addEdge({kind:"connection",id:x.id},{kind:"character",id:x.toId},"TO");
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
  return ((atlasData.characterEpisodes as any).episodesByCharacter?.[characterId]||[]) as string[];
}

export function getLocationEpisodeIds(locationId:string){
  return ((atlasData.locationEpisodes as any).episodesByLocation?.[locationId]||[]) as string[];
}
