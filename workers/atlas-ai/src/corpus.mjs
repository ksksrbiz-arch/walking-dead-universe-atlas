import characters from "../../../data/characters.json" with {type:"json"};
import locations from "../../../data/locations.json" with {type:"json"};
import episodes from "../../../data/episodes.json" with {type:"json"};
import communities from "../../../data/communities.json" with {type:"json"};
import factions from "../../../data/factions.json" with {type:"json"};
import connections from "../../../data/connections.json" with {type:"json"};
import series from "../../../data/series.json" with {type:"json"};
import sources from "../../../data/sources.json" with {type:"json"};

const groups={character:characters,location:locations,episode:episodes,community:communities,faction:factions,connection:connections,series};
const all=Object.values(groups).flat();
const names=new Map(all.map(x=>[x.id,x.name||x.title||x.label]));
const sourceById=new Map(sources.map(x=>[x.id,x]));
const keys={characterIds:"characters",locationIds:"places",communityIds:"communities",factionIds:"factions",seriesIds:"series"};
export const records=Object.entries(groups).flatMap(([kind,items])=>items.map(item=>{
 const facts={...item};
 // Coordinates and episode co-occurrence do not prove a character's travel route.
 for(const [key,label] of Object.entries(keys))if(item[key])facts[label]=item[key].map(id=>names.get(id)||id);
 if(item.seriesId)facts.series=names.get(item.seriesId)||item.seriesId;
 if(item.fromId)facts.from=names.get(item.fromId)||item.fromId;
 if(item.toId)facts.to=names.get(item.toId)||item.toId;
 const evidence=(item.sources||[]).map(id=>sourceById.get(id)).filter(Boolean);
 if(item.statusSourceUrl)evidence.push({title:"Status source",url:item.statusSourceUrl});
 return {id:item.id,kind,title:item.name||item.title||item.label,facts,evidence};
}));
const STOP=new Set("a an and are as at be can did do does for from how i in is it me of on or please tell the this to was were what when where which who why with about".split(" "));
const words=s=>s.toLowerCase().match(/[a-z0-9]+/g)||[];
export function retrieve(question){
 const terms=[...new Set(words(question).filter(t=>t.length>1&&!STOP.has(t)))];
 if(!terms.length)return [];
 const scored=records.map(record=>{
  const title=words(record.title).join(" ");
  const text=JSON.stringify(record.facts).toLowerCase();
  const score=terms.reduce((n,t)=>n+(title.split(" ").includes(t)?8:text.includes(t)?1:0),0)
   +(question.toLowerCase().includes(record.title.toLowerCase())?20:0);
  return {record,score};
 }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
 // Leave enough room for multiple kinds and supporting episodes.
 const selected=[];let chars=0;
 for(const {record} of scored){
  const size=JSON.stringify(record).length;
  if(chars+size>14000)continue;
  selected.push(record);chars+=size;
  if(selected.length===10)break;
 }
 return selected;
}
export const corpusVersion=typeof ATLAS_DATA_REVISION==="string"?ATLAS_DATA_REVISION:"local";


