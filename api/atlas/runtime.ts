import series from "../../data/series.json";
import seasons from "../../data/seasons.json";
import episodes from "../../data/episodes.json";
import locations from "../../data/locations.json";
import characters from "../../data/characters.json";
import communities from "../../data/communities.json";
import factions from "../../data/factions.json";
import connections from "../../data/connections.json";
import characterEpisodes from "../../data/characterEpisodes.json";
import locationEpisodes from "../../data/locationEpisodes.json";
import connectionEpisodes from "../../data/connectionEpisodes.json";
import media from "../../data/media.json";
import episodeMedia from "../../data/episodeMedia.json";

type RecordLike={id:string;[key:string]:unknown};
const records=(value:unknown):RecordLike[]=>Array.isArray(value)?value as RecordLike[]:[];
const indexBy=(items:RecordLike[],field:string)=>{const out:Record<string,string[]>={};for(const item of items){const value=item[field];if(typeof value==="string"&&value)(out[value]??=[]).push(item.id)}return out};
const indexByArray=(items:RecordLike[],field:string)=>{const out:Record<string,string[]>={};for(const item of items){const values=item[field];if(!Array.isArray(values))continue;for(const value of values){if(typeof value==="string"&&value)(out[value]??=[]).push(item.id)}}return out};

const episodeRecords=records(episodes);
const locationRecords=records(locations);
const characterRecords=records(characters);
const communityRecords=records(communities);
const factionRecords=records(factions);
const connectionRecords=records(connections);

const indexes={
  episodesBySeries:indexBy(episodeRecords,"seriesId"),
  episodesBySeason:indexBy(episodeRecords,"seasonId"),
  episodesByLocation:indexByArray(episodeRecords,"locationIds"),
  episodesByCharacter:indexByArray(episodeRecords,"characterIds"),
  episodesByCommunity:indexByArray(episodeRecords,"communityIds"),
  episodesByFaction:indexByArray(episodeRecords,"factionIds"),
  episodesByConnection:indexByArray(episodeRecords,"connectionIds"),
  charactersByEpisode:indexByArray(characterRecords,"episodeIds"),
  locationsByEpisode:indexByArray(locationRecords,"episodeIds"),
};

const collections:Record<string,unknown>={series,seasons,episodes,locations,characters,communities,factions,connections};
const curated:any={characterEpisodes,locationEpisodes,connectionEpisodes};
const manifest={
  version:"5-vercel",
  generatedAt:"build",
  counts:Object.fromEntries(Object.entries(collections).map(([key,value])=>[key,records(value).length])),
  indexes,
  curated,
  media:{episodeMedia,media},
};

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{
  "content-type":"application/json; charset=utf-8",
  "cache-control":"public, max-age=60, s-maxage=300, stale-while-revalidate=3600",
  "x-atlas-runtime-version":"5-vercel",
}});

export default async function handler(req:Request){
  if(req.method!=="GET")return json({error:"Method not allowed."},405);
  try{
    const url=new URL(req.url, `https://${req.headers.get("host") || "localhost"}`);
    const resource=url.searchParams.get("resource")??"meta";
    const kind=url.searchParams.get("kind");
    const id=url.searchParams.get("id");
    if(resource==="meta")return json({version:manifest.version,generatedAt:manifest.generatedAt,counts:manifest.counts});
    if(resource==="manifest")return json(manifest);
    if(resource==="collection"&&kind){
      const collection=collections[kind];
      return collection?json({kind,items:collection}):json({error:"Unknown collection."},404);
    }
    if(resource==="entity"&&kind&&id){
      const collection=collections[kind];
      if(!Array.isArray(collection))return json({error:"Unknown collection."},404);
      const entity=records(collection).find(item=>item.id===id);
      return entity?json({kind,entity}):json({error:"Entity not found."},404);
    }
    if(resource==="index"){
      const name=url.searchParams.get("name");
      const index=name?(indexes as Record<string,Record<string,string[]>>)[name]:undefined;
      if(!name||!index)return json({error:"Unknown index."},404);
      return json({name,ids:Object.values(index).flat()});
    }
    if(resource==="relationships"&&kind&&id){
      const map:Record<string,string[]>={
        character:["episodesByCharacter"],location:["episodesByLocation"],community:["episodesByCommunity"],
        faction:["episodesByFaction"],connection:["episodesByConnection"],series:["episodesBySeries"],season:["episodesBySeason"]
      };
      const episodeIds=new Set<string>();
      for(const name of map[kind]??[])for(const episodeId of (indexes as any)[name]?.[id]??[])episodeIds.add(episodeId);
      if(kind==="character")for(const episodeId of curated.characterEpisodes?.episodesByCharacter?.[id]??[])episodeIds.add(episodeId);
      if(kind==="location")for(const episodeId of curated.locationEpisodes?.episodesByLocation?.[id]??[])episodeIds.add(episodeId);
      return json({kind,id,episodeIds:[...episodeIds]});
    }
    return json({error:"Unknown resource."},400);
  }catch(error){return json({error:"Atlas runtime unavailable.",detail:error instanceof Error?error.message:String(error)},500)}
}
