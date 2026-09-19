import {atlasData} from "../data";
import {buildReverseEpisodeIndex} from "./entityIndex";

const ids=(items:{id:string}[])=>new Set(items.map(x=>x.id));

export function validateAtlasData(){
  const errors:string[]=[];
  const seriesIds=ids(atlasData.series);
  const seasonIds=ids(atlasData.seasons);
  const locationIds=ids(atlasData.locations);
  const characterIds=ids(atlasData.characters);
  const communityIds=ids(atlasData.communities);
  const factionIds=ids(atlasData.factions);
  const connectionIds=ids(atlasData.connections);
  for(const season of atlasData.seasons) if(!seriesIds.has(season.seriesId)) errors.push(`Season ${season.id} references missing series ${season.seriesId}`);
  for(const location of atlasData.locations) if(!seriesIds.has(location.seriesId)) errors.push(`Location ${location.id} references missing series ${location.seriesId}`);
  for(const event of atlasData.events) if(!seriesIds.has(event.seriesId)) errors.push(`Event ${event.id} references missing series ${event.seriesId}`);
  if(new Set(atlasData.seasons.map(x=>x.id)).size!==atlasData.seasons.length) errors.push("Duplicate season ID detected");
  if(new Set(atlasData.locations.map(x=>x.id)).size!==atlasData.locations.length) errors.push("Duplicate location ID detected");
  if(new Set(atlasData.events.map(x=>x.id)).size!==atlasData.events.length) errors.push("Duplicate event ID detected");
  if(new Set((atlasData as any).episodes.map((x:any)=>x.id)).size!==(atlasData as any).episodes.length) errors.push("Duplicate episode ID detected");
  for(const episode of (atlasData as any).episodes){
    if(!seriesIds.has(episode.seriesId)) errors.push(`Episode ${episode.id} references missing series ${episode.seriesId}`);
    if(!seasonIds.has(episode.seasonId)) errors.push(`Episode ${episode.id} references missing season ${episode.seasonId}`);
    for(const id of episode.locationIds??[]) if(!locationIds.has(id)) errors.push(`Episode ${episode.id} references missing location ${id}`);
    for(const id of episode.characterIds??[]) if(!characterIds.has(id)) errors.push(`Episode ${episode.id} references missing character ${id}`);
    for(const id of episode.communityIds??[]) if(!communityIds.has(id)) errors.push(`Episode ${episode.id} references missing community ${id}`);
    for(const id of episode.factionIds??[]) if(!factionIds.has(id)) errors.push(`Episode ${episode.id} references missing faction ${id}`);
    for(const id of episode.connectionIds??[]) if(!connectionIds.has(id)) errors.push(`Episode ${episode.id} references missing connection ${id}`);
  }
  const charIndex=(atlasData as any).characterEpisodes?.episodesByCharacter||{};
  const canonical=buildReverseEpisodeIndex();
  const locIndex=(atlasData as any).locationEpisodes?.episodesByLocation||{};
  for(const [characterId,episodeIds] of Object.entries(charIndex)){
    if(!characterIds.has(characterId))errors.push(`Character index references missing character ${characterId}`);
    for(const episodeId of (episodeIds as string[]))if(!(atlasData as any).episodes.some((e:any)=>e.id===episodeId))errors.push(`Character index ${characterId} references missing episode ${episodeId}`);
  }
  for(const [locationId,episodeIds] of Object.entries(locIndex)){
    if(!locationIds.has(locationId))errors.push(`Location index references missing location ${locationId}`);
    for(const episodeId of (episodeIds as string[]))if(!(atlasData as any).episodes.some((e:any)=>e.id===episodeId))errors.push(`Location index ${locationId} references missing episode ${episodeId}`);
  }
  for(const episode of (atlasData as any).episodes){
    for(const characterId of episode.characterIds||[])if(!(canonical.byCharacter[characterId]||[]).includes(episode.id))errors.push(`Canonical character index missing ${episode.id} for ${characterId}`);
    for(const locationId of episode.locationIds||[])if(!(canonical.byLocation[locationId]||[]).includes(episode.id))errors.push(`Canonical location index missing ${episode.id} for ${locationId}`);
  }
  for(const [characterId,episodeIds] of Object.entries(canonical.byCharacter)){
    for(const episodeId of episodeIds)if(!(atlasData as any).episodes.find((e:any)=>e.id===episodeId)?.characterIds?.includes(characterId))errors.push(`Canonical character index has stale edge ${characterId} -> ${episodeId}`);
  }
  for(const [locationId,episodeIds] of Object.entries(canonical.byLocation)){
    for(const episodeId of episodeIds)if(!(atlasData as any).episodes.find((e:any)=>e.id===episodeId)?.locationIds?.includes(locationId))errors.push(`Canonical location index has stale edge ${locationId} -> ${episodeId}`);
  }
  void seasonIds; void locationIds;
  return [...new Set(errors)];
}