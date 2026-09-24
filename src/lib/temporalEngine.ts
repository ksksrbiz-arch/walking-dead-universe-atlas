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
 if(a.end<b.start)return "before";
 if(a.start>b.end)return "after";
 return "overlaps";
}
export function getAnchorYearBounds(items:{start:number;end:number}[]){
 const years=items.flatMap(x=>[x.start,x.end]).filter(x=>Number.isFinite(x)&&x>0).map(x=>x>9999?new Date(x).getUTCFullYear():x);
 return {min:years.length?Math.floor(Math.min(...years)):2010,max:years.length?Math.ceil(Math.max(...years)):2028};
}
export type OrderingConflict={before:string;after:string;reason:string};
export function stableTopologicalOrder<T extends {id:string}>(items:T[],constraints:{before:string;after:string;reason?:string}[]){
 const byId=new Map(items.map(x=>[x.id,x])),incoming=new Map(items.map(x=>[x.id,0])),edges=new Map<string,string[]>();
 const conflicts:OrderingConflict[]=[];
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
 if(ordered.length!==items.length){
  for(const item of items)if(!included.has(item.id))ordered.push(item);
  for(const edge of constraints)if(!included.has(edge.before)&&!included.has(edge.after))conflicts.push({before:edge.before,after:edge.after,reason:edge.reason??"Conflicting temporal constraints"});
 }
 return {ordered,conflicts};
}
