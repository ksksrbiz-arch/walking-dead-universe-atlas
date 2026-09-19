import {atlasData} from "../data";

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
  void seasonIds; void locationIds;
  return errors;
}