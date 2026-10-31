import fs from 'node:fs';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');
const es=read('data/episodes.json'),ls=read('data/locations.json'),ss=read('data/sources.json');
for(const [key,title,url] of [
 ['greenwood','Greenwood','https://walkingdead.fandom.com/wiki/Greenwood'],
 ['yellowstone','Yellowstone National Park','https://walkingdead.fandom.com/wiki/Yellowstone_National_Park'],
 ['cascadia','Cascadia Forward Operating Base','https://walkingdead.fandom.com/wiki/Cascadia_Forward_Operating_Base'],
 ['become','Become episode and cast guide','https://walkingdead.fandom.com/wiki/Become'],
 ['finale','The Last Time episode and cast guide','https://walkingdead.fandom.com/wiki/The_Last_Time']
])ss.push({id:'source-fandom-owl-'+key,title:'Walking Dead Wiki — '+title,type:'episode-location-evidence',url,note:'Episode appearance evidence reviewed 2026-10-01; appearances in archive footage or separate scenes do not establish travel to the episode’s main setting.'});
for(const [id,name,type,sid,note] of [
 ['greenwood','Greenwood','safe-zone','greenwood','Fictional high-rise settlement in Wyoming. Exact geographic coordinates are unverified.'],
 ['yellowstone','Yellowstone National Park','park','yellowstone','The episode establishes the park, not a precise scene coordinate within its large area.'],
 ['cascadia-fob','Cascadia Forward Operating Base','military-base','cascadia','A former college in the Cascades. Its precise location and state are unverified.']
])ls.push({id,name,seriesId:'owl',year:2022,type,lat:0,lng:0,certainty:'unknown',sources:['source-fandom-owl-'+sid],note});
const ep=n=>es.find(e=>e.id==='owl-s01-e0'+n);
for(const n of [1,3]){ep(n).locationIds.push('cascadia-fob');ep(n).sources.push('source-fandom-owl-cascadia');}
ep(4).locationIds=['greenwood'];ep(4).sources.push('source-fandom-owl-greenwood');
ep(5).locationIds=['yellowstone'];ep(5).sources.push('source-fandom-owl-yellowstone','source-fandom-owl-become');
ep(5).appearanceTypes={'jennifer-mallick':'archive'};
ep(5).characterLocationIds={'gabriel-stokes':[]};
ep(5).appearanceNote='Jennifer appears in archive footage. Gabriel’s separate scenes and flashbacks do not establish his presence in Yellowstone; no travel there is inferred.';
ep(6).locationIds=['cascadia-fob'];ep(6).sources.push('source-fandom-owl-cascadia','source-fandom-owl-finale');
ep(6).characterIds=[...new Set([...ep(6).characterIds,'jonathan-beale','pearl-thorne'])];
ep(6).appearanceTypes={'jadis-stokes':'flashback','samuel-abbott':'archive'};
ep(6).characterLocationIds={'judith-grimes':[]};
ep(6).appearanceNote='Jadis appears in a flashback and Samuel in archive footage. Judith appears in the later family reunion, not at Cascadia. These appearances do not establish travel to the base.';
write('data/episodes.json',es);write('data/locations.json',ls);write('data/sources.json',ss);
const reviewed=new Set([1,3,4,5,6].map(n=>ep(n).id));
const li=read('data/locationEpisodes.json');
for(const ids of Object.values(li.episodesByLocation))for(let i=ids.length-1;i>=0;i--)if(reviewed.has(ids[i]))ids.splice(i,1);
for(const e of es.filter(e=>reviewed.has(e.id)))for(const id of e.locationIds)(li.episodesByLocation[id]??=[]).push(e.id);
write('data/locationEpisodes.json',li);
const ci=read('data/characterEpisodes.json');
for(const id of ep(6).characterIds){const list=ci.episodesByCharacter[id]??=[];if(!list.includes(ep(6).id))list.push(ep(6).id);}
ci.updatedAt='2026-10-01';write('data/characterEpisodes.json',ci);
