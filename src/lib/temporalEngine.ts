/** Precision-aware temporal utilities shared by the atlas chronology and watch guide. */
export type TemporalPrecision="day"|"month"|"year"|"range"|"unknown";
export type TemporalAnchor={start:number|null;end:number|null;precision:TemporalPrecision;label:string;valid:boolean};
const DAY=86400000;
export function isValidIsoDate(value:unknown):value is string {
 if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const d=new Date(value+"T00:00:00.000Z");
 return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;
}
export function normalizeTemporalAnchor(record:any):TemporalAnchor {
 const rawStart=record?.timelineStart??record?.start??record?.year;
 const rawEnd=record?.timelineEnd??record?.end??rawStart;
 const precision=String(record?.timelinePrecision??record?.precision??(record?.date?"day":rawStart!=null?"year":"unknown")).toLowerCase() as TemporalPrecision;
 // A record's own declared precision of "unknown" is authoritative and must
 // win over any numeric start/end that happens to be present (buildChronology
 // falls back to an air-date year when timelineStart/timelineEnd are null,
 // which otherwise leaks through here as if it were a real year-precision
 // anchor — e.g. tales-s01-e06 is explicitly timelinePrecision:"unknown" but
 // was sorting as a confident year-2022 anchor). Flattening an explicit
 // "we don't know" into false precision is exactly what AGENTS.md's data
 // policy forbids.
 if(precision==="unknown")return {start:null,end:null,precision:"unknown",label:"Unanchored",valid:true};
 const date=record?.date??record?.airDate;
 if(date&&isValidIsoDate(date)){
  const t=Date.parse(date+"T00:00:00.000Z");
  const d=new Date(t),year=d.getUTCFullYear(),daysInYear=(Date.UTC(year+1,0,1)-Date.UTC(year,0,1))/DAY;
  const dayOfYear=Math.floor((t-Date.UTC(year,0,1))/DAY);
  const ordinal=year+dayOfYear/daysInYear;
  return {start:ordinal,end:ordinal+1/daysInYear,precision:"day",label:date,valid:true};
 }
 const start=Number(rawStart),end=Number(rawEnd);
 if(rawStart==null||rawStart===""||!Number.isFinite(start)||start<1||start>9999||!Number.isFinite(end)||end<start||end>9999)
  return {start:null,end:null,precision:"unknown",label:"Unanchored",valid:rawStart==null||rawStart===""};
 const p:TemporalPrecision=["day","month","year","range"].includes(precision)?precision:"year";
 if(p==="day"||p==="month"){
  // Numeric year-only bounds are retained as a coarse interval unless a valid ISO date exists.
  return {start,end,precision:"range",label:start===end?String(start):start+"–"+end,valid:true};
 }
 return {start,end,precision:p,label:start===end?String(start):start+"–"+end,valid:true};
}
export type TemporalRelation="before"|"after"|"overlaps"|"unknown";
export function compareTemporalAnchors(a:TemporalAnchor,b:TemporalAnchor):TemporalRelation{
 if(a.start==null||a.end==null||b.start==null||b.end==null)return "unknown";
 // Two identical zero-width points (the common case: same-year episodes, both
 // [2011,2011]) are genuinely simultaneous, not ordered. Without this guard,
 // the half-open a.end<=b.start / a.start>=b.end checks below return "before"
 // for BOTH (a,b) and (b,a) whenever a.start===a.end===b.start===b.end,
 // breaking the antisymmetry Array.prototype.sort's comparator contract
 // requires -- 357 of 363 episodes in the current dataset share a same-year
 // anchor with at least one other episode, so this made buildEpisodeWatchOrder
 // scramble entire same-year seasons (verified: TWD S1 came out e05,e04,e06,
 // e03,e02,e01 instead of e01..e06). Day-precision anchors are half-open
 // ([ordinal, ordinal+1/daysInYear)) and never zero-width, so they still fall
 // through to the exact adjacency check below unaffected.
 if(a.start===a.end&&b.start===b.end&&a.start===b.start)return "overlaps";
 if(a.end<=b.start)return "before";
 if(a.start>=b.end)return "after";
 return "overlaps";
}
export function getAnchorYearBounds(items:{start:number;end:number}[]){
 const years=items.flatMap(x=>[x.start,x.end]).filter(x=>Number.isFinite(x)&&x>0).map(x=>x>9999?new Date(x).getUTCFullYear():x);
 return {min:years.length?Math.floor(Math.min(...years)):2010,max:years.length?Math.ceil(Math.max(...years)):2028};
}
export type OrderingConflict={before:string;after:string;reason:string};
export type OrderingConstraint={before:string;after:string;reason?:string};
export type OrderingValidation={errors:string[];warnings:string[]};
export function validateOrderingConstraints(ids:string[],constraints:OrderingConstraint[]):OrderingValidation{
 const known=new Set(ids),errors:string[]=[],warnings:string[]=[],edges=new Map<string,string[]>();
 const seen=new Set<string>();
 for(const edge of constraints){
  if(!known.has(edge.before)||!known.has(edge.after)){
   errors.push(`Ordering rule references missing item: ${edge.before} -> ${edge.after}`);continue;
  }
  if(edge.before===edge.after){errors.push(`Ordering rule is self-referential: ${edge.before}`);continue;}
  const key=edge.before+"\\u0000"+edge.after;
  if(seen.has(key)){warnings.push(`Duplicate ordering rule: ${edge.before} -> ${edge.after}`);continue;}
  seen.add(key);
  const next=edges.get(edge.before)??[];next.push(edge.after);edges.set(edge.before,next);
 }
 const state=new Map<string,number>(),stack:string[]=[];
 const visit=(id:string)=>{
  state.set(id,1);stack.push(id);
  for(const next of edges.get(id)??[]){
   if(state.get(next)===1){const cycle=[...stack.slice(stack.indexOf(next)),next];errors.push("Ordering constraint cycle: "+cycle.join(" -> "));}
   else if(!state.has(next))visit(next);
  }
  stack.pop();state.set(id,2);
 };
 for(const id of ids)if(!state.has(id))visit(id);
 return {errors:[...new Set(errors)],warnings:[...new Set(warnings)]};
}
export function stableTopologicalOrder<T extends {id:string}>(items:T[],constraints:OrderingConstraint[]){
 const byId=new Map(items.map(x=>[x.id,x])),validation=validateOrderingConstraints(items.map(x=>x.id),constraints);
 const incoming=new Map(items.map(x=>[x.id,0])),edges=new Map<string,string[]>();
 for(const edge of constraints){
  if(!byId.has(edge.before)||!byId.has(edge.after)||edge.before===edge.after)continue;
  const list=edges.get(edge.before)??[];
  if(!list.includes(edge.after)){list.push(edge.after);edges.set(edge.before,list);incoming.set(edge.after,(incoming.get(edge.after)??0)+1);}
 }
 const ready=items.filter(x=>incoming.get(x.id)===0),ordered:T[]=[];
 while(ready.length){
  ready.sort((a,b)=>items.indexOf(a)-items.indexOf(b));
  const next=ready.shift()!;ordered.push(next);
  for(const id of edges.get(next.id)??[]){const n=(incoming.get(id)??1)-1;incoming.set(id,n);if(n===0)ready.push(byId.get(id)!);}
 }
 const included=new Set(ordered.map(x=>x.id));
 if(ordered.length!==items.length)for(const item of items)if(!included.has(item.id))ordered.push(item);
 return {ordered,conflicts:validation.errors.map(reason=>({before:"",after:"",reason})),warnings:validation.warnings};
}
