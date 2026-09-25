import {useCallback,useState} from "react";
import type {CSSProperties,ReactNode} from "react";
import Icon from "./Icon";
import type {IconName} from "./Icon";
import AtlasIcon from "./AtlasIcon";
import {atlasImagePlaceholder,atlasImageSrcSet,atlasImageUrl,mediaCredit} from "../lib/media";
import {onAtlasImageError,episodeImage,locationIconName,prettyType} from "../lib/atlasHelpers";
import {seriesColor,seriesShort} from "../lib/series";
import {episodeCode,storyRange} from "../lib/lookup";
import {useAtlas} from "../lib/atlasContext";
import type {Location} from "../data";

// Every remote image in the app goes through here: sized to its display width
// (Fandom CDN resize / local AMC variants), a ~1 KB blurred placeholder while
// it loads when the container fills it (`fill`), a fade-in on load, and a
// self-hiding fallback so a dead image never shows a broken glyph.
export function AtlasImage({src,width=720,className,alt="",sizes,eager,fill=true,priority}:{src?:string;width?:number;className?:string;alt?:string;sizes?:string;eager?:boolean;fill?:boolean;priority?:boolean}){
 // Keyed by src (not a boolean reset in an effect): a cached image can fire
 // load during commit, before any effect would run, and must stay visible.
 const [loadedSrc,setLoadedSrc]=useState<string|null>(null);
 const loaded=!!src&&loadedSrc===src;
 const ref=useCallback((img:HTMLImageElement|null)=>{if(img&&img.complete&&img.naturalWidth>0)setLoadedSrc(img.dataset.src||null)},[]);
 if(!src)return null;
 const lqip=fill?atlasImagePlaceholder(src):"";
 return <>
  {lqip&&!loaded&&<img className="atlasLqip" src={lqip} alt="" aria-hidden="true" decoding="async"/>}
  <img ref={ref} key={src} data-src={src} className={"atlasImg"+(loaded?" isLoaded":"")+(className?" "+className:"")} src={atlasImageUrl(src,width)} srcSet={atlasImageSrcSet(src,[Math.round(width/2),width,Math.round(width*1.6)])} sizes={sizes} alt={alt} loading={eager||priority?"eager":"lazy"} decoding="async" {...(priority?{fetchPriority:"high" as const}:{})} onLoad={()=>setLoadedSrc(src)} onError={e=>onAtlasImageError(e,src)}/>
 </>;
}

export function Credit({src,page}:{src?:string;page?:string}){
 const credit=mediaCredit(src,page);
 if(!credit)return null;
 return credit.href
  ?<a className="mediaCredit" href={credit.href} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()}>Image: {credit.label}</a>
  :<span className="mediaCredit">Image: {credit.label}</span>;
}

// `level`: h3 by default (detail pages sit under an h2 hero); views whose page title is an h1 (map overview, timeline, watch, journey) pass level={2} so headings never skip a level.
export function Section({title,count,children,action,collapsible=false,defaultOpen=true,id,level=3}:{title:string;count?:number|string;children:ReactNode;action?:ReactNode;collapsible?:boolean;defaultOpen?:boolean;id?:string;level?:2|3}){
 const Heading=(level===2?"h2":"h3") as "h2"|"h3";
 const [open,setOpen]=useState(defaultOpen);
 const head=<><span className="sectionTitleText">{title}</span>{count!=null&&<span className="sectionCount">{count}</span>}</>;
 return <section className={"section"+(collapsible&&!open?" isClosed":"")} id={id}>
  <header className="sectionHead">
   {collapsible
    ?<Heading className="sectionHeading"><button className="sectionToggle" onClick={()=>setOpen(v=>!v)} aria-expanded={open}>{head}<Icon name="chevronDown" className="sectionChevron"/></button></Heading>
    :<Heading className="sectionTitle">{head}</Heading>}
   {action}
  </header>
  {(!collapsible||open)&&<div className="sectionBody">{children}</div>}
 </section>;
}

// Long relationship lists (a character can have 100+ episodes) render a short
// preview first; everything stays one tap away instead of a wall of rows.
export function ShowMore<T>({items,limit=6,render,className="stack",label="Show all"}:{items:T[];limit?:number;render:(item:T,index:number)=>ReactNode;className?:string;label?:string}){
 const [all,setAll]=useState(false);
 const visible=all?items:items.slice(0,limit);
 return <>
  <div className={className}>{visible.map(render)}</div>
  {items.length>limit&&<button className="showMore" onClick={()=>setAll(v=>!v)}>{all?"Show less":`${label} ${items.length}`}<Icon name="chevronDown" className={all?"flip":""}/></button>}
 </>;
}

export function SeriesTag({seriesId}:{seriesId?:string}){
 if(!seriesId)return null;
 return <span className="seriesTag" style={{"--c":seriesColor(seriesId)} as CSSProperties}><i/>{seriesShort(seriesId)}</span>;
}

export function Chip({children,tone,icon}:{children:ReactNode;tone?:"good"|"warn"|"muted";icon?:IconName}){
 return <span className={"chip"+(tone?" chip-"+tone:"")}>{icon&&<Icon name={icon}/>}{children}</span>;
}

export function certaintyTone(c?:string):"good"|"warn"|"muted"{
 return c==="confirmed"?"good":c==="approximate"||c==="inferred"?"warn":"muted";
}

export function Stats({items}:{items:{label:string;value:ReactNode}[]}){
 return <div className="stats">{items.map(x=><div key={x.label}><b>{x.value}</b><small>{x.label}</small></div>)}</div>;
}

export function Hero({image,accent,kicker,title,children,icon,portrait,creditPage,onImage}:{image?:string;accent?:string;kicker:ReactNode;title:string;children?:ReactNode;icon?:IconName;portrait?:boolean;creditPage?:string;onImage?:()=>void}){
 return <div className={"hero"+(image?" hasImage":"")+(portrait?" heroPortrait":"")} style={{"--accent":accent||"#9aa6a1"} as CSSProperties}>
  <div className="heroMedia">
   {icon&&<Icon name={icon} className="heroIcon"/>}
   <AtlasImage src={image} width={900} sizes="(max-width: 899px) 100vw, 470px" priority/>
   {image&&onImage&&<button className="heroZoom" onClick={onImage} aria-label="View photos"><Icon name="expand"/></button>}
   {image&&<Credit src={image} page={creditPage}/>}
  </div>
  <div className="heroCopy">
   <div className="heroKicker">{kicker}</div>
   <h2 className="heroTitle">{title}</h2>
   {children}
  </div>
 </div>;
}

export function ActionBar({children}:{children:ReactNode}){
 return <div className="actionBar">{children}</div>;
}

export function WatchToggle({id,title,compact}:{id:string;title:string;compact?:boolean}){
 const {watched,toggleWatched}=useAtlas();
 const on=watched.has(id);
 return <button className={"watchToggle"+(on?" on":"")+(compact?" compact":"")} aria-pressed={on} aria-label={on?`Mark ${title} unwatched`:`Mark ${title} watched`} onClick={e=>{e.stopPropagation();toggleWatched(id)}}>
  <Icon name="check"/>{!compact&&<span>{on?"Watched":"Mark watched"}</span>}
 </button>;
}

export function EpisodeRow({episode,thumb=true,note,active}:{episode:any;thumb?:boolean;note?:ReactNode;active?:boolean}){
 const {openEpisode,watched}=useAtlas();
 const image=thumb?episodeImage(episode):"";
 const isWatched=watched.has(episode.id);
 return <div className={"row episodeRow"+(isWatched?" isWatched":"")+(active?" isActive":"")} style={{"--c":seriesColor(episode.seriesId)} as CSSProperties}>
  <button className="rowMain" onClick={()=>openEpisode(episode.id)}>
   {thumb&&<span className="rowThumb"><AtlasImage src={image} width={240} sizes="96px"/><Icon name="film"/></span>}
   <span className="rowText">
    <small><span className="dot"/>{seriesShort(episode.seriesId)} · {episodeCode(episode)} · {storyRange(episode)}</small>
    <b>{episode.title}</b>
    {note&&<em>{note}</em>}
   </span>
  </button>
  <WatchToggle id={episode.id} title={episode.title} compact/>
 </div>;
}

export function PlaceRow({location,note,isNew}:{location:Location;note?:ReactNode;isNew?:boolean}){
 const {openLocation}=useAtlas();
 return <button className="row placeRow" style={{"--c":seriesColor(location.seriesId)} as CSSProperties} onClick={()=>openLocation(location.id)}>
  <span className="placeGlyph"><AtlasIcon name={locationIconName(location.type)}/></span>
  <span className="rowText">
   <small>{seriesShort(location.seriesId)} · {prettyType(location.type)} · {location.year}{isNew&&<span className="newBadge">NEW</span>}</small>
   <b>{location.name}</b>
   {note&&<em>{note}</em>}
  </span>
  <Icon name="chevron" className="rowChevron"/>
 </button>;
}

export function PlaceChips({locations}:{locations:Location[]}){
 const {openLocation}=useAtlas();
 return <div className="chipList">{locations.map(l=><button key={l.id} className="linkChip" style={{"--c":seriesColor(l.seriesId)} as CSSProperties} onClick={()=>openLocation(l.id)}><Icon name="pin"/>{l.name}</button>)}</div>;
}

export function ProgressRing({value,size=76,stroke=7,children}:{value:number;size?:number;stroke?:number;children?:ReactNode}){
 const r=(size-stroke)/2,c=2*Math.PI*r,pct=Math.max(0,Math.min(1,value));
 return <div className="progressRing" style={{width:size,height:size}}>
  <svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
   <circle cx={size/2} cy={size/2} r={r} className="ringTrack" strokeWidth={stroke}/>
   <circle cx={size/2} cy={size/2} r={r} className="ringValue" strokeWidth={stroke} strokeDasharray={c} strokeDashoffset={c*(1-pct)} transform={`rotate(-90 ${size/2} ${size/2})`}/>
  </svg>
  <div className="ringLabel">{children}</div>
 </div>;
}

export function Note({children,icon="info"}:{children:ReactNode;icon?:IconName}){
 return <p className="note"><Icon name={icon}/><span>{children}</span></p>;
}

export function Empty({children}:{children:ReactNode}){
 return <p className="empty">{children}</p>;
}
