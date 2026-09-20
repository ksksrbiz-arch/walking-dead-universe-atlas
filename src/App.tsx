import {useEffect,useMemo,useRef,useState} from "react";
import {geoEqualEarth,geoPath} from "d3-geo";
import {feature} from "topojson-client";
import type {CSSProperties} from "react";
// @ts-ignore world-atlas ships JSON topology
import world from "@cublya/world-atlas/countries-50m.json";
import {atlasData,Location,SeriesKey} from "./data";
import {validateAtlasData} from "./lib/validateData";
import {buildChronology} from "./lib/chronology";
import episodeMedia from "../data/episodeMedia.json";
import AtlasTimelineDock from "./components/AtlasTimelineDock";
import MobileTimeBar from "./components/MobileTimeBar";
import EntityGraphView from "./components/EntityGraphView";
import {atlasImageSrcSet,atlasImageUrl} from "./lib/media";
import {getCharacterEpisodeIds,getLocationEpisodeIds,getEpisodeConnectionIds} from "./lib/entityGraph";
import {initAtlasPerformance,trackAtlasMetric,observeImageError} from "./lib/performance";
import {getRuntimeMeta,getRuntimeRelationships,getRuntimeEpisodeIds} from "./lib/runtime";

type View="map"|"timeline"|"people"|"guide";
type SearchKind="location"|"character"|"community"|"faction"|"episode";

const META:Record<SeriesKey,{id:string;name:string;color:string;short:string}>={
 TWD:{id:"twd",name:"The Walking Dead",color:"#e7e7e1",short:"TWD"},
 FTWD:{id:"ftwd",name:"Fear the Walking Dead",color:"#d4a64b",short:"FEAR"},
 TALES:{id:"tales",name:"Tales of the Walking Dead",color:"#d68168",short:"TALES"},
 WB:{id:"wb",name:"World Beyond",color:"#72a9c5",short:"WORLD BEYOND"},
 OWL:{id:"owl",name:"The Ones Who Live",color:"#d26e6b",short:"TOWL"},
 DARYL:{id:"daryl",name:"Daryl Dixon",color:"#9d88c8",short:"DARYL"},
 DEAD:{id:"dead",name:"Dead City",color:"#5bb29b",short:"DEAD CITY"}
};
const SERIES_BY_ID=Object.fromEntries(Object.values(META).map(x=>[x.id,x])) as Record<string,typeof META.TWD>;
const SERIES_KEYS=Object.keys(META) as SeriesKey[];
const projection=geoEqualEarth().fitExtent([[24,22],[976,578]],{type:"Sphere"});
const pathGenerator=geoPath(projection);
const worldCountries:any=feature(world as any,(world as any).objects.countries) as any;
const worldLand:any=feature(world as any,(world as any).objects.land) as any;
const project=(lat:number,lng:number)=>{const p=projection([lng,lat]);return {x:p?.[0]??0,y:p?.[1]??0}};
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
const MOBILE_HOME_X=0;
const MOBILE_HOME_Y=0;
const onAtlasImageError=(e:React.SyntheticEvent<HTMLImageElement>,source:string)=>{const img=e.currentTarget;if(!source||img.dataset.fallback==="1")return;observeImageError(source);img.dataset.fallback="1";img.removeAttribute("srcset");img.src=source;};
const countryPalette=["#c8c3b5","#bfc4bb","#c6c0b0","#b7c0b5","#c9c6b8","#b9c2bf","#c3b9ac","#c4c8bc"];
const countryTone=(i:number)=>countryPalette[i%countryPalette.length];

function Icon({name}:{name:"map"|"timeline"|"people"|"guide"|"plus"|"minus"|"locate"|"search"|"close"|"chevron"|"layers"|"play"|"pause"|"arrow"|"pin"}) {
 const paths={
  map:<><path d="M4 6 9 4l6 2 5-2v14l-5 2-6-2-5 2Z"/><path d="M9 4v14M15 6v14"/></>,
  timeline:<><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/></>,
  people:<><circle cx="12" cy="8" r="3"/><path d="M6.5 20c.6-3.3 2.4-5 5.5-5s4.9 1.7 5.5 5"/></>,
  guide:<><path d="M6 4h12v16H6z"/><path d="M9 8h6M9 12h6M9 16h6"/></>,
  plus:<><path d="M12 5v14M5 12h14"/></>,
  minus:<path d="M5 12h14"/>,
  locate:<><circle cx="12" cy="12" r="6"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></>,
  search:<><circle cx="10.5" cy="10.5" r="6"/><path d="m16 16 5 5"/></>,
  close:<><path d="m6 6 12 12M18 6 6 18"/></>,
  chevron:<path d="m9 6 6 6-6 6"/>,
  layers:<><path d="m12 4 8 4-8 4-8-4 8-4Z"/><path d="m4 12 8 4 8-4M4 16l8 4 8-4"/></>,
  play:<path d="m9 6 10 6-10 6Z"/>,
  pause:<><path d="M8 6v12M16 6v12"/></>,
  arrow:<path d="M5 12h13M13 7l5 5-5 5"/>,
  pin:<><path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z"/><circle cx="12" cy="10" r="2"/></>
 };
 return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

export default function App(){
 const [series,setSeries]=useState<SeriesKey|"ALL">("ALL");
 const [year,setYear]=useState(2010);
 const [query,setQuery]=useState("");
 const [selectedLocation,setSelectedLocation]=useState<string|null>(null);
 const [selectedEpisode,setSelectedEpisode]=useState<string|null>(null);
 const [selectedCharacter,setSelectedCharacter]=useState<string|null>(null);
 const [view,setView]=useState<View>("map");
 const [dataErrors,setDataErrors]=useState<string[]>([]);
 const [zoom,setZoom]=useState(()=>1);
 const [pan,setPan]=useState(()=>({x:typeof window!=="undefined"&&window.innerWidth<700?MOBILE_HOME_X:0,y:typeof window!=="undefined"&&window.innerWidth<700?MOBILE_HOME_Y:0}));
 const [isDragging,setIsDragging]=useState(false);
 const [sheet,setSheet]=useState<"peek"|"open">("open");
 const [searchOpen,setSearchOpen]=useState(false);
 const [timeOpen,setTimeOpen]=useState(false);
 const [playing,setPlaying]=useState(false);
 const drag=useRef({x:0,y:0,px:0,py:0,moved:false});
 const gestureStart=useRef<number|null>(null);
 const gestureDistance=useRef(0);
 const pointers=useRef(new Map<number,{x:number;y:number}>());
 const pinch=useRef<{distance:number;zoom:number;x:number;y:number;midX:number;midY:number}|null>(null);
 const mapSvgRef=useRef<SVGSVGElement|null>(null);
 const raf=useRef<number|null>(null);
 const visual=useRef({x:typeof window!=="undefined"&&window.innerWidth<700?MOBILE_HOME_X:0,y:typeof window!=="undefined"&&window.innerWidth<700?MOBILE_HOME_Y:0,zoom:1});
 const [isMobileMap,setIsMobileMap]=useState(()=>typeof window!=="undefined"&&window.innerWidth<700);
 useEffect(()=>{initAtlasPerformance();void getRuntimeMeta().then(meta=>{if(meta)trackAtlasMetric("runtime-ready",1,{version:String(meta.version??"unknown"),episodes:Number(meta.counts?.episodes??0),characters:Number(meta.counts?.characters??0),locations:Number(meta.counts?.locations??0)})})},[]);

 useEffect(()=>setDataErrors(validateAtlasData()),[]);
 useEffect(()=>{const onResize=()=>setIsMobileMap(window.innerWidth<700);window.addEventListener("resize",onResize);return()=>window.removeEventListener("resize",onResize)},[]);
 useEffect(()=>{
   if(view!=="map")return;
   const frame=window.requestAnimationFrame(()=>{
     const limits=getMapPanLimits();
     const nextX=clamp(visual.current.x,-limits.x,limits.x);
     const nextY=clamp(visual.current.y,-limits.y,limits.y);
     visual.current={...visual.current,x:nextX,y:nextY};
     setPan(prev=>prev.x===nextX&&prev.y===nextY?prev:{x:nextX,y:nextY});
     applyMapTransform(nextX,nextY,visual.current.zoom,true);
   });
   return()=>window.cancelAnimationFrame(frame);
 },[view,isMobileMap]);
 const applyMapTransform=(x:number,y:number,z:number,animate=false)=>{
   const el=mapSvgRef.current;
   if(!el)return;
   el.style.transition=animate?"transform 140ms cubic-bezier(.2,.8,.2,1)":"none";
   el.style.transform="translate3d("+x+"px,"+y+"px,0) scale("+z+")";
 };
 useEffect(()=>{visual.current={x:pan.x,y:pan.y,zoom};applyMapTransform(pan.x,pan.y,zoom,true);},[pan.x,pan.y,zoom]);
 useEffect(()=>{if(view!=="map")setSheet("open");},[view]);
 useEffect(()=>{
   if(!playing)return;
   const id=window.setInterval(()=>setYear(y=>y>=2027?2010:y+1),900);
   return()=>window.clearInterval(id);
 },[playing]);
 useEffect(()=>{
   const onKey=(e:KeyboardEvent)=>{
     if((e.target as HTMLElement)?.tagName==="INPUT")return;
     if(e.key==="Escape"){setSearchOpen(false);setSelectedLocation(null);setSelectedEpisode(null);setSelectedCharacter(null)}
     if(e.key==="+"||e.key==="=")setZoomValue(zoom+0.5);
     if(e.key==="-"||e.key==="_")setZoomValue(zoom-0.5);
     if(e.key==="0")resetMap();
     if(e.key===" ") {e.preventDefault();setPlaying(v=>!v)}
   };
   window.addEventListener("keydown",onKey);
   return()=>window.removeEventListener("keydown",onKey);
 },[zoom]);

 const locations=useMemo(()=>atlasData.locations.filter(l=>{
   const meta=SERIES_BY_ID[l.seriesId];
   return !!meta&&(series==="ALL"||l.seriesId===META[series].id)&&l.year<=year;
 }),[series,year]);
 const chronology=useMemo(()=>buildChronology().filter(e=>e.start<=year&&(series==="ALL"||e.seriesId===META[series].id)),[series,year]);
 const episodes=useMemo(()=>chronology.filter(e=>e.kind==="episode"),[chronology]);
 const selectedLoc=atlasData.locations.find(l=>l.id===selectedLocation)??null;
 const selectedEp=episodes.find(e=>e.id===selectedEpisode)??null;

 const searchResults=useMemo(()=>{
   const q=query.trim().toLowerCase();
   if(!q)return [] as {kind:SearchKind;id:string;title:string;meta:string}[];
   const result:{kind:SearchKind;id:string;title:string;meta:string}[]=[];
   atlasData.locations.forEach(x=>{if([x.name,x.type].join(" ").toLowerCase().includes(q))result.push({kind:"location",id:x.id,title:x.name,meta:`${SERIES_BY_ID[x.seriesId]?.short} · ${x.year}`})});
   atlasData.characters.forEach(x=>{if(x.name.toLowerCase().includes(q))result.push({kind:"character",id:x.id,title:x.name,meta:"CHARACTER"})});
   atlasData.communities.forEach(x=>{if(x.name.toLowerCase().includes(q))result.push({kind:"community",id:x.id,title:x.name,meta:"COMMUNITY"})});
   atlasData.factions.forEach(x=>{if(x.name.toLowerCase().includes(q))result.push({kind:"faction",id:x.id,title:x.name,meta:"FACTION"})});
   atlasData.episodes.forEach((x:any)=>{if([x.title,x.seriesId,x.seasonId].join(" ").toLowerCase().includes(q))result.push({kind:"episode",id:x.id,title:x.title,meta:`${SERIES_BY_ID[x.seriesId]?.short} · S${String(x.seasonId).slice(-2)}E${String(x.episodeNumber).padStart(2,"0")}`})});
   return result.slice(0,12);
 },[query]);

 const setZoomValue=(v:number)=>setZoom(clamp(v,1,5));
 const getMapPanLimits=()=>{const el=mapSvgRef.current;if(!el)return {x:0,y:0};const w=el.clientWidth,h=el.clientHeight,vbW=1000,vbH=600,scale=Math.max(w/vbW,h/vbH)*visual.current.zoom;return {x:Math.max(0,(vbW*scale-w)/2),y:Math.max(0,(vbH*scale-h)/2)}};
 const resetMap=()=>{const homeX=isMobileMap?MOBILE_HOME_X:0;const homeY=isMobileMap?MOBILE_HOME_Y:0;visual.current={x:homeX,y:homeY,zoom:1};setZoom(1);setPan({x:homeX,y:homeY});trackAtlasMetric("map-reset",1,{mobile:isMobileMap});};
 const selectCharacter=(id:string)=>{const character=atlasData.characters.find((x:any)=>x.id===id) as any;if(!character)return;const ids=getCharacterEpisodeIds(id);const eps=ids.map(eid=>atlasData.episodes.find((e:any)=>e.id===eid)).filter(Boolean).sort((a:any,b:any)=>Number(a.timelineStart??a.timelineEnd??9999)-Number(b.timelineStart??b.timelineEnd??9999));const firstYear=eps[0]?.timelineStart??eps[0]?.timelineEnd;if(firstYear)setYear(Number(firstYear));setSelectedCharacter(id);setSelectedLocation(null);setSelectedEpisode(null);setView("people");setSheet("open");trackAtlasMetric("character-select",eps.length,{character:id});void getRuntimeRelationships("character",id).then(remote=>{if(remote)trackAtlasMetric("runtime-character-relationships",remote.episodeIds.length,{character:id,remoteIndexed:true})});};
 const selectLocation=(l:Location)=>{ const focusStarted=performance.now();
   void getRuntimeRelationships("location",l.id).then(remote=>{if(remote)trackAtlasMetric("runtime-location-relationships",remote.episodeIds.length,{location:l.id,remoteIndexed:true})});
   setYear(Number(l.year));setSelectedLocation(l.id);setSelectedEpisode(null);setView("map");setSheet("open");
   window.requestAnimationFrame(()=>window.requestAnimationFrame(()=>{
     const surface=mapSvgRef.current;
     if(!surface)return;
     const marker=[...surface.querySelectorAll<SVGGElement>(".marker")].find(el=>el.getAttribute("data-location-id")===l.id);
     if(!marker)return;
     const surfaceRect=surface.getBoundingClientRect(), markerRect=marker.getBoundingClientRect();
     const targetX=surfaceRect.left+surfaceRect.width/2;
     const targetY=surfaceRect.top+surfaceRect.height*.38;
     const dx=targetX-(markerRect.left+markerRect.width/2);
     const dy=targetY-(markerRect.top+markerRect.height/2);
     const limits=getMapPanLimits();
     const limit=Math.max(limits.x,limits.y);
     const nextX=clamp(visual.current.x+dx,-limit,limit);
     const nextY=clamp(visual.current.y+dy,-limit,limit);
     visual.current={...visual.current,x:nextX,y:nextY};
     applyMapTransform(nextX,nextY,visual.current.zoom,true);
     setPan({x:nextX,y:nextY});trackAtlasMetric("location-focus",performance.now()-focusStarted,{location:l.id,linkedEpisodes:getLocationEpisodeIds(l.id).length});
   }));
 };
 const setYearForEpisode=(raw:any)=>{const storyYear=raw?.timelineStart ?? raw?.timelineEnd ?? raw?.airDate?.slice(0,4);if(storyYear)setYear(Number(storyYear))};
 const selectEpisode=(id:string)=>{const raw=atlasData.episodes.find((e:any)=>e.id===id) as any;setYearForEpisode(raw);setSelectedEpisode(id);setSelectedLocation(null);setView("timeline");setSheet("open")};
 const focusEpisodeGeography=(raw:any)=>{ const focusStarted=performance.now();
   const ids=(raw?.locationIds??[]) as string[];
   if(!ids.length)return;
   window.requestAnimationFrame(()=>window.requestAnimationFrame(()=>{
     const surface=mapSvgRef.current;
     if(!surface)return;
     const rect=surface.getBoundingClientRect();
     const centers=ids.map(id=>surface.querySelector<SVGGElement>(".marker[data-location-id=\""+id+"\"]")).filter(Boolean).map(el=>{
       const r=(el as SVGGElement).getBoundingClientRect();
       return {x:r.left+r.width/2,y:r.top+r.height/2};
     });
     if(!centers.length)return;
     const markerX=centers.reduce((sum,p)=>sum+p.x,0)/centers.length;
     const markerY=centers.reduce((sum,p)=>sum+p.y,0)/centers.length;
     const targetX=rect.left+rect.width*.5;
     const targetY=rect.top+rect.height*.38;
     const limits=getMapPanLimits(); const nextXLimit=limits.x; const nextYLimit=limits.y;
     const nextX=clamp(visual.current.x+(targetX-markerX),-nextXLimit,nextXLimit);
     const nextY=clamp(visual.current.y+(targetY-markerY),-nextYLimit,nextYLimit);
     visual.current={...visual.current,x:nextX,y:nextY};
     applyMapTransform(nextX,nextY,visual.current.zoom,true);
     setPan({x:nextX,y:nextY});trackAtlasMetric("episode-geography-focus",performance.now()-focusStarted,{episode:raw?.id||"",locations:ids.length});
   }));
 };
 const selectAtlasEpisode=(id:string)=>{const raw=atlasData.episodes.find((e:any)=>e.id===id) as any;setYearForEpisode(raw);setSelectedEpisode(id);setSelectedLocation(null);setView("map");setSheet("open");focusEpisodeGeography(raw)};

 const pointerDown=(e:React.PointerEvent<SVGSVGElement>)=>{
   e.preventDefault();
   e.currentTarget.setPointerCapture?.(e.pointerId);
   pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});
   if(gestureStart.current===null)gestureStart.current=performance.now();
   if(pointers.current.size===2){
     const p=[...pointers.current.values()];
     pinch.current={distance:Math.max(1,Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y)),zoom:visual.current.zoom,x:visual.current.x,y:visual.current.y,midX:(p[0].x+p[1].x)/2,midY:(p[0].y+p[1].y)/2};
     drag.current.moved=true;
     setIsDragging(true);
     return;
   }
   drag.current={x:e.clientX,y:e.clientY,px:visual.current.x,py:visual.current.y,moved:false};
   setIsDragging(true);
 };
 const pointerMove=(e:React.PointerEvent<SVGSVGElement>)=>{
   if(!pointers.current.has(e.pointerId))return;
   e.preventDefault();
   pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});
   let nextX=visual.current.x,nextY=visual.current.y,nextZoom=visual.current.zoom;
   if(pointers.current.size>=2&&pinch.current){
     const p=[...pointers.current.values()].slice(0,2);
     const d=Math.max(1,Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y));
     nextZoom=clamp(pinch.current.zoom*d/pinch.current.distance,1,5);
     const rect=mapSvgRef.current?.getBoundingClientRect();
     if(rect){
       const centerX=rect.left+rect.width/2,centerY=rect.top+rect.height/2;
       const midX=(p[0].x+p[1].x)/2,midY=(p[0].y+p[1].y)/2;
       const ratio=nextZoom/pinch.current.zoom;
       nextX=(midX-centerX)*(1-ratio)+ratio*pinch.current.x;
       nextY=(midY-centerY)*(1-ratio)+ratio*pinch.current.y;
       const limits=getMapPanLimits();
       nextX=clamp(nextX,-limits.x,limits.x);nextY=clamp(nextY,-limits.y,limits.y);
     }
     gestureDistance.current+=d;
     drag.current.moved=true;
   }else{
     const dx=e.clientX-drag.current.x,dy=e.clientY-drag.current.y;
     if(Math.abs(dx)+Math.abs(dy)>4)drag.current.moved=true;
     const limits=getMapPanLimits();
     nextX=clamp(drag.current.px+dx,-limits.x,limits.x);
     nextY=clamp(drag.current.py+dy,-limits.y,limits.y);
   }
   visual.current={x:nextX,y:nextY,zoom:nextZoom};
   if(raf.current!==null)cancelAnimationFrame(raf.current);
   raf.current=requestAnimationFrame(()=>{raf.current=null;applyMapTransform(nextX,nextY,nextZoom,false)});
 };
 const pointerUp=(e:React.PointerEvent<SVGSVGElement>)=>{
   pointers.current.delete(e.pointerId);
   try{e.currentTarget.releasePointerCapture?.(e.pointerId)}catch{}
   if(pointers.current.size===1){
     const p=[...pointers.current.entries()][0];
     pinch.current=null;
     drag.current={x:p[1].x,y:p[1].y,px:visual.current.x,py:visual.current.y,moved:true};
     return;
   }
   if(pointers.current.size===0){
     const duration=gestureStart.current===null?0:performance.now()-gestureStart.current;
     if(drag.current.moved)trackAtlasMetric("map-gesture",duration,{zoom:visual.current.zoom,distance:gestureDistance.current});
     trackAtlasMetric("map-gesture-distance",gestureDistance.current,{zoom:visual.current.zoom});
     gestureStart.current=null;gestureDistance.current=0;
     pinch.current=null;
     const final=visual.current;
     setPan({x:final.x,y:final.y});setZoom(final.zoom);setIsDragging(false);
   }
 };
 const wheel=(e:React.WheelEvent<SVGSVGElement>)=>{e.preventDefault();const next=clamp(visual.current.zoom*(e.deltaY<0?1.12:.89),1,5);visual.current.zoom=next;applyMapTransform(visual.current.x,visual.current.y,next,false);setZoom(next)};
 const goView=(v:View)=>{setView(v);setSelectedLocation(null);setSelectedEpisode(null);setSelectedCharacter(null);setSheet("open")};
 const mapYearCount=locations.length;
 const visibleSeries=series==="ALL"?"THE WORLD":META[series].short;

 return <div className="app">
  <header className="topbar">
   <button className="brand" onClick={()=>{setView("map");setSelectedLocation(null);setSelectedEpisode(null)}} aria-label="Return to atlas map">
    <span className="logoMark">◈</span><span><b>TWDU ATLAS</b><small>THE WALKING DEAD UNIVERSE · FIELD GUIDE</small></span>
   </button>
   <button className="mobileSearchButton" onClick={()=>setSearchOpen(true)} aria-label="Open atlas search"><Icon name="search"/></button>
   <div className="searchWrap">
    <Icon name="search"/>
    <input value={query} onFocus={()=>setSearchOpen(true)} onChange={e=>{setQuery(e.target.value);setSearchOpen(true)}} placeholder="Search a place, person, episode…" aria-label="Search atlas"/>
    {query&&<button className="clearSearch" onClick={()=>{setQuery("");setSearchOpen(false)}} aria-label="Clear atlas search"><Icon name="close"/></button>}
    {searchOpen&&query&&<div className="searchResults">{searchResults.length?searchResults.map(r=><button key={r.kind+r.id} onClick={()=>{if(r.kind==="location"){const l=atlasData.locations.find(x=>x.id===r.id);if(l)selectLocation(l)}else if(r.kind==="episode")selectEpisode(r.id);else if(r.kind==="character")selectCharacter(r.id);else{setView("people");setSheet("open")}setQuery("");setSearchOpen(false)}}><span className="resultIcon">{r.kind==="episode"?"EP":r.kind.slice(0,2).toUpperCase()}</span><span className="resultText"><b>{r.title}</b><small>{r.meta}</small></span><Icon name="chevron"/></button>):<div className="emptySearch">No matching atlas records.</div>}</div>}
   </div>
   <div className="headerMeta"><span>LIVE ATLAS</span><b>{year}</b></div>
  </header>

  <main className="atlasMain">
   <section className={"map view-"+view+(selectedLocation||selectedEpisode?" detailOpen":"")} aria-label="Interactive Walking Dead Universe map">
    <div className="mapAtmosphere"/>
    <div className="mapSurface" ref={mapSvgRef}>
     <svg viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid slice" className={isDragging?"dragging":""} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} onWheel={wheel}>
      <defs>
       <linearGradient id="ocean" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#9fb2b4"/><stop offset=".48" stopColor="#82999d"/><stop offset="1" stopColor="#60777b"/></linearGradient>
       <linearGradient id="land" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#d8d3c5"/><stop offset=".55" stopColor="#b9b7aa"/><stop offset="1" stopColor="#96988e"/></linearGradient>
       <radialGradient id="oceanGlow" cx=".5" cy=".38" r=".72"><stop offset="0" stopColor="#c7d4d4" stopOpacity=".55"/><stop offset="1" stopColor="#51696e" stopOpacity=".08"/></radialGradient>
       <filter id="landShadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="5" stdDeviation="5" floodColor="#26383a" floodOpacity=".28"/></filter>
       <filter id="paperNoise"><feTurbulence type="fractalNoise" baseFrequency=".65" numOctaves="2" stitchTiles="stitch" result="noise"/><feColorMatrix in="noise" type="saturate" values="0" result="gray"/><feComponentTransfer><feFuncA type="table" tableValues="0 .055"/></feComponentTransfer><feBlend in="SourceGraphic" in2="gray" mode="multiply"/></filter>
      </defs>
      <g className="mapWorld" transform={isMobileMap?"translate(95 50) scale(1.45)":undefined}>
      <rect width="1000" height="600" fill="url(#ocean)"/>
      <rect width="1000" height="600" fill="url(#oceanGlow)"/>
      <g className="graticule"><path d={pathGenerator({type:"Sphere"}) as string}/></g>
      <path className="landShadow" d={pathGenerator(worldLand) as string} fill="#26383a" opacity=".28"/>
      <g className="countries">{worldCountries.features.map((c:any,i:number)=><path key={c.id||c.properties?.name} d={pathGenerator(c) as string} fill={countryTone(i)}><title>{c.properties?.name||"Country"}</title></path>)}</g>
      {zoom>1.12&&<g className="mapLabels"><text x="184" y="350">NORTH AMERICA</text><text x="557" y="150">EUROPE</text><text x="782" y="360">ASIA</text></g>}
      <g className="markers">{locations.map(l=>{const p=project(l.lat,l.lng),meta=SERIES_BY_ID[l.seriesId];return <g key={l.id} data-location-id={l.id} className={selectedLocation===l.id?"marker selected":"marker"} transform={`translate(${p.x} ${p.y})`} role="button" tabIndex={0} aria-label={`Open ${l.name} location`} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();selectLocation(l)}}} onPointerUp={e=>{if(!drag.current.moved){e.stopPropagation();selectLocation(l)}}}>
       <circle className="markerHit" r={isMobileMap?14:9} fill="transparent"/><circle className="pulse" r="2.5" style={{stroke:meta.color}}/><circle className="dot" r="1.5" fill={meta.color}/>{(!isMobileMap&&(zoom>1.34||selectedLocation===l.id|| (l.year<=year&&l.name.length<22&&["Alexandria","Hilltop","King County","Woodbury","Oceanside","Commonwealth","Terminus"].includes(l.name))))&&<text x="5" y=".5" className="markerLabel">{l.name}</text>}
      </g>})}</g>
     </g>
     </svg>
    </div>

    <div className="mapChrome mapTopLeft">
      <div className="locationKicker"><span className="liveDot"/>{visibleSeries}<span className="mapModeTag">MAP</span></div>
      <strong>{mapYearCount} <small>LOCATIONS · {year}</small></strong>
    </div>

    <div className="mapChrome mapTopRight">
      <button onClick={()=>setZoomValue(zoom+.5)} aria-label="Zoom in"><Icon name="plus"/></button>
      <button onClick={()=>setZoomValue(zoom-.5)} aria-label="Zoom out"><Icon name="minus"/></button>
      <button onClick={resetMap} aria-label="Reset map"><Icon name="locate"/></button>
      <div className="zoomBadge">{Math.round(zoom*100)}%</div>
    </div>

    <div className="mapCompass" aria-hidden="true"><span>N</span><i></i><small>1:50m</small></div>
    <div className={`mapLegend ${sheet==="open"?"sheetOpen":""}`} aria-label="Map legend"><small>SERIES LAYER</small>{SERIES_KEYS.map(k=><span key={k}><i style={{background:META[k].color}}/>{META[k].short}</span>)}</div>

    {view==="map"&&!selectedLocation&&!selectedEpisode&&<div className="seriesRail" aria-label="Series filter"><span className="seriesRailHint" aria-hidden="true">SWIPE</span>
      <button className={series==="ALL"?"active":""} aria-pressed={series==="ALL"} onClick={()=>setSeries("ALL")}>ALL</button>
      {SERIES_KEYS.map(k=><button key={k} aria-pressed={series===k} className={series===k?"active":""} style={series===k?{"--series":META[k].color} as CSSProperties:{}} onClick={()=>setSeries(k)}>{META[k].short}</button>)}
    </div>}

    {!isMobileMap&&<AtlasTimelineDock year={year} onYearChange={y=>{setPlaying(false);setYear(y)}} series={series} onEpisode={selectAtlasEpisode} selectedEpisode={selectedEpisode} playing={playing} onTogglePlaying={()=>setPlaying(v=>!v)} onConnections={()=>goView("people")}/>}\n\n    {isMobileMap&&view==="map"&&!selectedLocation&&!selectedEpisode&&!selectedCharacter&&<MobileTimeBar year={year} playing={playing} onYearChange={y=>{setPlaying(false);setYear(y)}} onTogglePlaying={()=>setPlaying(v=>!v)}/>}\n\n    <div className={`timeMachine ${sheet==="open"?"sheetOpen":""}`}>
      <div className="timeMachineHead"><div><small>UNIVERSE TIME</small><b>{year}</b></div><button onClick={()=>setPlaying(v=>!v)} aria-label={playing?"Pause chronology":"Play chronology"}><Icon name={playing?"pause":"play"}/></button></div>
      <input aria-label="Universe year" type="range" min="2010" max="2027" value={year} onChange={e=>{setPlaying(false);setYear(Number(e.target.value))}}/>
      <div className="timeScale"><span>2010 · OUTBREAK</span><span>2014</span><span>2018</span><span>2022</span><span>2027</span></div>
    </div>

    {searchOpen&&<div className="searchOverlay"><div className="searchOverlayHead"><b>SEARCH THE ATLAS</b><button onClick={()=>setSearchOpen(false)} aria-label="Close search"><Icon name="close"/></button></div><div className="searchOverlayInput"><Icon name="search"/><input autoFocus value={query} onChange={e=>setQuery(e.target.value)} placeholder="Place, person, episode, faction…"/>{query&&<button onClick={()=>setQuery("")}><Icon name="close"/></button>}</div>{query&&<div className="searchOverlayResults">{searchResults.length?searchResults.map(r=><button key={r.kind+r.id} onClick={()=>{if(r.kind==="location"){const l=atlasData.locations.find(x=>x.id===r.id);if(l)selectLocation(l)}else if(r.kind==="episode")selectEpisode(r.id);else if(r.kind==="character")selectCharacter(r.id);else{setView("people");setSheet("open")}setQuery("");setSearchOpen(false)}}><span className="resultIcon">{r.kind==="episode"?"EP":r.kind.slice(0,2).toUpperCase()}</span><span className="resultText"><b>{r.title}</b><small>{r.meta}</small></span><Icon name="chevron"/></button>):<div className="emptySearch">No matching atlas records.</div>}</div>}</div>}

    <section className={`contentPanel ${sheet} ${selectedLoc||selectedEp||selectedCharacter?"hasDetail":""}`}>
      <button className="panelGrab" onClick={()=>setSheet(v=>v==="open"?"peek":"open")} aria-expanded={sheet==="open"} aria-label={sheet==="open"?"Collapse information panel":"Expand information panel"}><span/></button>
      <div className={`panelHeader ${selectedLoc||selectedEp||selectedCharacter?"detailHeader":""}`}>
       <div><small>{selectedLoc?SERIES_BY_ID[selectedLoc.seriesId]?.name:selectedEp?SERIES_BY_ID[selectedEp.seriesId]?.name:view==="map"?"ATLAS":"TWDU ATLAS"}</small><h2>{selectedLoc?.name||selectedEp?.title||((selectedCharacter&&atlasData.characters.find((x:any)=>x.id===selectedCharacter)?.name)||null)||(view==="map"?`${year} · ${mapYearCount} mapped`:view==="timeline"?"Chronology":"Field guide")}</h2></div>
       {(selectedLoc||selectedEp||selectedCharacter)&&<button className="closePanel" onClick={()=>{setSelectedLocation(null);setSelectedEpisode(null);setSelectedCharacter(null)}} aria-label="Close details"><Icon name="close"/></button>}
      </div>
      {selectedLoc?<LocationDetail location={selectedLoc} onEpisode={selectEpisode}/>:selectedEp?<EpisodeDetail episode={selectedEp} onLocation={selectLocation} onEpisode={selectEpisode}/>:selectedCharacter?<CharacterDetail characterId={selectedCharacter} onEpisode={selectEpisode} onLocation={selectLocation} onCharacter={selectCharacter}/>:view==="map"?<MapContent locations={locations} onSelect={selectLocation}/>:view==="timeline"?<TimelineContent episodes={episodes} onEpisode={selectEpisode}/>:view==="people"?<PeopleContent onCharacter={selectCharacter} onLocation={id=>{const l=atlasData.locations.find(x=>x.id===id);if(l)selectLocation(l)}} onEpisode={selectEpisode}/>:<GuideContent errors={dataErrors} onView={goView}/>}
    </section>

    <nav className="bottomNav" aria-label="Atlas sections">
      {(["map","timeline","people","guide"] as View[]).map(v=><button key={v} aria-current={view===v?"page":undefined} className={view===v?"active":""} onClick={()=>goView(v)}><Icon name={v==="map"?"map":v==="timeline"?"timeline":v==="people"?"people":"guide"}/><small>{v==="map"?"MAP":v==="timeline"?"TIME":v==="people"?"PEOPLE":"GUIDE"}</small></button>)}
    </nav>
   </section>
  </main>
 </div>;
}

function LocationDetail({location,onEpisode}:{location:Location;onEpisode:(id:string)=>void}){\n const [runtimeEpisodeIds,setRuntimeEpisodeIds]=useState<string[]|null>(null);\n useEffect(()=>{let active=true;void getRuntimeEpisodeIds("location",location.id).then(ids=>{if(active)setRuntimeEpisodeIds(ids)});return()=>{active=false}},[location.id]);const meta=SERIES_BY_ID[location.seriesId];const placeMedia=(atlasData as any).media?.places?.[location.id];const curatedIds=runtimeEpisodeIds??getLocationEpisodeIds(location.id);const strictEpisodes=atlasData.episodes.filter((e:any)=>(e.locationIds??[]).includes(location.id));const strictIds=new Set(strictEpisodes.map((e:any)=>e.id));const historicalEpisodes=curatedIds.filter(id=>!strictIds.has(id)).map(id=>atlasData.episodes.find((e:any)=>e.id===id)).filter(Boolean) as any[];const episodes=[...strictEpisodes];const events=atlasData.events.filter((e:any)=>e.locationIds?.includes(location.id));return <div className="contentScroll"><div className="entityHero" style={{"--accent":meta.color} as CSSProperties}>{placeMedia?.image&&<img src={atlasImageUrl(placeMedia.image,1200)} onError={e=>onAtlasImageError(e,placeMedia.image)} srcSet={atlasImageSrcSet(placeMedia.image)} sizes="(max-width: 699px) 92vw, 470px" loading="eager" decoding="async" alt="" className="entityArt"/>}<div className="entityHeroCopy"><span>{meta.short} · {location.year}</span><h3>{location.name}</h3><p>{location.type} · {location.certainty}</p></div></div><div className="detailGrid"><div><small>TYPE</small><b>{location.type}</b></div><div><small>ERA</small><b>{location.year}+</b></div><div><small>DIRECT EPISODES</small><b>{strictEpisodes.length}</b></div><div><small>HISTORY LINKS</small><b>{historicalEpisodes.length}</b></div></div><div className="sectionTitle">DIRECT EPISODE PRESENCE <span>{episodes.length}</span></div>{episodes.length?<div className="cards">{episodes.map((e:any)=><button className="entityCard episodeCard" key={e.id} onClick={()=>onEpisode(e.id)}><span className="episodeYear">{e.timelineStart||"?"}</span><span><small>{meta.short} · S{String(e.seasonId).slice(-2)}E{String(e.episodeNumber).padStart(2,"0")}</small><b>{e.title}</b><em>{e.certainty} · {e.timelinePrecision}</em></span><Icon name="chevron"/></button>)}</div>:<p className="muted">No direct episode geography link has been recorded.</p>}{historicalEpisodes.length>0&&<><div className="sectionTitle">HISTORICAL REFERENCES <span>{historicalEpisodes.length}</span></div><div className="historicalLinks">{historicalEpisodes.map((e:any)=><button key={e.id} onClick={()=>onEpisode(e.id)}><span><small>CURATED HISTORY · {SERIES_BY_ID[e.seriesId]?.short}</small><b>{e.title}</b><em>{e.timelineStart||"?"} · broader location association</em></span><Icon name="chevron"/></button>)}</div></>}{events.length>0&&<><div className="sectionTitle">MAJOR EVENTS <span>{events.length}</span></div><div className="timelineList">{events.map((e:any)=><article key={e.id}><strong>{e.year}</strong><div><small>EVENT · {meta.short}</small><b>{e.title}</b><span>{e.certainty}</span></div></article>)}</div></>}<div className="sourceNote"><Icon name="pin"/><span>Direct episode geography is kept separate from curated historical references. Approximate placements remain explicitly labeled.</span></div></div>;}
function EpisodeDetail({episode,onLocation,onEpisode}:{episode:any;onLocation:(l:Location)=>void;onEpisode:(id:string)=>void}){
 const raw=atlasData.episodes.find((e:any)=>e.id===episode.id) as any;
 const meta=SERIES_BY_ID[episode.seriesId];
 const derivedConnectionIds=getEpisodeConnectionIds(episode.id);
 const media=((atlasData as any).media?.episodes?.[episode.id] ?? (episodeMedia as any).episodes?.[episode.id] ?? (atlasData as any).media?.series?.[episode.seriesId]);
 const locations=atlasData.locations.filter(l=>raw?.locationIds?.includes(l.id));
 const ordered=buildChronology().filter(x=>x.kind==="episode");
 const index=ordered.findIndex(x=>x.id===episode.id);
 const prev=ordered[index-1],next=ordered[index+1];
 return <div className="contentScroll">
  <div className="episodeHero" style={{"--accent":meta.color} as CSSProperties}>{media?.image&&<img src={atlasImageUrl(media.image,1200)} onError={e=>onAtlasImageError(e,media.image)} srcSet={atlasImageSrcSet(media.image)} sizes="(max-width: 699px) 94vw, 470px" loading="eager" decoding="async" fetchPriority="high" alt="" className="episodeArt"/>}<div className="episodeHeroCopy"><span>{meta.name} · {episode.seasonId?.toUpperCase()}E{String(episode.episodeNumber).padStart(2,"0")}</span><h3>{episode.title}</h3><div className="episodeMeta"><b>{episode.start===episode.end?episode.start:`${episode.start}–${episode.end}`}</b><em>{episode.certainty}</em><em>{episode.precision}</em></div></div></div>
  {locations.length>0&&<><div className="sectionTitle">LOCATIONS <span>{locations.length}</span></div><div className="miniTags locationLinks">{locations.map(l=><button key={l.id} onClick={()=>onLocation(l)}><Icon name="pin"/>{l.name}</button>)}</div></>}
  {derivedConnectionIds.length>0&&<><div className="sectionTitle">UNIVERSE CONNECTIONS <span>{derivedConnectionIds.length}</span></div><div className="connectionLinks">{derivedConnectionIds.map((id:string)=>{const c=atlasData.connections.find((x:any)=>x.id===id);const evidence=(atlasData as any).connectionEpisodes?.connections?.[id];return c?<article key={id}><small>{c.type.replaceAll("-"," ").toUpperCase()} · {evidence?.evidenceKind==="direct"?"EPISODE EVIDENCE":"CURATED CONTEXT"}</small><b>{c.label}</b><span>{c.fromId} ↔ {c.toId} · {c.certainty}</span></article>:null})}</div></>}
  <div className="sectionTitle">CHRONOLOGY NAVIGATION</div>
  <div className="episodeNav">{prev&&<button onClick={()=>onEpisode(prev.id)}><small>PREVIOUS</small><b>{prev.title}</b><span>{prev.start}</span></button>}<div className="chronologyMarker"><span>IN UNIVERSE</span><strong>{episode.start}</strong></div>{next&&<button onClick={()=>onEpisode(next.id)}><small>NEXT</small><b>{next.title}</b><span>{next.start}</span></button>}</div>
  <div className="sourceNote"><Icon name="layers"/><span>Air date and in-universe chronology are separate fields. Ranges and uncertain placements stay labeled rather than flattened.</span></div>
 </div>;
}

function MapContent({locations,onSelect}:{locations:Location[];onSelect:(l:Location)=>void}){
 return <div className="contentScroll">
  <div className="panelSummary"><div><small>ACTIVE MAP LAYER</small><b>{locations.length} mapped locations</b></div><span>2010–{Math.max(...locations.map(x=>x.year),2010)}</span></div>
  <div className="sectionTitle">MAPPED LOCATIONS <span>{locations.length}</span></div>
  <div className="cards">{locations.map(l=>{const pm=(atlasData as any).media?.places?.[l.id];return <button className="entityCard locationCard" key={l.id} onClick={()=>onSelect(l)}>{pm?.image&&<img src={atlasImageUrl(pm.image,720)} onError={e=>onAtlasImageError(e,pm.image)} srcSet={atlasImageSrcSet(pm.image,[360,540,720])} sizes="180px" loading="lazy" decoding="async" alt="" className="cardArt"/>}<span><small>{SERIES_BY_ID[l.seriesId]?.short} · {l.year}</small><b>{l.name}</b><em>{l.type} · {l.certainty}</em></span><Icon name="chevron"/></button>})}</div>
 </div>
}

function TimelineContent({episodes,onEpisode}:{episodes:any[];onEpisode:(id:string)=>void}){const [filter,setFilter]=useState<string>("ALL");const available=useMemo(()=>Object.keys(META) as SeriesKey[],[]);const visible=useMemo(()=>filter==="ALL"?episodes:episodes.filter(e=>e.seriesId===META[filter as SeriesKey].id),[episodes,filter]);const latest=episodes.reduce((n,e)=>Math.max(n,Number(e.start??0)),0);return <div className="contentScroll"><div className="timelineIntro"><span>UNIVERSE TIME</span><h3>Follow the story through in-universe chronology.</h3><p>Episodes are ordered by story time. Air dates and certainty remain visible inside each episode.</p></div><div className="timelineSnapshot"><div><small>VISIBLE EPISODES</small><b>{visible.length}</b><span>{latest||"—"} latest story year</span></div><div><small>ACTIVE SERIES</small><b>{available.length}</b><span>series represented in this layer</span></div></div><div className="timelineFilters" aria-label="Timeline series filters"><button className={filter==="ALL"?"active":""} onClick={()=>setFilter("ALL")}>ALL <span>{episodes.length}</span></button>{available.map(key=>{const count=episodes.filter(e=>e.seriesId===META[key].id).length;return <button key={key} disabled={!count} className={filter===key?"active":""} onClick={()=>count&&setFilter(key)}>{META[key].short} <span>{count}</span></button>})}</div><div className="sectionTitle">EPISODES <span>{visible.length}</span></div><div className="timelineList episodeList timelineCards">{visible.map((e:any)=>{const em=(episodeMedia as any).episodes?.[e.id];const mediaAvailable=Boolean(em?.image);const mediaVerified=em?.status==="verified";return <button className={mediaAvailable?"episodeRow mediaRow hasMedia":"episodeRow mediaRow"} key={e.id} onClick={()=>onEpisode(e.id)}>{mediaAvailable&&<span className="rowMedia"><img src={atlasImageUrl(em.image,240)} onError={e=>onAtlasImageError(e,em.image)} srcSet={atlasImageSrcSet(em.image,[160,240,360])} sizes="80px" loading="lazy" decoding="async" alt="" className="rowThumb"/></span>}<strong>{e.start||"?"}</strong><span><small>{SERIES_BY_ID[e.seriesId]?.short} · S{String(e.seasonId).slice(-2)}E{String(e.episodeNumber).padStart(2,"0")}</small><b>{e.title}</b><em>{e.precision} · {e.certainty}</em></span><i className={mediaVerified?"mediaIndicator verified":mediaAvailable?"mediaIndicator fallback":"mediaIndicator"} aria-label={mediaVerified?"Verified official episode media":mediaAvailable?"AMC series key art fallback":"No episode media available"}/><Icon name="chevron"/></button>})}</div></div>}
function CharacterDetail({characterId,onEpisode,onLocation,onCharacter}:{characterId:string;onEpisode:(id:string)=>void;onLocation:(l:Location)=>void;onCharacter:(id:string)=>void}){\n const [runtimeEpisodeIds,setRuntimeEpisodeIds]=useState<string[]|null>(null);\n useEffect(()=>{let active=true;void getRuntimeEpisodeIds("character",characterId).then(ids=>{if(active)setRuntimeEpisodeIds(ids)});return()=>{active=false}},[characterId]);
 const character=atlasData.characters.find((x:any)=>x.id===characterId) as any;
 if(!character)return null;
 const eps=(runtimeEpisodeIds??getCharacterEpisodeIds(characterId)).map(id=>atlasData.episodes.find((e:any)=>e.id===id)).filter(Boolean).sort((a:any,b:any)=>{
   const ay=Number(a.timelineStart??a.timelineEnd??9999), by=Number(b.timelineStart??b.timelineEnd??9999);
   return ay-by || Number(a.episodeNumber??0)-Number(b.episodeNumber??0);
 });
 const locations=[...new Set(eps.flatMap((e:any)=>e.locationIds??[]))].map(id=>atlasData.locations.find(l=>l.id===id)).filter(Boolean) as Location[];
 const links=atlasData.connections.filter((x:any)=>x.fromId===characterId||x.toId===characterId);
 const neighborhood=getEntityNeighborhood("character",characterId).slice(0,16);
 const media=(atlasData as any).media?.characters?.[characterId];
 const graphLabel=(ref:{kind:string;id:string})=>{const pools:any={episode:atlasData.episodes,location:atlasData.locations,character:atlasData.characters,community:atlasData.communities,faction:atlasData.factions,connection:atlasData.connections,series:atlasData.series,season:atlasData.seasons};const item=pools[ref.kind]?.find((x:any)=>x.id===ref.id);return item?.name||item?.title||item?.label||ref.id};
 const endpointName=(id:string)=>{const pools:any=[atlasData.characters,atlasData.locations,atlasData.communities,atlasData.factions,atlasData.series,atlasData.connections];for(const pool of pools){const item=pool.find((x:any)=>x.id===id);if(item)return item.name||item.title||item.label||id}return id};
 const seriesSpans=useMemo(()=>{
   const spans:any[]=[];
   eps.forEach((e:any)=>{
     const key=e.seriesId;
     const last=spans[spans.length-1];
     if(last?.seriesId===key){last.count+=1;last.end=Number(e.timelineEnd??e.timelineStart??last.end);}
     else spans.push({seriesId:key,count:1,start:Number(e.timelineStart??e.timelineEnd??0),end:Number(e.timelineEnd??e.timelineStart??0)});
   });
   return spans;
 },[characterId,eps.length]);
 return <div className="contentScroll">
  <div className="entityHero characterEntityHero" style={{"--accent":SERIES_BY_ID[character.seriesIds?.[0]]?.color||"#aab7b3"} as CSSProperties}>
   {media?.image&&<img src={atlasImageUrl(media.image,1200)} onError={e=>onAtlasImageError(e,media.image)} srcSet={atlasImageSrcSet(media.image)} sizes="(max-width: 699px) 92vw, 470px" loading="eager" decoding="async" alt="" className="entityArt"/>}
   <div className="entityHeroCopy"><span>CHARACTER · {(character.seriesIds||[]).map((id:string)=>SERIES_BY_ID[id]?.short).filter(Boolean).join(" · ")}</span><h3>{character.name}</h3><p>{character.certainty||"tracked"} · {eps.length} linked episodes</p></div>
  </div>
  <div className="detailGrid"><div><small>EPISODES</small><b>{eps.length}</b></div><div><small>LOCATIONS</small><b>{locations.length}</b></div><div><small>SERIES</small><b>{(character.seriesIds||[]).length}</b></div><div><small>LINKS</small><b>{links.length}</b></div></div>
  <div className="sectionTitle">SERIES JOURNEY <span>{seriesSpans.length}</span></div>
  {seriesSpans.length?<div className="journeyRail">{seriesSpans.map((span:any,i:number)=><div className="journeySegment" key={span.seriesId+i} style={{"--accent":SERIES_BY_ID[span.seriesId]?.color||"#8f9b9c"} as CSSProperties}><span>{SERIES_BY_ID[span.seriesId]?.short||span.seriesId}</span><b>{span.count}</b><small>{span.start}{span.end!==span.start?"–"+span.end:""}</small>{i<seriesSpans.length-1&&<i aria-hidden="true">→</i>}</div>)}</div>:<p className="muted">No episode-level character links have been recorded yet.</p>}
  <div className="sectionTitle">EPISODE JOURNEY <span>{eps.length}</span></div>
  {eps.length?<div className="timelineList characterJourney">{eps.map((e:any,i:number)=>{
    const previous=eps[i-1]; const transitioned=!!previous&&previous.seriesId!==e.seriesId;
    return <div key={e.id}>{transitioned&&<div className="journeyTransition"><span>UNIVERSE TRANSITION</span><b>{SERIES_BY_ID[previous.seriesId]?.short} → {SERIES_BY_ID[e.seriesId]?.short}</b></div>}<button onClick={()=>onEpisode(e.id)}><strong>{e.timelineStart??"?"}</strong><div><small>{SERIES_BY_ID[e.seriesId]?.short} · S{String(e.seasonId).slice(-2)}E{String(e.episodeNumber).padStart(2,"0")}</small><b>{e.title}</b><span>{(e.locationIds||[]).length} locations · {e.certainty}</span></div><Icon name="chevron"/></button></div>;
  })}</div>:null}
  <div className="sectionTitle">GEOGRAPHY <span>{locations.length}</span></div>
  <div className="miniTags locationLinks">{locations.map(l=><button key={l.id} onClick={()=>onLocation(l)}><Icon name="pin"/>{l.name}</button>)}</div>
  {links.length>0&&<><div className="sectionTitle">DOCUMENTED CONNECTIONS <span>{links.length}</span></div><div className="connectionLinks">{links.map((x:any)=>{
    const other=x.fromId===characterId?x.toId:x.fromId;
    const otherCharacter=atlasData.characters.find((c:any)=>c.id===other);
    return <article key={x.id}><small>{x.type.replaceAll("-"," ").toUpperCase()} · {x.certainty}</small><b>{x.label}</b>{otherCharacter?<button className="connectionTarget" onClick={()=>onCharacter(otherCharacter.id)}>{otherCharacter.name}<Icon name="chevron"/></button>:<span>{endpointName(x.fromId)} → {endpointName(x.toId)}</span>}</article>;
  })}</div></>}
  {neighborhood.length>0&&<><div className="sectionTitle">ENTITY GRAPH <span>{neighborhood.length}</span></div><div className="connectionLinks graphLinks">{neighborhood.map((x:any,i:number)=><article key={x.ref.kind+x.ref.id+i}><small>{x.type} · {x.ref.kind.toUpperCase()}</small><b>{graphLabel(x.ref)}</b><span>{x.confidence}</span></article>)}</div></>}
 </div>;
}
function PeopleContent({onCharacter,onLocation,onEpisode}:{onCharacter:(id:string)=>void;onLocation:(id:string)=>void;onEpisode:(id:string)=>void}){
 const [query,setQuery]=useState("");
 const q=query.trim().toLowerCase();
 const characters=atlasData.characters.filter((c:any)=>!q||c.name.toLowerCase().includes(q));
 return <div className="contentScroll">
  <div className="peopleHero"><div><small>PEOPLE INDEX</small><b>{atlasData.characters.length} tracked characters</b></div><span>{atlasData.connections.length} documented connections</span></div>
  <div className="peopleIntro"><small>START WITH A PERSON</small><p>Select a character to follow their episode journey, geography, and documented links across the universe.</p></div>
  <div className="peopleSearch"><span>SEARCH PEOPLE</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Find a character…" aria-label="Search characters"/></div>
  <div className="sectionTitle">CHARACTERS <span>{characters.length} OF {atlasData.characters.length}</span></div>
  <div className="peopleGrid">{characters.map((c:any)=>{const cm=(atlasData as any).media?.characters?.[c.id];return <button className="entityCard characterCard" key={c.id} onClick={()=>onCharacter(c.id)}>{cm?.image&&<img src={atlasImageUrl(cm.image,640)} onError={e=>onAtlasImageError(e,cm.image)} srcSet={atlasImageSrcSet(cm.image,[320,480,640])} sizes="45vw" loading="lazy" decoding="async" alt="" className="characterArt"/>}<span><small>CHARACTER</small><b>{c.name}</b><em>{(c.seriesIds||[]).map((id:string)=>SERIES_BY_ID[id]?.short).filter(Boolean).join(" · ")||c.certainty}</em></span><Icon name="chevron"/></button>})}</div>
  {!characters.length&&<p className="muted">No tracked character matches “{query}”.</p>}
  <EntityGraphView defaultCollapsed onCharacter={onCharacter} onLocation={onLocation} onEpisode={onEpisode}/>
  <div className="sectionTitle">FACTIONS <span>{atlasData.factions.length}</span></div><div className="miniTags">{atlasData.factions.map((f:any)=><span key={f.id}>{f.name}</span>)}</div>
  <div className="sectionTitle">DOCUMENTED CONNECTIONS <span>{atlasData.connections.length}</span></div><div className="timelineList connectionDirectory">{atlasData.connections.map((c:any)=>{const name=(id:string)=>{const pools:any=[atlasData.characters,atlasData.locations,atlasData.communities,atlasData.factions,atlasData.series,atlasData.connections];for(const pool of pools){const item=pool.find((x:any)=>x.id===id);if(item)return item.name||item.title||item.label||id}return id};return <article key={c.id}><strong>↔</strong><div><small>{c.type.replaceAll("-"," ").toUpperCase()}</small><b>{c.label}</b><span>{name(c.fromId)} → {name(c.toId)} · {c.certainty}</span></div></article>})}</div>
 </div>}
function GuideContent({errors,onView}:{errors:string[];onView:(view:View)=>void}){const episodeCount=atlasData.seasonMeta.reduce((n:any,x:any)=>n+x.episodeCount,0);const art=(atlasData as any).media?.series?.twd?.keyArt;const mediaEntries=Object.values((episodeMedia as any).episodes||{}) as any[];const verified=mediaEntries.filter(m=>m.status==="verified").length;const available=mediaEntries.filter(m=>Boolean(m.image)).length;return <div className="contentScroll"><div className="guideHero">{art&&<img src={atlasImageUrl(art,1200)} onError={e=>onAtlasImageError(e,art)} srcSet={atlasImageSrcSet(art)} sizes="(max-width: 699px) 94vw, 470px" loading="eager" decoding="async" fetchPriority="high" alt="" className="guideArt"/>}<div className="guideHeroCopy"><span>FIELD GUIDE</span><h3>Find your way through the Walking Dead universe.</h3><p>Use the map to travel through geography, the timeline to browse chronology, or People to follow documented character journeys.</p></div></div><div className="guidePaths"><button onClick={()=>onView("map")}><span className="guidePathIcon"><Icon name="map"/></span><div><small>START WITH THE MAP</small><b>Explore the world</b><span>See locations in their historical context.</span></div><Icon name="chevron"/></button><button onClick={()=>onView("timeline")}><span className="guidePathIcon"><Icon name="timeline"/></span><div><small>BROWSE CHRONOLOGY</small><b>Follow universe time</b><span>Scrub from the outbreak through the later stories.</span></div><Icon name="chevron"/></button><button onClick={()=>onView("people")}><span className="guidePathIcon"><Icon name="people"/></span><div><small>FOLLOW A PERSON</small><b>Trace a character journey</b><span>Move through episodes, places and documented links.</span></div><Icon name="chevron"/></button></div><div className="sectionTitle">ATLAS AT A GLANCE <span>VERIFIED DATA</span></div><div className="guideStats"><div><b>{atlasData.series.length}</b><span>SERIES</span></div><div><b>{atlasData.locations.length}</b><span>LOCATIONS</span></div><div><b>{episodeCount}</b><span>EPISODES</span></div><div><b>{atlasData.connections.length}</b><span>LINKS</span></div></div><div className="guideSecondary"><div><small>WATCH ORDER</small><b>{atlasData.watchOrder.filter((x:any)=>x.type!=="note").length} segments</b><span>Series-level viewing scaffold.</span></div><div><small>MEDIA COVERAGE</small><b>{available} / {episodeCount}</b><span>{verified} episode-specific assets verified · {available-verified} AMC series-art fallbacks.</span></div></div><div className="guideStatus"><div><small>ATLAS STATUS</small><b>{errors.length?"REVIEW REFERENCES":"REGISTRY HEALTHY"}</b><span>{errors.length?errors.join(" · "):"Core IDs and relationships pass the atlas validator."}</span></div><div><small>LIVE SYSTEMS</small><span>Browser performance · gesture telemetry · entity indexes</span></div></div></div>}
