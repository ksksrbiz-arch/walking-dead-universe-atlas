import {useMemo,useState} from "react";
import {atlasData} from "../data";
import {buildEntityGraph} from "../lib/entityGraph";

type Props={onCharacter:(id:string)=>void;onLocation:(id:string)=>void};
type Filter="ALL"|"character"|"location"|"community"|"faction"|"series"|"episode"|"connection";

const labels:Record<string,string>={
 character:"PEOPLE",location:"PLACES",community:"COMMUNITIES",faction:"FACTIONS",
 series:"SERIES",episode:"EPISODES",connection:"LINKS"
};

function labelFor(kind:string,id:string){
 const pools:any={episode:atlasData.episodes,location:atlasData.locations,character:atlasData.characters,community:atlasData.communities,faction:atlasData.factions,series:atlasData.series,connection:atlasData.connections};
 const item=pools[kind]?.find((x:any)=>x.id===id);
 return item?.name||item?.title||item?.label||id;
}

export default function EntityGraphView({onCharacter,onLocation}:Props){
 const graph=useMemo(()=>buildEntityGraph(),[]);
 const [root,setRoot]=useState<string>("character:michonne");
 const [filter,setFilter]=useState<Filter>("ALL");
 const rootNode=graph.nodes.get(root);
 const edges=rootNode?graph.adjacency.get(root)||[]:[];
 const related=edges.map(edge=>{
   const other=edge.from.kind===rootNode?.kind&&edge.from.id===rootNode?.id?edge.to:edge.from;
   return {edge,other};
 }).filter(x=>x.other.id!==rootNode?.id);
 const visible=filter==="ALL"?related:related.filter(x=>x.other.kind===filter);
 const counts=related.reduce<Record<string,number>>((acc,x)=>{acc[x.other.kind]=(acc[x.other.kind]||0)+1;return acc},{} as Record<string,number>);
 const title=rootNode?labelFor(rootNode.kind,rootNode.id):"Universe";
 const select=(kind:string,id:string)=>{
   setRoot(kind+":"+id);
   setFilter("ALL");
   if(kind==="character")onCharacter(id);
   if(kind==="location")onLocation(id);
 };
 return <section className="entityGraph" aria-label="Universe relationship graph">
   <div className="entityGraphHead">
    <div><small>RELATIONSHIP GRAPH</small><b>{title||"Universe"}</b><span className="entityGraphSub">{rootNode?.kind||"entity"} · {related.length} indexed relationships</span></div>
    <span className="entityGraphCount">{graph.nodes.size} NODES</span>
   </div>
   {related.length>0&&<div className="entityGraphFilters" aria-label="Relationship filters">
    <button className={filter==="ALL"?"active":""} onClick={()=>setFilter("ALL")}>ALL <b>{related.length}</b></button>
    {Object.entries(counts).sort(([a],[b])=>a.localeCompare(b)).map(([kind,count])=><button key={kind} className={filter===kind?"active":""} onClick={()=>setFilter(kind as Filter)}>{labels[kind]||kind.toUpperCase()} <b>{count}</b></button>)}
   </div>}
   <div className="entityGraphNodes">
    {visible.slice(0,24).map(({edge,other})=>{
      const text=labelFor(other.kind,other.id);
      return <button key={edge.id} className={"entityGraphNode kind-"+other.kind} onClick={()=>select(other.kind,other.id)}>
       <span className="entityGraphNodeTop"><i>{labels[other.kind]||other.kind.toUpperCase()}</i><em>{edge.confidence}</em></span>
       <b>{text}</b>
       <small>{edge.type.replaceAll("_"," ")}{edge.kind==="connection"?" · DOCUMENTED LINK":""}</small>
      </button>
    })}
    {!visible.length&&<p className="muted">No indexed relationships in this category.</p>}
    {visible.length>24&&<div className="entityGraphMore">Showing 24 of {visible.length} related entities</div>}
   </div>
 </section>;
}
