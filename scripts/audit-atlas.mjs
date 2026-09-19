import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const read=(name)=>JSON.parse(fs.readFileSync(path.join(root,"data",name),"utf8"));
const episodes=read("episodes.json");
const characterEpisodes=read("characterEpisodes.json");
const locationEpisodes=read("locationEpisodes.json");
const media=read("episodeMedia.json");
const connections=read("connections.json");

const fail=[];
const warn=[];
const ids=(items)=>new Set(items.map(x=>x.id));
const duplicate=(items)=>{const seen=new Set(),dupes=[];for(const x of items){if(seen.has(x.id))dupes.push(x.id);seen.add(x.id)}return dupes};
const episodeIds=ids(episodes);

for(const [name,items] of Object.entries({episodes,connections})){
  const d=duplicate(items);
  if(d.length)fail.push(`Duplicate ${name} IDs: ${d.join(", ")}`);
}

const byCharacter=new Map();
const byLocation=new Map();
for(const e of episodes){
  const start=Number(e.timelineStart??e.timelineEnd);
  const end=Number(e.timelineEnd??e.timelineStart);
  if(Number.isFinite(start)&&Number.isFinite(end)&&end<start)fail.push(`Timeline inversion: ${e.id}`);
  if(!e.seriesId||!e.seasonId)fail.push(`Missing series/season: ${e.id}`);
  for(const id of e.characterIds??[]){if(!byCharacter.has(id))byCharacter.set(id,new Set());byCharacter.get(id).add(e.id)}
  for(const id of e.locationIds??[]){if(!byLocation.has(id))byLocation.set(id,new Set());byLocation.get(id).add(e.id)}
}

for(const [id,list] of Object.entries(characterEpisodes.episodesByCharacter??{})){
  if(new Set(list).size!==list.length)fail.push(`Duplicate character index edges: ${id}`);
  for(const eid of list)if(!episodeIds.has(eid))fail.push(`Stale character index edge: ${id} -> ${eid}`);
}
for(const [id,list] of Object.entries(locationEpisodes.episodesByLocation??{})){
  if(new Set(list).size!==list.length)fail.push(`Duplicate location index edges: ${id}`);
  for(const eid of list)if(!episodeIds.has(eid))fail.push(`Stale location index edge: ${id} -> ${eid}`);
}
for(const [id,set] of byCharacter)for(const eid of set)if(!(characterEpisodes.episodesByCharacter?.[id]??[]).includes(eid))fail.push(`Missing reverse character edge: ${id} -> ${eid}`);
for(const [id,set] of byLocation)for(const eid of set)if(!(locationEpisodes.episodesByLocation?.[id]??[]).includes(eid))fail.push(`Missing reverse location edge: ${id} -> ${eid}`);

const mediaEntries=Object.values(media.episodes??{});
const available=mediaEntries.filter(x=>x?.image).length;
const verified=mediaEntries.filter(x=>x?.status==="verified").length;
const fallback=mediaEntries.filter(x=>x?.status==="fallback").length;
if(available!==episodes.length)fail.push(`Media coverage is ${available}/${episodes.length}`);
if(verified+fallback!==available)warn.push(`Media status accounting is ${verified} verified + ${fallback} fallback vs ${available} available`);

const entityIds=new Set([...episodes.map(x=>x.id),...connections.map(x=>x.id)]);
for(const c of connections){
  if(c.fromId&&!entityIds.has(c.fromId))warn.push(`Connection endpoint may require non-episode entity registry: ${c.id} -> ${c.fromId}`);
  if(c.toId&&!entityIds.has(c.toId))warn.push(`Connection endpoint may require non-episode entity registry: ${c.id} -> ${c.toId}`);
}

console.log(JSON.stringify({
  status:fail.length?"FAIL":"PASS",
  episodes:episodes.length,
  connections:connections.length,
  characterPairs:[...byCharacter.values()].reduce((n,s)=>n+s.size,0),
  locationPairs:[...byLocation.values()].reduce((n,s)=>n+s.size,0),
  media:{available,verified,fallback},
  failures:fail,
  warnings:warn
},null,2));
if(fail.length)process.exitCode=1;