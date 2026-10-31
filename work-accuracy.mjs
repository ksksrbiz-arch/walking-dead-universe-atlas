import fs from 'node:fs';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');
const sources=read('data/sources.json');
for(const [id,title,url] of [
 ['source-fandom-episode-order','Walking Dead Wiki — Chronological Episode Order','https://walkingdead.fandom.com/wiki/Chronological_Episode_Order'],
 ['source-fandom-owl-timeline','Walking Dead Wiki — The Ones Who Live Timeline','https://walkingdead.fandom.com/wiki/The_Ones_Who_Live_Timeline'],
 ['source-fandom-dead-timeline','Walking Dead Wiki — Dead City Timeline','https://walkingdead.fandom.com/wiki/Dead_City_Timeline']
])sources.push({id,title,type:'chronology',url,note:'Fan-maintained chronology checked 2026-10-01. Calendar years are inferred, not confirmed on-screen dates. Episode order follows the main forward narrative rather than the earliest flashback.'});
sources.find(s=>s.id==='source-timelinetwd-owl').note+=' Its precise calendar interpretation differs from Walking Dead Wiki; the atlas retains approximate years rather than treating those day-level dates as confirmed.';
write('data/sources.json',sources);
const episodes=read('data/episodes.json');
const block=[...episodes.filter(e=>e.seasonId==='ftwd-s08'),...episodes.filter(e=>e.seasonId==='twd-s11'&&e.episodeNumber>=13),...episodes.filter(e=>e.seriesId==='owl')];
if(block.length!==30)throw Error('Unexpected 2022 episode count '+block.length);
const notes=[
 'Main story: approximately 2022. The opening revisits Rick’s captivity around 2019, five years after the bridge; those earlier scenes do not place this whole episode in 2014.',
 'Main story: approximately 2022. Michonne’s journey includes earlier events around 2021 and an extended recovery before her reunion with Rick.',
 'Main story: approximately 2022, continuing the reunion and CRM story.',
 'Main story: approximately 2022, continuing Rick and Michonne’s escape.',
 'Main story: approximately 2022. Jadis and Gabriel’s earlier meetings are flashbacks, not the episode’s main placement.',
 'Main story: approximately 2022. The later family reunion belongs to the following year in the fan timeline; it is an epilogue rather than the start of this episode.'
];
for(const [i,e] of block.entries()){
 e.timelineStart=2022;e.timelineEnd=2022;e.timelinePrecision='year';e.certainty='approximate';
 e.chronologyOrder=300+i;e.chronologyBasis='main-story';e.chronologyCheckedAt='2026-10-01';
 e.chronologySources=['source-fandom-episode-order'];
 if(e.seriesId==='owl'){e.chronologySources.push('source-fandom-owl-timeline');e.chronologyNote=notes[e.episodeNumber-1];}
 if(e.id==='twd-s11-e24')e.chronologyNote='Main story: approximately 2022. The one-year-later epilogue is placed in 2023; this episode is ordered by the Commonwealth story it concludes.';
 e.sources=[...new Set([...e.sources,...e.chronologySources])];
}
for(const e of episodes.filter(e=>e.seasonId==='dead-s02')){
 e.timelineStart=2028;e.timelineEnd=2028;e.timelinePrecision='year';e.certainty='approximate';
 e.chronologyBasis='main-story';e.chronologyCheckedAt='2026-10-01';e.chronologySources=['source-fandom-dead-timeline','source-fandom-episode-order'];
 e.sources=[...new Set([...e.sources,...e.chronologySources])];
}
write('data/episodes.json',episodes);
const watch=read('data/watchOrder.json');
for(const e of watch.filter(e=>e.seriesId==='owl')){e.basis='Main story approximately 2022; earlier captivity and journey scenes are flashbacks, with a later family-reunion epilogue. Fan-maintained chronology.';e.certainty='approximate';}
write('data/watchOrder.json',watch);
