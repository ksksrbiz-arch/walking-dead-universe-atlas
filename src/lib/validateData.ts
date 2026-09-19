import {atlasData} from "../data";

const ids=(items:{id:string}[])=>new Set(items.map(x=>x.id));

export function validateAtlasData(){
  const errors:string[]=[];
  const seriesIds=ids(atlasData.series);
  const seasonIds=ids(atlasData.seasons);
  const locationIds=ids(atlasData.locations);
  for(const season of atlasData.seasons) if(!seriesIds.has(season.seriesId)) errors.push(`Season ${season.id} references missing series ${season.seriesId}`);
  for(const location of atlasData.locations) if(!seriesIds.has(location.seriesId)) errors.push(`Location ${location.id} references missing series ${location.seriesId}`);
  for(const event of atlasData.events) if(!seriesIds.has(event.seriesId)) errors.push(`Event ${event.id} references missing series ${event.seriesId}`);
  if(new Set(atlasData.seasons.map(x=>x.id)).size!==atlasData.seasons.length) errors.push("Duplicate season ID detected");
  if(new Set(atlasData.locations.map(x=>x.id)).size!==atlasData.locations.length) errors.push("Duplicate location ID detected");
  if(new Set(atlasData.events.map(x=>x.id)).size!==atlasData.events.length) errors.push("Duplicate event ID detected");
  void seasonIds; void locationIds;
  return errors;
}