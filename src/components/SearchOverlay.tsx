import {useEffect,useMemo,useRef,useState} from "react";
import type {CSSProperties} from "react";
import Icon from "./Icon";
import type {IconName} from "./Icon";
import {atlasData} from "../data";
import {characterEpisodeCounts,episodeCode,locationEpisodeCounts,locationById,characterById} from "../lib/lookup";
import {seriesColor,seriesShort} from "../lib/series";
import {prettyType} from "../lib/atlasHelpers";

export type SearchKind="location"|"character"|"community"|"faction"|"episode";
type Result={kind:SearchKind;id:string;title:string;meta:string;color?:string};

const GROUPS:{kind:SearchKind;label:string;icon:IconName}[]=[
 {kind:"character",label:"People",icon:"person"},
 {kind:"location",label:"Places",icon:"pin"},
 {kind:"episode",label:"Episodes",icon:"film"},
 {kind:"community",label:"Communities",icon:"people"},
 {kind:"faction",label:"Factions",icon:"flag"}
];
const ALIASES:Record<string,string[]>={"cdc-atlanta":["cdc","center for disease control","centers for disease control"]};

function search(q:string):Result[]{
 const out:Result[]=[];
 const has=(...parts:(string|undefined)[])=>parts.join(" ").toLowerCase().includes(q);
 for(const x of atlasData.characters as any[])if(has(x.name,...(x.aliases||[])))out.push({kind:"character",id:x.id,title:x.name,meta:`${characterEpisodeCounts.get(x.id)??0} episodes · ${(x.seriesIds||[]).map(seriesShort).join(" · ")}`,color:seriesColor(x.seriesIds?.[0])});
 for(const x of atlasData.locations as any[])if(has(x.name,x.type,...(ALIASES[x.id]||[])))out.push({kind:"location",id:x.id,title:x.name,meta:`${seriesShort(x.seriesId)} · ${prettyType(x.type)} · ${x.year}`,color:seriesColor(x.seriesId)});
 for(const x of atlasData.episodes as any[])if(has(x.title))out.push({kind:"episode",id:x.id,title:x.title,meta:`${seriesShort(x.seriesId)} · ${episodeCode(x)} · ${x.timelineStart??"?"}`,color:seriesColor(x.seriesId)});
 for(const x of atlasData.communities as any[])if(has(x.name))out.push({kind:"community",id:x.id,title:x.name,meta:"Community"});
 for(const x of atlasData.factions as any[])if(has(x.name))out.push({kind:"faction",id:x.id,title:x.name,meta:"Faction"});
 // Exact / prefix matches first within each kind.
 return out.sort((a,b)=>Number(!a.title.toLowerCase().startsWith(q))-Number(!b.title.toLowerCase().startsWith(q)));
}

const suggestions=()=>{
 const people=[...characterEpisodeCounts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,6).map(([id])=>characterById.get(id)).filter(Boolean) as any[];
 const places=[...locationEpisodeCounts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,6).map(([id])=>locationById.get(id)).filter(Boolean) as any[];
 return {people,places};
};

export default function SearchOverlay({onClose,onPick}:{onClose:()=>void;onPick:(kind:SearchKind,id:string)=>void}){
 const [query,setQuery]=useState("");
 const input=useRef<HTMLInputElement|null>(null);
 useEffect(()=>{const t=window.setTimeout(()=>input.current?.focus(),30);return()=>window.clearTimeout(t)},[]);
 const q=query.trim().toLowerCase();
 const results=useMemo(()=>q?search(q):[],[q]);
 const popular=useMemo(suggestions,[]);
 const pick=(kind:SearchKind,id:string)=>{onPick(kind,id);onClose()};
 return <div className="searchOverlay" role="dialog" aria-modal="true" aria-label="Search the atlas" onKeyDown={e=>{if(e.key==="Escape"){e.stopPropagation();onClose()}}}>
  <div className="searchScrim" onClick={onClose}/>
  <div className="searchPanel">
   <div className="searchBar">
    <Icon name="search"/>
    <input ref={input} autoFocus value={query} onChange={e=>setQuery(e.target.value)} placeholder="People, places, episodes, factions" aria-label="Search the atlas" enterKeyHint="search" onKeyDown={e=>{if(e.key==="Enter"&&results[0])pick(results[0].kind,results[0].id)}}/>
    {query&&<button className="iconBtn ghost" onClick={()=>{setQuery("");input.current?.focus()}} aria-label="Clear search"><Icon name="close"/></button>}
    <button className="textBtn" onClick={onClose}>Cancel</button>
   </div>
   <div className="searchBody" aria-live="polite">
    {!q&&<>
     <h4 className="subhead">Most featured people</h4>
     <div className="chipList">{popular.people.map(c=><button key={c.id} className="linkChip" style={{"--c":seriesColor(c.seriesIds?.[0])} as CSSProperties} onClick={()=>pick("character",c.id)}><Icon name="person"/>{c.name}</button>)}</div>
     <h4 className="subhead">Most visited places</h4>
     <div className="chipList">{popular.places.map(l=><button key={l.id} className="linkChip" style={{"--c":seriesColor(l.seriesId)} as CSSProperties} onClick={()=>pick("location",l.id)}><Icon name="pin"/>{l.name}</button>)}</div>
    </>}
    {q&&!results.length&&<p className="empty">Nothing matches "{query}". Try a name, a place, or an episode title.</p>}
    {q&&GROUPS.map(g=>{const items=results.filter(r=>r.kind===g.kind).slice(0,g.kind==="episode"?8:6);if(!items.length)return null;return <section key={g.kind} className="searchGroup">
     <h4 className="subhead">{g.label}</h4>
     <div className="stack">{items.map(r=><button key={r.kind+r.id} className="row" style={{"--c":r.color||"#9aa6a1"} as CSSProperties} onClick={()=>pick(r.kind,r.id)}><span className="linkGlyph"><Icon name={g.icon}/></span><span className="rowText"><b>{r.title}</b><small>{r.meta}</small></span><Icon name="chevron" className="rowChevron"/></button>)}</div>
    </section>})}
   </div>
  </div>
 </div>;
}
