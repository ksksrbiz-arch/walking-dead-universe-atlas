import {atlasData} from "../data";

export type ReverseEpisodeIndex={
  byCharacter:Record<string,string[]>;
  byLocation:Record<string,string[]>;
  byCommunity:Record<string,string[]>;
  byFaction:Record<string,string[]>;
};

function add(target:Record<string,string[]>,key:string,episodeId:string){
  if(!key)return;
  (target[key]??=[]).push(episodeId);
}

export function buildReverseEpisodeIndex():ReverseEpisodeIndex{
  const byCharacter:Record<string,string[]>={};
  const byLocation:Record<string,string[]>={};
  const byCommunity:Record<string,string[]>={};
  const byFaction:Record<string,string[]>={};
  for(const episode of atlasData.episodes as any[]){
    for(const id of episode.characterIds??[])add(byCharacter,id,episode.id);
    for(const id of episode.locationIds??[])add(byLocation,id,episode.id);
    for(const id of episode.communityIds??[])add(byCommunity,id,episode.id);
    for(const id of episode.factionIds??[])add(byFaction,id,episode.id);
  }
  return {byCharacter,byLocation,byCommunity,byFaction};
}

export const reverseEpisodeIndex=buildReverseEpisodeIndex();

export function getIndexedEpisodeIds(kind:keyof ReverseEpisodeIndex,id:string){
  return reverseEpisodeIndex[kind][id]??[];
}
