import fs from 'node:fs';
const es=JSON.parse(fs.readFileSync('data/episodes.json'));
const cs=JSON.parse(fs.readFileSync('data/characters.json'));
for(const c of cs.filter(c=>['pearl-thorne','jonathan-beale'].includes(c.id)))c.episodeCount=es.filter(e=>e.characterIds.includes(c.id)).length;
fs.writeFileSync('data/characters.json',JSON.stringify(cs,null,2)+'\n');
