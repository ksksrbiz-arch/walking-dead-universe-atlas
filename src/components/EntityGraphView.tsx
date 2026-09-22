import {useEffect,useMemo,useState} from "react";
import {atlasData} from "../data";
import {entityGraph as graph} from "../lib/entityGraph";
import AtlasIcon,{type AtlasIconName} from "./AtlasIcon";

type Props={
 onCharacter:(id:string)=>void;
 onLocation:(id:string)=>void;
 onEpisode?:(id:string)=>void;
 onConnection?:(id:string)=>void;
 onCommunity?:(id:string)=>void;
 onFaction?:(id:string)=>void;
 defaultCollapsed?:boolean;
 root?:string;
 heading?:string;
};
type Filter="ALL"|"character"|"location"|"community"|"faction"|"series"|"episode"|"connection";

const labels:Record<string,string>={
 character:"PEOPLE",location:"PLACES",community:"COMMUNITIES",faction:"FACTIONS",
 series:"SERIES",episode:"EPISODES",connection:"LINKS"
};

function labelFor(kind:string,id:string){
 const pools:any={
  episode:atlasData.episodes,location:atlasData.locations,character:atlasData.characters,
  community:atlasData.communities,faction:atlasData.factions,series:atlasData.series,connection:atlasData.connections
 };
 const item=pools[kind]?.find((x:any)=>x.id===id);
 if(kind==="episode")return item?.title||id;
 return item?.name||item?.title||item?.label||id;
}

function iconForKind(kind:string):AtlasIconName{
 if(kind==="character")return "character";
 if(kind==="location")return "location-link";
 if(kind==="community")return "community";
 if(kind==="faction")return "faction";
 if(kind==="series")return "series";
 if(kind==="episode")return "episode";
 return "connection";
}
function iconForEdge(type:string):AtlasIconName{
 if(type==="cross-series")return "cross-series";
 if(type.includes("character-character"))return "character-link";
 if(type.includes("character-location"))return "location-link";
 if(type==="lore")return "lore";
 if(type.includes("community")||type.includes("EPISODE_CONTEXT"))return "community-link";
 if(type.includes("EPISODE_GEOGRAPHY"))return "location-link";
 return "connection";
}

function confidenceLabel(value:string){
 return value==="confirmed"?"CONFIRMED":value==="source-derived"?"SOURCE-DERIVED":"APPROXIMATE";
}

export default function EntityGraphView({onCharacter,onLocation,onEpisode,onConnection,onCommunity,onFaction,defaultCollapsed=false,root:rootProp,heading}:Props){
 const [root,setRoot]=useState<string>(rootProp??"character:michonne");
 useEffect(()=>{if(rootProp!==undefined)setRoot(rootProp)},[rootProp]);
 const [filter,setFilter]=useState<Filter>("ALL");
 const [collapsed,setCollapsed]=useState(defaultCollapsed);
 const rootNode=graph.nodes.get(root);
 const edges=rootNode?graph.adjacency.get(root)||[]:[];
 const related=useMemo(()=>{
   const grouped=new Map<string,{other:any;edges:any[]}>();
   for(const edge of edges){
     const other=edge.from.kind===rootNode?.kind&&edge.from.id===rootNode?.id?edge.to:edge.from;
     if(other.id===rootNode?.id)continue;
     const k=other.kind+":"+other.id;
     const existing=grouped.get(k);
     if(existing)existing.edges.push(edge); else grouped.set(k,{other,edges:[edge]});
   }
   return [...grouped.values()];
 },[edges,rootNode]);
 const visible=filter==="ALL"?related:related.filter(x=>x.other.kind===filter);
 const counts=related.reduce<Record<string,number>>((acc,x)=>{
   acc[x.other.kind]=(acc[x.other.kind]||0)+1;
   return acc;
 },{});
 const title=rootNode?labelFor(rootNode.kind,rootNode.id):"Universe";

 const select=(kind:string,id:string)=>{
   setRoot(kind+":"+id);
   setFilter("ALL");
   setCollapsed(false);
   if(kind==="character")onCharacter(id);
   if(kind==="location")onLocation(id);
   if(kind==="episode")onEpisode?.(id);
   if(kind==="connection")onConnection?.(id);
   if(kind==="community")onCommunity?.(id);
   if(kind==="faction")onFaction?.(id);
 };

 return <section className={"entityGraph"+(collapsed?" isCollapsed":"")} aria-label="Universe relationship graph">
   <div className="entityGraphHead">
    <div>
      <small>{heading||"RELATIONSHIP GRAPH"}</small>
      <b>{title||"Universe"}</b>
      <span className="entityGraphSub">{rootNode?.kind||"entity"} · {related.length} indexed relationships</span>
    </div>
    <div className="entityGraphHeadAction">
      <span className="entityGraphCount">{related.length} RELATIONSHIPS</span>
      <button className="entityGraphToggle" onClick={()=>setCollapsed(v=>!v)} aria-expanded={!collapsed} aria-label={collapsed?"Expand relationship graph":"Collapse relationship graph"}>
        {collapsed?"SHOW":"HIDE"}
      </button>
    </div>
   </div>

   {!collapsed&&related.length>0&&<div className="entityGraphFilters" aria-label="Relationship filters" role="group">
    <button className={filter==="ALL"?"active":""} onClick={()=>setFilter("ALL")} aria-pressed={filter==="ALL"}>ALL <b>{related.length}</b></button>
    {Object.entries(counts).sort(([a],[b])=>a.localeCompare(b)).map(([kind,count])=>
      <button key={kind} className={filter===kind?"active":""} onClick={()=>setFilter(kind as Filter)} aria-pressed={filter===kind}>
        {labels[kind]||kind.toUpperCase()} <b>{count}</b>
      </button>
    )}
   </div>}

   {!collapsed&&<div className="entityGraphNodes">
    {visible.slice(0,18).map(({edges:edgeList,other})=>{
      const primary=edgeList[0];
      const text=labelFor(other.kind,other.id);
      const episode=other.kind==="episode"?atlasData.episodes.find((e:any)=>e.id===other.id):null;
      const types=[...new Set(edgeList.map((edge:any)=>edge.type.replaceAll("_"," ")))];
      const evidence=edgeList.filter((edge:any)=>edge.evidenceId).length;
      return <button key={other.kind+":"+other.id} className={"entityGraphNode kind-"+other.kind} onClick={()=>select(other.kind,other.id)}>
       <span className="entityGraphNodeTop"><i><AtlasIcon name={iconForKind(other.kind)} />{labels[other.kind]||other.kind.toUpperCase()}</i><em><AtlasIcon name={iconForEdge(primary.type)} />{confidenceLabel(primary.confidence)}</em></span>
       <b><AtlasIcon name={iconForEdge(primary.type)} />{text}</b>
       {episode
         ? <small>{episode.seriesId?.toUpperCase()} · S{String(episode.seasonId).slice(-2)}E{String(episode.episodeNumber).padStart(2,"0")} · {episode.timelineStart??"?"}{edgeList.length>1?" · "+edgeList.length+" indexed links":""}</small>
         : <small>{types.slice(0,2).join(" · ")}{types.length>2?" · +"+(types.length-2)+" types":""}{evidence?" · "+evidence+" episode evidence"+(evidence===1?"":"s"):""}{primary.to.kind==="connection"||primary.from.kind==="connection"?" · DOCUMENTED LINK":""}</small>}
      </button>;
    })}
    {!visible.length&&<p className="muted">No indexed relationships in this category.</p>}
    {visible.length>18&&<div className="entityGraphMore">Showing 18 of {visible.length} related entities</div>}
   </div>}
 </section>;
}
