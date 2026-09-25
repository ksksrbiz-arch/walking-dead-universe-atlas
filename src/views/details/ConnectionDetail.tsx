import Icon from "../../components/Icon";
import MiniTimeline from "../../components/MiniTimeline";
import {ActionBar,Chip,EpisodeRow,Hero,Note,PlaceChips,Section,ShowMore,certaintyTone} from "../../components/ui";
import {useAtlas} from "../../lib/atlasContext";
import {atlasData} from "../../data";
import {connectionById,entityName,episodesFor,locationsFor} from "../../lib/lookup";
import {resolveConnectionEndpoint} from "../../lib/entityGraph";
import {connectionTypeLabel,hasMapCoordinates} from "../../lib/atlasHelpers";
import {seriesColor} from "../../lib/series";
import {GraphSection,PortraitImage} from "./shared";

const KIND_ICON={character:"person",location:"pin",community:"people",faction:"flag",series:"film"} as const;

export default function ConnectionDetail({id}:{id:string}){
 const a=useAtlas();
 const c=connectionById.get(id) as any;
 if(!c)return <p className="empty">Connection record not found.</p>;
 const evidence=((atlasData as any).connectionEpisodes?.connections?.[id]??{}) as any;
 const eps=episodesFor(evidence.episodeIds??[]);
 const ends=(["from","to"] as const).map(side=>{const ref=resolveConnectionEndpoint(c,side);return {side,ref,id:side==="from"?c.fromId:c.toId}});
 const places=locationsFor(eps.flatMap(e=>e.locationIds??[]));
 const mapped=places.filter(hasMapCoordinates).length+ends.filter(e=>e.ref?.kind==="location").length;
 const open=(kind:string,eid:string)=>{if(kind==="character")a.openCharacter(eid);else if(kind==="location")a.openLocation(eid);else if(kind==="community")a.openCommunity(eid);else if(kind==="faction")a.openFaction(eid);};
 return <div className="detail">
  <Hero icon="link" accent={seriesColor(eps[0]?.seriesId)} kicker={<>Link · {connectionTypeLabel(c.type)}</>} title={c.label}>
   <div className="chipRow"><Chip tone={certaintyTone(c.certainty)}>{c.certainty}</Chip><Chip>{evidence.evidenceKind==="direct"?"Episode evidence":"Curated evidence"}</Chip></div>
  </Hero>
  <div className="endpoints">
   {ends.map((e,i)=>{const kind=e.ref?.kind;const clickable=kind&&kind!=="series";return <button key={e.side} className="endpoint" disabled={!clickable} onClick={()=>kind&&open(kind,e.id)}>
    {kind==="character"?<PortraitImage id={e.id} name={entityName(e.id,kind)} size="sm"/>:<span className="endpointGlyph"><Icon name={(kind&&KIND_ICON[kind as keyof typeof KIND_ICON])||"link"}/></span>}
    <span className="rowText"><small>{kind||"entity"}</small><b>{entityName(e.id,kind)}</b></span>
    {i===0&&<span className="endpointJoin" aria-hidden="true">↔</span>}
   </button>})}
  </div>
  <ActionBar><button className="btn primary" disabled={!mapped} onClick={()=>a.showConnectionOnMap(id)}><Icon name="map"/>{mapped?"Show both ends on map":"No mapped evidence"}</button></ActionBar>
  {eps.length>0&&<Section title="When it happens"><MiniTimeline items={eps.filter(e=>e.timelineStart!=null||e.timelineEnd!=null).map(e=>({id:e.id,start:Number(e.timelineStart??e.timelineEnd),end:Number(e.timelineEnd??e.timelineStart),title:e.title,color:seriesColor(e.seriesId)}))}/></Section>}
  {eps.length>0&&<Section title="Evidence episodes" count={eps.length}><ShowMore items={eps} limit={5} render={e=><EpisodeRow key={e.id} episode={e}/>}/></Section>}
  {places.length>0&&<Section title="Evidence geography" count={places.length}><PlaceChips locations={places}/></Section>}
  <GraphSection root={"connection:"+id}/>
  <Note icon="link">{evidence.basis||"Part of the atlas relationship registry."} {evidence.sourcePages?.length?`${evidence.sourcePages.length} source page${evidence.sourcePages.length===1?"":"s"} recorded.`:""} Geography is never inferred beyond documented evidence.</Note>
 </div>;
}
