import fandomCanonical from "../../../data/enrichment/fandom-canonical.json";
import {atlasData} from "../../data";
import Icon from "../../components/Icon";
import EntityGraphView from "../../components/EntityGraphView";
import {AtlasImage,Section,ShowMore} from "../../components/ui";
import {useAtlas} from "../../lib/atlasContext";
import {resolveConnectionEndpoint} from "../../lib/entityGraph";
import {characterById,connectionById,entityName} from "../../lib/lookup";
import {prettyType,characterImage,connectionTypeLabel} from "../../lib/atlasHelpers";

const FACT_LABELS:Record<string,string>={aliases:"Aliases",actor:"Portrayed by",status:"Status",firstAppearance:"First appearance",lastAppearance:"Last appearance",occupation:"Occupation",affiliation:"Affiliation",family:"Family",relationships:"Relationships",type:"Type",region:"Region",residents:"Residents",coordinates:"Coordinates",season:"Season",episodeNumber:"Episode",airDate:"Air date",director:"Director",writer:"Writers",cast:"Cast",locations:"Featured locations",productionCode:"Production code",viewership:"Viewership"};
const asText=(value:any)=>Array.isArray(value)?value.join(" · "):String(value);
const normalize=(value:string)=>String(value||"").toLowerCase().replace(/\[[^\]]*\]/g,"").replace(/\([^)]*\)/g,"").replace(/[^a-z0-9]+/g," ").trim();

let atlasEntityNames:{kind:string;id:string;keys:string[]}[]|null=null;
function atlasEntities(){
 if(!atlasEntityNames)atlasEntityNames=[
  ...atlasData.characters.map((x:any)=>({kind:"character",id:x.id,keys:[x.name,...(x.aliases||[])].map(normalize)})),
  ...atlasData.locations.map((x:any)=>({kind:"location",id:x.id,keys:[x.name,...(x.aliases||[])].map(normalize)})),
  ...atlasData.episodes.map((x:any)=>({kind:"episode",id:x.id,keys:[x.title].map(normalize)}))
 ];
 return atlasEntityNames;
}

export function fandomRecord(entityType:"characters"|"locations"|"episodes",id:string){
 return (fandomCanonical as any)?.[entityType]?.[id];
}

// Wiki facts, summary and cross-links. Summary + key facts are shown inline;
// the long tail (page sections, every raw field) sits behind a disclosure.
//
// The enrichment sync currently ships a "raw sync" record (identity +
// provenance + image_urls only — see data/enrichment/fandom-canonical.json's
// own `policy` string). hints/fields/extract/details.linkedPages belong to a
// later publish step that hasn't run for this snapshot, so every field below
// is read defensively: real today (sourceUrl, revision, synced_at) or a
// future publish stage populates it, never both silently empty.
export function WikiSection({entityType,entityId}:{entityType:"characters"|"locations"|"episodes";entityId:string}){
 const {openCharacter,openLocation,openEpisode}=useAtlas();
 const record=fandomRecord(entityType,entityId);
 if(!record)return null;
 const hints=record.hints||{};
 const facts=Object.entries(hints).filter(([key,value])=>key!=="image"&&key!=="imageGallery"&&value!=null&&String(value).trim()!=="");
 const known=new Set(facts.map(([k])=>k));
 const extra=Object.entries(record.fields||{}).filter(([key,value])=>!known.has(key)&&value!=null&&String(value).trim()!=="");
 const links:string[]=Array.isArray(record.details?.linkedPages)?record.details.linkedPages:[];
 const entities=atlasEntities();
 const linked=links.map(page=>{const key=normalize(page);return entities.find(x=>x.keys.includes(key))}).filter(Boolean).filter((x,i,a)=>a.findIndex(y=>y!.kind===x!.kind&&y!.id===x!.id)===i).slice(0,24) as {kind:string;id:string}[];
 const open=(x:{kind:string;id:string})=>x.kind==="character"?openCharacter(x.id):x.kind==="location"?openLocation(x.id):openEpisode(x.id);
 const sourceUrl:string|undefined=record.sourceUrl||record.fandom_url||record.metadata?.sourceUrl;
 const syncedDate=typeof record.synced_at==="string"?record.synced_at.slice(0,10):null;
 const hasContent=Boolean(record.extract)||facts.length>0||extra.length>0||linked.length>0||Boolean(sourceUrl);
 if(!hasContent)return null;
 return <Section title="From the wiki" collapsible defaultOpen={Boolean(record.extract)}>
  {record.extract&&<p className="prose">{record.extract}</p>}
  {facts.length>0&&<dl className="facts">{facts.map(([key,value])=><div key={key}><dt>{FACT_LABELS[key]||prettyType(key.replaceAll("_"," "))}</dt><dd>{asText(value)}</dd></div>)}</dl>}
  {linked.length>0&&<><h4 className="subhead">Also in the atlas</h4><div className="chipList">{linked.map(x=><button key={x.kind+x.id} className="linkChip" onClick={()=>open(x)}><Icon name={x.kind==="character"?"person":x.kind==="location"?"pin":"film"}/>{entityName(x.id,x.kind)}</button>)}</div></>}
  {extra.length>0&&<details className="disclosure"><summary>All wiki fields ({extra.length})</summary><dl className="facts">{extra.map(([key,value])=><div key={key}><dt>{prettyType(key.replaceAll("_"," "))}</dt><dd>{asText(value)}</dd></div>)}</dl></details>}
  {sourceUrl&&<a className="sourceLink" href={sourceUrl} target="_blank" rel="noreferrer"><span>Walking Dead Wiki source page</span><Icon name="external"/></a>}
  {sourceUrl&&syncedDate&&<p className="provenanceNote">Synced {syncedDate}{record.fandom_revision?` · revision ${record.fandom_revision}`:""}</p>}
 </Section>;
}

export function Gallery({items,title="Gallery"}:{items:{src?:string;title:string;meta?:string}[];title?:string}){
 const valid=items.filter(x=>x.src);
 if(valid.length<2)return null;
 return <Section title={title} count={valid.length}>
  <div className="gallery">{valid.map((item,i)=><figure key={item.title+i}><AtlasImage src={item.src} width={520} sizes="180px"/><figcaption><b>{item.title}</b>{item.meta&&<small>{item.meta}</small>}</figcaption></figure>)}</div>
 </Section>;
}

export function GraphSection({root}:{root:string}){
 const a=useAtlas();
 return <Section title="Explore connections" collapsible defaultOpen={false}>
  <EntityGraphView root={root} heading="Relationship graph" onCharacter={a.openCharacter} onLocation={a.openLocation} onEpisode={a.openEpisode} onConnection={a.openConnection} onCommunity={a.openCommunity} onFaction={a.openFaction}/>
 </Section>;
}

// A documented relationship rendered as "A ↔ B" with the label, used by every
// entity that lists its links.
export function ConnectionRow({id,perspective}:{id:string;perspective?:string}){
 const {openConnection}=useAtlas();
 const c=connectionById.get(id) as any;
 if(!c)return null;
 const from=resolveConnectionEndpoint(c,"from"),to=resolveConnectionEndpoint(c,"to");
 const otherRef=perspective?(c.fromId===perspective?to:from):null;
 return <button className="row connectionRow" onClick={()=>openConnection(id)}>
  <span className="linkGlyph"><Icon name="link"/></span>
  <span className="rowText">
   <small>{connectionTypeLabel(c.type)} · {c.certainty}</small>
   <b>{c.label}</b>
   <em>{otherRef?`with ${entityName(otherRef.id,otherRef.kind)}`:`${entityName(from?.id??c.fromId,from?.kind)} ↔ ${entityName(to?.id??c.toId,to?.kind)}`}</em>
  </span>
  <Icon name="chevron" className="rowChevron"/>
 </button>;
}

export function ConnectionList({ids,perspective}:{ids:string[];perspective?:string}){
 if(!ids.length)return null;
 return <Section title="Documented links" count={ids.length}>
  <ShowMore items={ids} limit={4} render={id=><ConnectionRow key={id} id={id} perspective={perspective}/>}/>
 </Section>;
}

export function PortraitStrip({characters}:{characters:{id:string;name:string;count?:number}[]}){
 const {openCharacter}=useAtlas();
 return <div className="portraitStrip">{characters.map(c=><button key={c.id} onClick={()=>openCharacter(c.id)}><PortraitImage id={c.id} name={c.name}/><b>{c.name}</b>{c.count!=null&&<small>{c.count} ep</small>}</button>)}</div>;
}

export function PortraitImage({id,name,size="md"}:{id:string;name:string;size?:"sm"|"md"|"lg"}){
 const image=characterImage({id,name,seriesIds:(characterById.get(id) as any)?.seriesIds});
 const initials=name.split(/\s+/).filter(Boolean).slice(0,2).map(v=>v[0]).join("").toUpperCase();
 return <span className={"portrait portrait-"+size}><span className="portraitInitials">{initials}</span><AtlasImage src={image} width={320} sizes="96px"/></span>;
}
