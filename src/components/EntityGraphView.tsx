import {useMemo,useState} from "react";
import {atlasData} from "../data";
import {buildEntityGraph} from "../lib/entityGraph";

type Props={onCharacter:(id:string)=>void;onLocation:(id:string)=>void};

export default function EntityGraphView({onCharacter,onLocation}:Props){
 const graph=useMemo(()=>buildEntityGraph(),[]);
 const [root,setRoot]=useState<string>("character:michonne");
 const rootNode=graph.nodes.get(root);
 const edges=rootNode?graph.adjacency.get(root)||[]:[];
 const related=edges.map(edge=>{
   const other=edge.from.kind===rootNode?.kind&&edge.from.id===rootNode?.id?edge.to:edge.from;
   return {edge,other};
 }).filter(x=>x.other.id!==rootNode?.id);
 const title=rootNode?(
   rootNode.kind==="character"?atlasData.characters.find((x:any)=>x.id===rootNode.id)?.name:
   rootNode.kind==="location"?atlasData.locations.find((x:any)=>x.id===rootNode.id)?.name:
   rootNode.kind==="series"?atlasData.series.find((x:any)=>x.id===rootNode.id)?.name:rootNode.id
 ):"Universe";
 const select=(kind:string,id:string)=>{setRoot(kind+":"+id);if(kind==="character")onCharacter(id);if(kind==="location")onLocation(id)};
 return <section className="entityGraph" aria-label="Universe relationship graph">
   <div className="entityGraphHead"><div><small>RELATIONSHIP GRAPH</small><b>{title||"Universe"}</b></div><span>{related.length} connected</span></div>
   <div className="entityGraphNodes">
    {related.slice(0,18).map(({edge,other})=>{
      const label=other.kind==="character"?atlasData.characters.find((x:any)=>x.id===other.id)?.name:other.kind==="location"?atlasData.locations.find((x:any)=>x.id===other.id)?.name:other.id;
      return <button key={edge.id} onClick={()=>select(other.kind,other.id)}><i>{other.kind}</i><b>{label||other.id}</b><small>{edge.type.replaceAll("_"," ")} · {edge.confidence}</small></button>
    })}
    {!related.length&&<p className="muted">No indexed relationships for this entity yet.</p>}
   </div>
 </section>;
}
