import {atlasData} from "../data";
import {buildReverseEpisodeIndex} from "./entityIndex";
import {isValidIsoDate} from "./temporalEngine";

const ids=(items:{id:string}[])=>new Set(items.map(x=>x.id));
const duplicateIds=(items:{id:string}[])=>{
  const seen=new Set<string>(),duplicates=new Set<string>();
  for(const item of items)if(seen.has(item.id))duplicates.add(item.id);else seen.add(item.id);
  return [...duplicates];
};
const has=(set:Set<string>,id:string|undefined)=>!!id&&set.has(id);

export function validateAtlasData(){
  const errors:string[]=[];
  const episodes=(atlasData as any).episodes as any[];
  const seriesIds=ids(atlasData.series);
  const seasonIds=ids(atlasData.seasons);
  const locationIds=ids(atlasData.locations);
  const characterIds=ids(atlasData.characters);
  const communityIds=ids(atlasData.communities);
  const factionIds=ids(atlasData.factions);
  const connectionIds=ids(atlasData.connections);
  const episodeIds=ids(episodes);
  const seasonById=new Map(atlasData.seasons.map(x=>[x.id,x]));
  const episodeById=new Map(episodes.map(x=>[x.id,x]));

  for(const [label,items] of [
    ["series",atlasData.series],["season",atlasData.seasons],["episode",episodes],
    ["location",atlasData.locations],["character",atlasData.characters],
    ["community",atlasData.communities],["faction",atlasData.factions],
    ["connection",atlasData.connections],["event",atlasData.events]
  ] as const){
    const duplicates=duplicateIds(items as any);
    if(duplicates.length)errors.push(`Duplicate ${label} ID(s): ${duplicates.join(", ")}`);
  }

  for(const season of atlasData.seasons){
    if(!seriesIds.has(season.seriesId))errors.push(`Season ${season.id} references missing series ${season.seriesId}`);
  }
  for(const location of atlasData.locations){
    if(!seriesIds.has(location.seriesId))errors.push(`Location ${location.id} references missing series ${location.seriesId}`);
  }
  for(const event of atlasData.events){
    if(!seriesIds.has(event.seriesId))errors.push(`Event ${event.id} references missing series ${event.seriesId}`);
    for(const id of event.locationIds??[])if(!locationIds.has(id))errors.push(`Event ${event.id} references missing location ${id}`);
  }

  for(const episode of episodes){
    if(!seriesIds.has(episode.seriesId))errors.push(`Episode ${episode.id} references missing series ${episode.seriesId}`);
    const season=seasonById.get(episode.seasonId);
    if(!season)errors.push(`Episode ${episode.id} references missing season ${episode.seasonId}`);
    else if(season.seriesId!==episode.seriesId)errors.push(`Episode ${episode.id} crosses series/season boundary: ${episode.seriesId} -> ${episode.seasonId}`);
    const start=Number(episode.timelineStart??episode.timelineEnd);
    const end=Number(episode.timelineEnd??episode.timelineStart);
    if(Number.isFinite(start)&&Number.isFinite(end)&&end<start)errors.push(`Episode ${episode.id} has timelineEnd before timelineStart`);
    if(episode.airDate&&!isValidIsoDate(episode.airDate))errors.push(`Episode ${episode.id} has invalid calendar airDate ${episode.airDate}`);
    for(const id of episode.locationIds??[])if(!locationIds.has(id))errors.push(`Episode ${episode.id} references missing location ${id}`);
    for(const id of episode.characterIds??[])if(!characterIds.has(id))errors.push(`Episode ${episode.id} references missing character ${id}`);
    for(const id of episode.communityIds??[])if(!communityIds.has(id))errors.push(`Episode ${episode.id} references missing community ${id}`);
    for(const id of episode.factionIds??[])if(!factionIds.has(id))errors.push(`Episode ${episode.id} references missing faction ${id}`);
    for(const id of episode.connectionIds??[])if(!connectionIds.has(id))errors.push(`Episode ${episode.id} references missing connection ${id}`);
  }

  const entitySets=[seriesIds,seasonIds,episodeIds,locationIds,characterIds,communityIds,factionIds,connectionIds];
  for(const connection of atlasData.connections){
    const fromExists=entitySets.some(set=>has(set,connection.fromId));
    const toExists=entitySets.some(set=>has(set,connection.toId));
    if(connection.fromId&&!fromExists)errors.push(`Connection ${connection.id} references missing from entity ${connection.fromId}`);
    if(connection.toId&&!toExists)errors.push(`Connection ${connection.id} references missing to entity ${connection.toId}`);
    if(connection.fromId&&connection.fromId===connection.toId)errors.push(`Connection ${connection.id} is self-referential`);
  }

  const charIndex=(atlasData as any).characterEpisodes?.episodesByCharacter||{};
  const locIndex=(atlasData as any).locationEpisodes?.episodesByLocation||{};
  const canonical=buildReverseEpisodeIndex();

  for(const [characterId,episodeIds] of Object.entries(charIndex)){
    if(!characterIds.has(characterId))errors.push(`Character index references missing character ${characterId}`);
    const unique=new Set(episodeIds as string[]);
    if(unique.size!==(episodeIds as string[]).length)errors.push(`Character index ${characterId} contains duplicate episode IDs`);
    for(const episodeId of episodeIds as string[])if(!episodeById.has(episodeId))errors.push(`Character index ${characterId} references missing episode ${episodeId}`);
  }
  for(const [locationId,episodeIds] of Object.entries(locIndex)){
    if(!locationIds.has(locationId))errors.push(`Location index references missing location ${locationId}`);
    const unique=new Set(episodeIds as string[]);
    if(unique.size!==(episodeIds as string[]).length)errors.push(`Location index ${locationId} contains duplicate episode IDs`);
    for(const episodeId of episodeIds as string[])if(!episodeById.has(episodeId))errors.push(`Location index ${locationId} references missing episode ${episodeId}`);
  }

  for(const episode of episodes){
    for(const characterId of episode.characterIds||[])if(!(canonical.byCharacter[characterId]||[]).includes(episode.id))errors.push(`Canonical character index missing ${episode.id} for ${characterId}`);
    for(const locationId of episode.locationIds||[])if(!(canonical.byLocation[locationId]||[]).includes(episode.id))errors.push(`Canonical location index missing ${episode.id} for ${locationId}`);
  }
  for(const [characterId,episodeIds] of Object.entries(canonical.byCharacter)){
    for(const episodeId of episodeIds)if(!episodeById.get(episodeId)?.characterIds?.includes(characterId))errors.push(`Canonical character index has stale edge ${characterId} -> ${episodeId}`);
  }
  for(const [locationId,episodeIds] of Object.entries(canonical.byLocation)){
    for(const episodeId of episodeIds)if(!episodeById.get(episodeId)?.locationIds?.includes(locationId))errors.push(`Canonical location index has stale edge ${locationId} -> ${episodeId}`);
  }

  return [...new Set(errors)];
}