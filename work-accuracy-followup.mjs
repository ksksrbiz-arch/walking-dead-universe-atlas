import fs from 'node:fs';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');
const sources=read('data/sources.json');
for(const [id,title,type,url,note] of [
 ['source-fandom-tv-timeline','Walking Dead Wiki — TV Series Timeline','chronology','https://walkingdead.fandom.com/wiki/TV_Series_Timeline','Fan-maintained calendar reviewed 2026-10-01. Supports the 2014 / 2020 / 2021 season-nine split and approximately 2021 for season ten and the first twelve episodes of season eleven. Exact calendar dates differ between fan interpretations.'],
 ['source-fandom-daryl-timeline','Walking Dead Wiki — Daryl Series Timeline','chronology','https://walkingdead.fandom.com/wiki/Daryl_Series_Timeline','Fan-maintained main-story chronology beginning approximately 2023; earlier scenes are flashbacks. Reviewed alongside Chronological Episode Order for seasons one through three on 2026-10-01.'],
 ['source-amcplus-dead-episodes','AMC+ — Dead City episodes','episode-index','https://www.amcplus.com/shows/the-walking-dead-dead-city/episodes--1075269','Official episode listings establish release information, not an in-universe calendar year. Checked 2026-10-01.']
])if(!sources.some(s=>s.id===id))sources.push({id,title,type,url,note});
const bySource=new Map(sources.map(s=>[s.id,s]));
const episodes=read('data/episodes.json');
const pending=episodes.filter(e=>e.certainty==='confirmed'&&!e.sources.some(id=>bySource.get(id)?.type==='chronology'));
if(pending.length!==83)throw Error('Review scope changed');
for(const e of pending){
 e.chronologyCheckedAt='2026-10-01';e.chronologyBasis='main-story';
 if(e.seasonId==='dead-s03'){
  e.timelineStart=null;e.timelineEnd=null;e.timelinePrecision='unknown';e.certainty='unknown';
  e.chronologySources=[];e.chronologyNote='The episode listing and broadcast date are known. A reliable main-story year has not been established in the reviewed sources, so this episode remains undated. Its release year does not determine its story year.';
  e.sources=[...new Set([...e.sources,'source-amcplus-dead-episodes'])];continue;
 }
 e.certainty='approximate';e.chronologySources=['source-fandom-episode-order'];
 if(e.seriesId==='twd')e.chronologySources.push('source-fandom-tv-timeline');
 if(e.seriesId==='daryl')e.chronologySources.push('source-fandom-daryl-timeline');
 if(e.seriesId==='dead')e.chronologySources.push('source-fandom-dead-timeline');
 e.sources=[...new Set([...e.sources,...e.chronologySources])];
}
episodes.find(e=>e.id==='twd-s09-e05').chronologyNote='The bridge story is approximately 2014. The closing six-year jump introduces the later story around 2020; the episode is placed by the bridge story it concludes.';
episodes.find(e=>e.id==='twd-s09-e14').chronologyNote='Main story: approximately 2020. Michonne’s earlier encounter with Jocelyn is a flashback around 2014.';
episodes.find(e=>e.id==='twd-s10-e18').chronologyNote='Main story: approximately 2021. Daryl’s years searching for Rick and his earlier relationship with Leah are flashbacks.';
episodes.find(e=>e.id==='twd-s10-e22').chronologyNote='Main story: approximately 2021. Negan and Lucille’s earlier life and the origins of his bat are flashbacks.';
write('data/episodes.json',episodes);write('data/sources.json',sources);
const meta=read('data/seasonMeta.json');
for(const s of meta){
 const es=episodes.filter(e=>e.seasonId===s.seasonId);
 if(es.every(e=>e.chronologyCheckedAt==='2026-10-01')){
  s.chronologyStatus=es.every(e=>e.timelinePrecision==='unknown')?'story chronology unverified; release listings retained':'reviewed approximate main-story years; flashbacks and epilogues explained separately';
  s.chronologyCheckedAt='2026-10-01';
 }
}
write('data/seasonMeta.json',meta);
