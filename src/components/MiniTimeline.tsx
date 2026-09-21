import {useMemo} from "react";
import type {CSSProperties} from "react";
import {UNIVERSE_MIN_YEAR,UNIVERSE_MAX_YEAR,yearToPercent} from "../lib/chronology";

export type MiniTimelineItem={id:string;start:number;end:number;title:string;color?:string;kind?:string};

type Props={
 items:MiniTimelineItem[];
 activeId?:string|null;
 markYear?:number;
 onSelect?:(id:string)=>void;
 emptyLabel?:string;
};

// A compact, non-interactive-by-default strip that plots a handful of chronology
// items (an entity's linked episodes, a connection's evidence) proportionally along
// the same universe year axis the timeline dock uses. Entity detail panels previously
// only ever showed chronology as text (a min-max year range, a "first episode" label)
// even though the app's core loop is Time -> Story -> Geography — this gives every
// entity type the same at-a-glance "where does this sit in universe time" visual the
// character journey rail already had, without duplicating the dock's lane machinery.
//
// Items sharing the exact same (start, end) are folded into one clustered marker with
// a count badge rather than rendered as separate absolutely-positioned dots: the
// compressed in-universe chronology model means dozens of episodes tied to a popular
// location routinely share an identical anchor year, so unclustered dots would stack
// pixel-for-pixel and every click would silently resolve to whichever one happened to
// render last. Clicking a cluster opens its earliest item; the full per-episode list
// already rendered below every caller of this component remains the way to reach a
// specific one of several same-year episodes.
export default function MiniTimeline({items,activeId,markYear,onSelect,emptyLabel}:Props){
 const clusters=useMemo(()=>{
  const byKey=new Map<string,MiniTimelineItem[]>();
  for(const item of items){
   const key=item.start+"|"+item.end;
   if(!byKey.has(key))byKey.set(key,[]);
   byKey.get(key)!.push(item);
  }
  return [...byKey.values()].map(group=>({
   start:group[0].start,end:group[0].end,color:group.find(x=>x.color)?.color,
   items:group,
  })).sort((a,b)=>a.start-b.start);
 },[items]);
 if(!clusters.length)return <p className="muted miniTimelineEmpty">{emptyLabel||"No chronology anchors recorded."}</p>;
 const min=Math.min(UNIVERSE_MIN_YEAR,...clusters.map(x=>x.start));
 const max=Math.max(UNIVERSE_MAX_YEAR,...clusters.map(x=>x.end));
 const pos=(year:number)=>yearToPercent(year,min,max);
 return <div className="miniTimeline" role={onSelect?"list":undefined} aria-label="Chronology position">
  <div className="miniTimelineAxis"><span>{min}</span><span>{max}</span></div>
  <div className="miniTimelineTrack">
   {typeof markYear==="number"&&<div className="miniTimelineMark" style={{left:pos(markYear)+"%"} as CSSProperties} aria-hidden="true"/>}
   {clusters.map(cluster=>{
    const left=pos(cluster.start);
    const width=Math.max(.6,pos(cluster.end)-left);
    const isActive=cluster.items.some(i=>i.id===activeId);
    const label=cluster.items.length>1?`${cluster.items.length} episodes · ${cluster.start===cluster.end?cluster.start:cluster.start+"–"+cluster.end}: ${cluster.items.map(i=>i.title).join(", ")}`:`${cluster.items[0].title} · ${cluster.start===cluster.end?cluster.start:cluster.start+"–"+cluster.end}`;
    const key=cluster.start+"|"+cluster.end;
    const style={left:left+"%",width:Math.min(24,width)+"%","--dot":cluster.color||"#8fa19c"} as CSSProperties;
    const content=<><i/>{cluster.items.length>1&&<b>{cluster.items.length}</b>}</>;
    return onSelect
     ?<button key={key} className={"miniTimelineItem"+(isActive?" active":"")+(cluster.items.length>1?" clustered":"")} style={style} title={label} onClick={()=>onSelect(cluster.items[0].id)}>{content}</button>
     :<span key={key} className={"miniTimelineItem"+(isActive?" active":"")+(cluster.items.length>1?" clustered":"")} style={style} title={label}>{content}</span>;
   })}
  </div>
 </div>;
}
