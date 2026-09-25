import {useMemo} from "react";
import MiniTimeline from "../../components/MiniTimeline";
import {Chip,EpisodeRow,Hero,Note,PlaceChips,Section,ShowMore,Stats,certaintyTone} from "../../components/ui";
import {atlasData} from "../../data";
import {characterById,communityById,episodesFor,factionById,locationsFor} from "../../lib/lookup";
import {getGroupEpisodeIds} from "../../lib/entityGraph";
import {prettyType} from "../../lib/atlasHelpers";
import {seriesColor} from "../../lib/series";
import {ConnectionList,GraphSection,PortraitStrip} from "./shared";

export default function GroupDetail({kind,id}:{kind:"community"|"faction";id:string}){
 const group=(kind==="community"?communityById:factionById).get(id) as any;
 const eps=useMemo(()=>episodesFor(getGroupEpisodeIds(kind,id)),[kind,id]);
 const members=useMemo(()=>{
  const counts=new Map<string,number>();
  for(const e of eps)for(const c of e.characterIds??[])counts.set(c,(counts.get(c)??0)+1);
  return [...counts.entries()].sort((a,b)=>b[1]-a[1]).map(([cid,count])=>({...(characterById.get(cid) as any),count})).filter(c=>c.id);
 },[eps]);
 if(!group)return <p className="empty">{kind==="community"?"Community":"Faction"} record not found.</p>;
 const territory=locationsFor(eps.flatMap(e=>e.locationIds??[]));
 const links=(atlasData.connections as any[]).filter(c=>c.fromId===id||c.toId===id).map(c=>c.id);
 const accent=seriesColor(eps[0]?.seriesId);
 return <div className="detail">
  <Hero accent={accent} icon={kind==="community"?"people":"flag"} kicker={<>{kind==="community"?"Community":"Faction"}{group.type?" · "+prettyType(group.type):""}</>} title={group.name}>
   <div className="chipRow"><Chip tone={certaintyTone(group.certainty)}>{group.certainty}</Chip></div>
  </Hero>
  <Stats items={[{label:"Episodes",value:eps.length},{label:"Members",value:members.length},{label:"Territory",value:territory.length},{label:"Links",value:links.length}]}/>
  {eps.length>0&&<Section title="On the timeline"><MiniTimeline items={eps.filter(e=>e.timelineStart!=null||e.timelineEnd!=null).map(e=>({id:e.id,start:Number(e.timelineStart??e.timelineEnd),end:Number(e.timelineEnd??e.timelineStart),title:e.title,color:seriesColor(e.seriesId)}))}/></Section>}
  {members.length>0&&<Section title="Members" count={members.length}><PortraitStrip characters={members.slice(0,24)}/></Section>}
  {territory.length>0&&<Section title="Territory" count={territory.length}><PlaceChips locations={territory}/></Section>}
  {eps.length>0&&<Section title="Episodes" count={eps.length}><ShowMore items={eps} limit={5} render={e=><EpisodeRow key={e.id} episode={e}/>}/></Section>}
  <ConnectionList ids={links} perspective={id}/>
  {!eps.length&&!links.length&&<p className="empty">No episode geography or documented links recorded for this {kind} yet.</p>}
  <GraphSection root={kind+":"+id}/>
  <Note>Membership and territory are derived from documented episode records, not authored history.</Note>
 </div>;
}
