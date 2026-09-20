import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const read=(name)=>JSON.parse(fs.readFileSync(path.join(root,"data",name),"utf8"));
const episodes=read("episodes.json");
const series=read("series.json");
const seasons=read("seasons.json");
const seasonMeta=read("seasonMeta.json");
const locations=read("locations.json");
const characters=read("characters.json");
const communities=read("communities.json");
const factions=read("factions.json");
const events=read("events.json");
const universeEvents=read("universeEvents.json");
const webisodes=read("webisodes.json");
const watchOrder=read("watchOrder.json");
const characterEpisodes=read("characterEpisodes.json");
const locationEpisodes=read("locationEpisodes.json");
const media=read("episodeMedia.json");
const connections=read("connections.json");
const connectionEpisodes=read("connectionEpisodes.json");

const fail=[]; const warn=[]; const info=[];
const duplicate=(items)=>{const seen=new Set(),dupes=[];for(const x of items){if(seen.has(x.id))dupes.push(x.id);seen.add(x.id)}return [...new Set(dupes)]};
const ids=(items)=>new Set(items.map(x=>x.id));
const entityGroups={series,seasons,episodes,locations,characters,communities,factions,connections};
const sets=Object.fromEntries(Object.entries(entityGroups).map(([k,v])=>[k,ids(v)]));
const allEntityRefs=new Set(Object.values(entityGroups).flat().map(x=>x.id));
const episodeIds=sets.episodes;
const seasonById=new Map(seasons.map(x=>[x.id,x]));

for(const [name,items] of Object.entries(entityGroups)){const d=duplicate(items);if(d.length)fail.push(`Duplicate ${name} IDs: ${d.join(", ")}`)}
const collisions=new Map();
for(const [kind,items] of Object.entries(entityGroups))for(const x of items){if(!collisions.has(x.id))collisions.set(x.id,[]);collisions.get(x.id).push(kind)}
const ambiguous=[...collisions.entries()].filter(([,kinds])=>new Set(kinds).size>1);
if(ambiguous.length)warn.push(`Cross-kind entity ID collisions require typed endpoints: ${ambiguous.map(([id,kinds])=>`${id}(${[...new Set(kinds)].join("/")})`).join(", ")}`);

const reverseCharacter=new Map(); const reverseLocation=new Map();
for(const e of episodes){
  if(!sets.series.has(e.seriesId))fail.push(`Episode ${e.id}: missing series ${e.seriesId}`);
  if(!sets.seasons.has(e.seasonId))fail.push(`Episode ${e.id}: missing season ${e.seasonId}`);
  else if(seasonById.get(e.seasonId).seriesId!==e.seriesId)fail.push(`Episode ${e.id}: season ${e.seasonId} belongs to ${seasonById.get(e.seasonId).seriesId}, not ${e.seriesId}`);
  if(!e.title?.trim())fail.push(`Episode ${e.id}: missing title`);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(e.airDate||""))fail.push(`Episode ${e.id}: invalid airDate ${e.airDate}`);
  const start=Number(e.timelineStart??e.timelineEnd), end=Number(e.timelineEnd??e.timelineStart);
  if(!Number.isFinite(start)||!Number.isFinite(end))fail.push(`Episode ${e.id}: missing timeline bounds`);
  else if(end<start)fail.push(`Episode ${e.id}: timeline inversion`);
  for(const [field,set,label] of [["characterIds",sets.characters,"character"],["locationIds",sets.locations,"location"],["communityIds",sets.communities,"community"],["factionIds",sets.factions,"faction"],["connectionIds",sets.connections,"connection"]]){
    const list=e[field]??[]; const d=duplicate(list.map(id=>({id})));
    if(d.length)fail.push(`Episode ${e.id}: duplicate ${label} IDs ${d.join(", ")}`);
    for(const id of list)if(!set.has(id))fail.push(`Episode ${e.id}: unknown ${label} ${id}`);
  }
  for(const id of e.characterIds??[]){if(!reverseCharacter.has(id))reverseCharacter.set(id,new Set());reverseCharacter.get(id).add(e.id)}
  for(const id of e.locationIds??[]){if(!reverseLocation.has(id))reverseLocation.set(id,new Set());reverseLocation.get(id).add(e.id)}
}

for(const s of seasons){if(!sets.series.has(s.seriesId))fail.push(`Season ${s.id}: missing series ${s.seriesId}`);if(!Number.isInteger(s.season)||s.season<1)fail.push(`Season ${s.id}: invalid season number`)}
const metaBySeason=new Map(seasonMeta.map(x=>[x.seasonId,x]));
for(const meta of seasonMeta){
  if(!sets.seasons.has(meta.seasonId))fail.push(`Season meta references missing season ${meta.seasonId}`);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(meta.airStart||"")||!/^\d{4}-\d{2}-\d{2}$/.test(meta.airEnd||""))fail.push(`Season meta ${meta.seasonId}: invalid air range`);
  if(meta.airEnd<meta.airStart)fail.push(`Season meta ${meta.seasonId}: inverted air range`);
  const actual=episodes.filter(e=>e.seasonId===meta.seasonId);
  if(actual.length&&actual.length!==meta.episodeCount)fail.push(`Season meta ${meta.seasonId}: episodeCount ${meta.episodeCount} vs actual ${actual.length}`);
  if(actual.length){const dates=actual.map(e=>e.airDate).sort();if(dates[0]!==meta.airStart||dates.at(-1)!==meta.airEnd)fail.push(`Season meta ${meta.seasonId}: air range ${meta.airStart}..${meta.airEnd} vs episode registry ${dates[0]}..${dates.at(-1)}`)}
}
const episodeBySeason=new Map();
for(const e of episodes){if(!episodeBySeason.has(e.seasonId))episodeBySeason.set(e.seasonId,[]);episodeBySeason.get(e.seasonId).push(e)}
for(const [seasonId,list] of episodeBySeason){const sorted=[...list].sort((a,b)=>a.episodeNumber-b.episodeNumber);const nums=sorted.map(e=>e.episodeNumber);const d=duplicate(nums.map(n=>({id:String(n)})));if(d.length)fail.push(`Season ${seasonId}: duplicate episode numbers ${d.join(", ")}`);for(let i=1;i<sorted.length;i++)if(sorted[i].airDate<sorted[i-1].airDate)fail.push(`Season ${seasonId}: air-date inversion ${sorted[i-1].id} -> ${sorted[i].id}`)}

for(const c of characters){
  for(const sid of c.seriesIds??[])if(!sets.series.has(sid))fail.push(`Character ${c.id}: unknown series ${sid}`);
  const actualEpisodes=episodes.filter(e=>(e.characterIds??[]).includes(c.id));
  const actualSeries=new Set(actualEpisodes.map(e=>e.seriesId));
  const missingSeries=[...actualSeries].filter(s=>!(c.seriesIds??[]).includes(s));
  const unusedSeries=(c.seriesIds??[]).filter(s=>!actualSeries.has(s));
  if(missingSeries.length)fail.push(`Character ${c.id}: episode data uses undeclared series ${missingSeries.join(", ")}`);
  if(unusedSeries.length)warn.push(`Character ${c.id}: declared series without episode presence ${unusedSeries.join(", ")}`);
  if(Number.isInteger(c.episodeCount)&&c.episodeCount!==actualEpisodes.length)fail.push(`Character ${c.id}: declared episodeCount ${c.episodeCount} vs episode registry ${actualEpisodes.length}`);
}
for(const l of locations){if(!sets.series.has(l.seriesId))fail.push(`Location ${l.id}: unknown series ${l.seriesId}`);if(!Number.isFinite(Number(l.lat))||!Number.isFinite(Number(l.lng)))fail.push(`Location ${l.id}: invalid coordinates`);if(Number(l.lat)<-90||Number(l.lat)>90||Number(l.lng)<-180||Number(l.lng)>180)fail.push(`Location ${l.id}: coordinates out of range`)}
for(const [id,set] of reverseCharacter)for(const eid of set)if(!(characterEpisodes.episodesByCharacter?.[id]??[]).includes(eid))fail.push(`Missing reverse character edge ${id} -> ${eid}`);
for(const [id,set] of reverseLocation)for(const eid of set)if(!(locationEpisodes.episodesByLocation?.[id]??[]).includes(eid))fail.push(`Missing reverse location edge ${id} -> ${eid}`);
for(const [id,list] of Object.entries(characterEpisodes.episodesByCharacter??{})){if(!sets.characters.has(id))fail.push(`Character index references unknown character ${id}`);const d=duplicate(list.map(eid=>({id:eid})));if(d.length)fail.push(`Character index ${id}: duplicate episode IDs ${d.join(", ")}`);for(const eid of list)if(!episodeIds.has(eid))fail.push(`Character index ${id}: stale episode ${eid}`)}
for(const [id,list] of Object.entries(locationEpisodes.episodesByLocation??{})){if(!sets.locations.has(id))fail.push(`Location index references unknown location ${id}`);const d=duplicate(list.map(eid=>({id:eid})));if(d.length)fail.push(`Location index ${id}: duplicate episode IDs ${d.join(", ")}`);for(const eid of list)if(!episodeIds.has(eid))fail.push(`Location index ${id}: stale episode ${eid}`);for(const eid of list)if(!reverseLocation.get(id)?.has(eid))warn.push(`Location index ${id} includes curated historical association ${eid}`)}

const endpointKinds={
  "character-faction":["character","faction"],"character-location":["character","location"],"character-character":["character","character"],"character-community":["character","community"],"community-community":["community","community"],
  "community-faction":["community","faction"],"faction-community":["faction","community"],"community-series":["community","series"],"faction-series":["faction","series"],"cross-series":["character","series"],"lore":["character","series"]
};
for(const c of connections){
  if(c.fromId===c.toId)fail.push(`Connection ${c.id}: self-reference`);
  if(!c.label?.trim())fail.push(`Connection ${c.id}: missing label`);
  const expected=endpointKinds[c.type];
  if(expected){
    if(!sets[expected[0]].has(c.fromId))fail.push(`Connection ${c.id}: fromId ${c.fromId} is not a ${expected[0]} for type ${c.type}`);
    if(!sets[expected[1]].has(c.toId))fail.push(`Connection ${c.id}: toId ${c.toId} is not a ${expected[1]} for type ${c.type}`);
  }else{
    if(!allEntityRefs.has(c.fromId))fail.push(`Connection ${c.id}: unknown fromId ${c.fromId}`);
    if(!allEntityRefs.has(c.toId))fail.push(`Connection ${c.id}: unknown toId ${c.toId}`);
    warn.push(`Connection ${c.id}: untyped endpoint semantics for ${c.type}`);
  }
}
const curated=connectionEpisodes.connections??{};
for(const [id,evidence] of Object.entries(curated)){
  if(!sets.connections.has(id))fail.push(`Connection evidence references missing connection ${id}`);
  const list=evidence.episodeIds??[];const d=duplicate(list.map(eid=>({id:eid})));if(d.length)fail.push(`Connection evidence ${id}: duplicate episode IDs ${d.join(", ")}`);
  for(const eid of list)if(!episodeIds.has(eid))fail.push(`Connection evidence ${id}: missing episode ${eid}`);
  if(!["direct","co-presence","curated-context"].includes(evidence.evidenceKind))fail.push(`Connection evidence ${id}: invalid evidenceKind ${evidence.evidenceKind}`);
  if(!evidence.basis?.trim())fail.push(`Connection evidence ${id}: missing basis`);
}
const unresolved=connections.filter(c=>!curated[c.id]).map(c=>c.id);if(unresolved.length)fail.push(`Connections without curated episode evidence: ${unresolved.join(", ")}`);

const mediaMap=media.episodes??{};const mediaKeys=Object.keys(mediaMap);const available=mediaKeys.filter(id=>mediaMap[id]?.image).length;const verified=mediaKeys.filter(id=>mediaMap[id]?.status==="verified").length;const fallback=mediaKeys.filter(id=>mediaMap[id]?.status==="fallback").length;
if(available!==episodes.length)fail.push(`Media coverage is ${available}/${episodes.length}`);
for(const id of episodes.map(e=>e.id))if(!mediaMap[id])fail.push(`Missing media entry ${id}`);
for(const id of mediaKeys)if(!episodeIds.has(id))fail.push(`Media entry references unknown episode ${id}`);
if(verified+fallback!==available)fail.push(`Media status accounting is ${verified} verified + ${fallback} fallback vs ${available} available`);
for(const [id,m] of Object.entries(mediaMap)){if(m.status==="fallback"&&m.fallbackForEpisode!==true)fail.push(`Media ${id}: fallback missing fallbackForEpisode=true`);if(m.status==="verified"&&m.kind==="series-key-art-fallback")fail.push(`Media ${id}: verified entry marked as fallback`)}

for(const e of events){if(!sets.series.has(e.seriesId))fail.push(`Event ${e.id}: missing series ${e.seriesId}`);if(!Number.isInteger(e.year))fail.push(`Event ${e.id}: invalid year`)}
for(const e of universeEvents){if(!sets.series.has(e.seriesId))fail.push(`Universe event ${e.id}: missing series ${e.seriesId}`);if(!Number.isInteger(e.year))fail.push(`Universe event ${e.id}: invalid year`);if(e.date&&(!/^\d{4}-\d{2}-\d{2}$/.test(e.date)||Number(e.date.slice(0,4))!==e.year))fail.push(`Universe event ${e.id}: date/year mismatch`)}
for(const w of watchOrder){if(w.seriesId&&!sets.series.has(w.seriesId))fail.push(`Watch order ${w.id}: unknown series ${w.seriesId}`);if(w.seriesId&&w.startSeason>w.endSeason)fail.push(`Watch order ${w.id}: inverted season range`);if(w.seriesId&&(!Number.isInteger(w.startSeason)||!Number.isInteger(w.endSeason)))fail.push(`Watch order ${w.id}: invalid season range`)}
for(const w of webisodes.series??[]){if(!sets.series.has(w.seriesId))fail.push(`Webisode ${w.id}: unknown series ${w.seriesId}`);if(!Number.isInteger(w.episodeCount)||w.episodeCount<1)fail.push(`Webisode ${w.id}: invalid episodeCount`)}
const webTotal=(webisodes.series??[]).reduce((n,x)=>n+x.episodeCount,0);if(Number.isInteger(webisodes.totalEpisodes)&&webTotal!==webisodes.totalEpisodes)fail.push(`Webisode total ${webisodes.totalEpisodes} vs series sum ${webTotal}`);

info.push(`Episodes: ${episodes.length}; series: ${series.length}; seasons: ${seasons.length}; locations: ${locations.length}; characters: ${characters.length}; communities: ${communities.length}; factions: ${factions.length}; connections: ${connections.length}`);
info.push(`Episode references: ${episodes.reduce((n,e)=>n+(e.characterIds??[]).length,0)} character, ${episodes.reduce((n,e)=>n+(e.locationIds??[]).length,0)} location, ${episodes.reduce((n,e)=>n+(e.communityIds??[]).length,0)} community, ${episodes.reduce((n,e)=>n+(e.factionIds??[]).length,0)} faction, ${episodes.reduce((n,e)=>n+(e.connectionIds??[]).length,0)} connection`);
info.push(`Connection evidence: ${Object.keys(curated).length}/${connections.length}; unresolved: ${unresolved.join(", ")||"none"}`);
info.push(`Media: ${available}/${episodes.length} available; ${verified} verified; ${fallback} fallback`);
info.push(`Cross-kind ID collisions: ${ambiguous.length}`);

console.log(JSON.stringify({status:fail.length?"FAIL":"PASS",failures:fail,warnings:warn,info},null,2));
if(fail.length)process.exitCode=1;