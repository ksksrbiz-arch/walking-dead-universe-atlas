import {useMemo,useState} from "react";
import type {CSSProperties} from "react";
import Icon from "../components/Icon";
import {useAtlas} from "../lib/atlasContext";
import {atlasData} from "../data";
import {buildChronology} from "../lib/chronology";
import {characterEpisodeCounts} from "../lib/lookup";
import {getGroupEpisodeIds} from "../lib/entityGraph";
import {prettyType} from "../lib/atlasHelpers";
import {seriesColor} from "../lib/series";
import {ConnectionRow,PortraitImage} from "./details/shared";

type Tab="people"|"groups"|"links";

export default function PeopleView(){
 const {openCharacter,openCommunity,openFaction,watched,followed}=useAtlas();
 const [tab,setTab]=useState<Tab>("people");
 const [onlyFollowed,setOnlyFollowed]=useState(false);
 const [query,setQuery]=useState("");
 const q=query.trim().toLowerCase();
 const firstYear=useMemo(()=>{
  const map=new Map<string,number>();
  for(const item of buildChronology()){
   if(item.kind!=="episode"||!(item.start>0))continue;
   for(const id of item.characterIds??[])if(!map.has(id)||item.start<map.get(id)!)map.set(id,item.start);
  }
  return map;
 },[]);
 // Most-featured first: a newcomer should meet Rick, Daryl and Carol before a one-episode walker.
 const people=useMemo(()=>[...atlasData.characters as any[]].sort((a,b)=>(characterEpisodeCounts.get(b.id)??0)-(characterEpisodeCounts.get(a.id)??0)||a.name.localeCompare(b.name)),[]);
 const seenBy=useMemo(()=>{
  const m=new Map<string,number>();
  for(const e of atlasData.episodes as any[])if(watched.has(e.id))for(const c of e.characterIds??[])m.set(c,(m.get(c)??0)+1);
  return m;
 },[watched]);
 const groups=useMemo(()=>[
  ...(atlasData.communities as any[]).map(g=>({...g,kind:"community" as const,episodes:getGroupEpisodeIds("community",g.id).length})),
  ...(atlasData.factions as any[]).map(g=>({...g,kind:"faction" as const,episodes:getGroupEpisodeIds("faction",g.id).length}))
 ].sort((a,b)=>b.episodes-a.episodes||a.name.localeCompare(b.name)),[]);
 const shownPeople=people.filter(c=>(!q||c.name.toLowerCase().includes(q))&&(!onlyFollowed||followed.has(c.id)));
 const shownGroups=groups.filter(g=>!q||g.name.toLowerCase().includes(q));
 const shownLinks=(atlasData.connections as any[]).filter(c=>!q||c.label.toLowerCase().includes(q));
 const tabs:[Tab,string,number][]=[["people","People",shownPeople.length],["groups","Groups",shownGroups.length],["links","Links",shownLinks.length]];
 return <div className="page peoplePage">
  <header className="pageHead"><div><small>Who's who</small><h1>People & groups</h1></div></header>
  <label className="field"><Icon name="search"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={tab==="people"?"Find a character":tab==="groups"?"Find a community or faction":"Find a relationship"} aria-label="Filter"/>{query&&<button onClick={()=>setQuery("")} aria-label="Clear filter"><Icon name="close"/></button>}</label>
  <div className="segmented" role="tablist">{tabs.map(([id,label,n])=><button key={id} role="tab" aria-selected={tab===id} className={tab===id?"active":""} onClick={()=>setTab(id)}>{label}<b>{n}</b></button>)}</div>
  {tab==="people"&&followed.size>0&&<div className="segmented small" role="group">
   <button className={!onlyFollowed?"active":""} aria-pressed={!onlyFollowed} onClick={()=>setOnlyFollowed(false)}>All</button>
   <button className={onlyFollowed?"active":""} aria-pressed={onlyFollowed} onClick={()=>setOnlyFollowed(true)}><Icon name="star"/>Following<b>{followed.size}</b></button>
  </div>}

  {tab==="people"&&<div className="peopleGrid">{shownPeople.map(c=>{const count=characterEpisodeCounts.get(c.id)??0;const seen=seenBy.get(c.id)??0;return <button key={c.id} className="personCard" onClick={()=>openCharacter(c.id)} style={{"--c":seriesColor(c.seriesIds?.[0])} as CSSProperties}>
   {followed.has(c.id)&&<span className="followBadge"><Icon name="star"/></span>}
   <PortraitImage id={c.id} name={c.name} size="lg"/>
   <b>{c.name}</b>
   <span className="seriesDots">{(c.seriesIds||[]).map((s:string)=><i key={s} style={{background:seriesColor(s)}}/>)}</span>
   <small>{count} ep{firstYear.get(c.id)?` · ${firstYear.get(c.id)}`:""}</small>
   {count>0&&seen>0&&<span className="miniProgress" aria-label={`${seen} of ${count} watched`}><i style={{width:Math.round(seen/count*100)+"%"}}/></span>}
  </button>})}
  {!shownPeople.length&&<p className="empty">{onlyFollowed?"No followed characters match.":`No character matches "${query}".`}</p>}</div>}

  {tab==="groups"&&<div className="stack">{shownGroups.map(g=><button key={g.kind+g.id} className="row groupRow" onClick={()=>g.kind==="community"?openCommunity(g.id):openFaction(g.id)}>
   <span className="linkGlyph"><Icon name={g.kind==="community"?"people":"flag"}/></span>
   <span className="rowText"><small>{g.kind}{g.type?" · "+prettyType(g.type):""} · {g.certainty}</small><b>{g.name}</b><em>{g.episodes} linked episode{g.episodes===1?"":"s"}</em></span>
   <Icon name="chevron" className="rowChevron"/>
  </button>)}{!shownGroups.length&&<p className="empty">No group matches "{query}".</p>}</div>}

  {tab==="links"&&<div className="stack">{shownLinks.map(c=><ConnectionRow key={c.id} id={c.id}/>)}{!shownLinks.length&&<p className="empty">No relationship matches "{query}".</p>}</div>}
 </div>;
}
