import {memo,useEffect,useMemo,useRef,useState} from "react";
import {geoEqualEarth,geoPath} from "d3-geo";
import {feature} from "topojson-client";
import type {CSSProperties} from "react";
// @ts-ignore world-atlas ships JSON topology
import world from "@cublya/world-atlas/countries-50m.json";
import {atlasData,Location,SeriesKey} from "./data";
import {validateAtlasData} from "./lib/validateData";
import {buildChronology,filterChronology,getEpisodeWatchOrder,compareEpisodesChronologically,describeEra,UNIVERSE_MIN_YEAR,UNIVERSE_MAX_YEAR,yearToPercent} from "./lib/chronology";
import type {EpisodeWatchOrderItem} from "./lib/chronology";
import episodeMedia from "../data/episodeMedia.json";
import fandomCanonical from "../data/enrichment/fandom-canonical.json";
import AtlasTimelineDock from "./components/AtlasTimelineDock";
import MobileTimeBar from "./components/MobileTimeBar";
import EntityGraphView from "./components/EntityGraphView";
import MiniTimeline from "./components/MiniTimeline";
import {useAtlasFocusController} from "./lib/entityFocus";
import {atlasImageSrcSet,atlasImageUrl} from "./lib/media";
import {getCharacterEpisodeIds,getLocationEpisodeIds,getEpisodeConnectionIds,getGroupEpisodeIds} from "./lib/entityGraph";
import {useWatchProgress} from "./lib/watchProgress";
import AtlasIcon,{AtlasIconGlyph} from "./components/AtlasIcon";
import {initAtlasPerformance,trackAtlasMetric,observeImageError} from "./lib/performance";
import {getRuntimeMeta,getRuntimeRelationships,getRuntimeEpisodeIds} from "./lib/runtime";
import ErrorBoundary from "./components/ErrorBoundary";
import CharacterPortrait from "./components/CharacterPortrait";

type View="map"|"timeline"|"people"|"guide";
type SearchKind="location"|"character"|"community"|"faction"|"episode";

const META:Record<SeriesKey,{id:string;name:string;color:string;short:string}>={
 TWD:{id:"twd",name:"The Walking Dead",color:"#e7e7e1",short:"TWD"},
 FTWD:{id:"ftwd",name:"Fear the Walking Dead",color:"#d4a64b",short:"FEAR"},
 TALES:{id:"tales",name:"Tales of the Walking Dead",color:"#d68168",short:"TALES"},
 WB:{id:"wb",name:"World Beyond",color:"#72a9c5",short:"WORLD BEYOND"},
 OWL:{id:"owl",name:"The Ones Who Live",color:"#d26e6b",short:"TOWL"},
 DARYL:{id:"daryl",name:"Daryl Dixon",color:"#9d88c8",short:"DARYL"},
 DEAD:{id:"dead",name:"Dead City",color:"#5bb29b",short:"DEAD CITY"},
 MORE_TALES:{id:"more-tales",name:"More Tales from the TWDU",color:"#c46b9a",short:"MORE TALES"}
};
const SERIES_BY_ID=Object.fromEntries(Object.values(META).map(x=>[x.id,x])) as Record<string,typeof META.TWD>;
const SERIES_KEYS=Object.keys(META) as SeriesKey[];

type MapLayer="ALL"|"SETTLEMENTS"|"FACILITIES"|"LANDMARKS"|"INFRASTRUCTURE"|"REGIONS";
const MAP_LAYER_LABELS:Record<MapLayer,string>={ALL:"ALL",SETTLEMENTS:"SETTLEMENTS",FACILITIES:"FACILITIES",LANDMARKS:"LANDMARKS",INFRASTRUCTURE:"INFRASTRUCTURE",REGIONS:"REGIONS"};
const LOCATION_LAYER_TYPES:Record<Exclude<MapLayer,"ALL">,Set<string>>={
 SETTLEMENTS:new Set(["city","town","community","stronghold","safe-zone","neighborhood","district","residence","farm","ranch","reservation","outpost","trading-center"]),
 FACILITIES:new Set(["facility","hospital","prison","medical-facility","military-facility","industrial","hotel","retail","store","restaurant","workshop","store-plaza","church","stadium","bunker"]),
 LANDMARKS:new Set(["landmark","park","boat","cabin","vineyard","jungle","crash-site"]),
 INFRASTRUCTURE:new Set(["dam","route","bridge","transit","rail-yard","dock","river","international-border"]),
 REGIONS:new Set(["region","country","state","territory","county","island"])
};
const locationMapLayer=(type:string):MapLayer=>{
 for(const [layer,types] of Object.entries(LOCATION_LAYER_TYPES) as [Exclude<MapLayer,"ALL">,Set<string>][])if(types.has(type))return layer;
 return "LANDMARKS";
};
const projection=geoEqualEarth().fitExtent([[24,22],[976,578]],{type:"Sphere"});
const pathGenerator=geoPath(projection);
const worldCountries:any=feature(world as any,(world as any).objects.countries) as any;
const worldLand:any=feature(world as any,(world as any).objects.land) as any;
const project=(lat:number,lng:number)=>{const p=projection([lng,lat]);return {x:p?.[0]??0,y:p?.[1]??0}};
const hasMapCoordinates=(location:Location)=>Number.isFinite(Number(location.lat))&&Number.isFinite(Number(location.lng))&&!(Number(location.lat)===0&&Number(location.lng)===0&&location.certainty==="unknown");
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
const onAtlasImageError=(e:React.SyntheticEvent<HTMLImageElement>,source:string)=>{const img=e.currentTarget;if(!source||img.dataset.fallback==="1")return;observeImageError(source);img.dataset.fallback="1";img.removeAttribute("srcset");img.src=source;};
const countryPalette=["#c8c3b5","#bfc4bb","#c6c0b0","#b7c0b5","#c9c6b8","#b9c2bf","#c3b9ac","#c4c8bc"];
const countryTone=(i:number)=>countryPalette[i%countryPalette.length];
// The projection, topology and per-country fill never change after load, so the geo
// projection math (the expensive part — hundreds of polygon rings through d3-geo) is
// done once here instead of on every React render. Re-deriving these ~250 path strings
// per render was the single largest source of jank (250-450ms blocking tasks on every
// zoom tick, autoplay tick, and navigation).
const sphereD=pathGenerator({type:"Sphere"}) as string;
const worldLandD=pathGenerator(worldLand) as string;
const worldCountryPaths=worldCountries.features.map((c:any,i:number)=>({
 key:(c.id||c.properties?.name||"country")+"-"+i,
 d:pathGenerator(c) as string,
 fill:countryTone(i),
 name:c.properties?.name||"Country"
}));
// Takes no props and its output never changes, so React skips re-rendering (and
// re-diffing all ~250 country paths) on every unrelated state change elsewhere in App.
const MapBackground=memo(function MapBackground(){
 return <>
  <rect width="1000" height="600" fill="url(#ocean)"/>
  <rect width="1000" height="600" fill="url(#oceanGlow)"/>
 </>;
});
const MapGeography=memo(function MapGeography(){
 return <>
  <g className="graticule"><path d={sphereD}/></g>
  <path className="landShadow" d={worldLandD} fill="#26383a" opacity=".28"/>
  <g className="countries">{worldCountryPaths.map((c:any)=><path key={c.key} d={c.d} fill={c.fill}><title>{c.name}</title></path>)}</g>
 </>;
});
const locationIconName=(type:string):"city"|"community"|"facility"|"hospital"|"farm"|"prison"|"boat"|"route"|"region"|"residence"|"ranch"|"dam"|"territory"|"country"|"landmark"|"stronghold"=>{
 const direct=new Set(["city","community","facility","hospital","farm","prison","boat","route","region","residence","ranch","dam","territory","country","landmark","stronghold"]);
 if(direct.has(type))return type as any;
 const aliases:Record<string,string>={
  town:"community",neighborhood:"community",district:"community","safe-zone":"stronghold","outpost":"stronghold",reservation:"community","trading-center":"community",
  "medical-facility":"hospital","military-facility":"facility",industrial:"facility",hotel:"facility",retail:"facility",store:"facility",restaurant:"facility",workshop:"facility","store-plaza":"facility",church:"landmark",stadium:"landmark",park:"landmark",cabin:"residence",bunker:"stronghold",ranch:"ranch",vineyard:"farm",jungle:"region","crash-site":"landmark",island:"region",state:"region",county:"region",country:"country",territory:"territory",bridge:"route",transit:"route","rail-yard":"route",dock:"route",river:"route","international-border":"route"
 };
 return (aliases[type]||"facility") as any;
};

function Icon({name,className}:{name:"map"|"timeline"|"people"|"guide"|"plus"|"minus"|"locate"|"search"|"close"|"chevron"|"layers"|"play"|"pause"|"arrow"|"pin";className?:string}) {
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

 return <svg className={className} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

export default function App(){
 const [series,setSeries]=useState<SeriesKey|"ALL">("ALL");
 const [mapLayer,setMapLayer]=useState<MapLayer>("ALL");
 const [year,setYear]=useState(2010);
 const [query,setQuery]=useState("");
 const {selectedLocation,selectedEpisode,selectedCharacter,selectedConnection,selectedCommunity,selectedFaction,setSelectedLocation,setSelectedEpisode,setSelectedCharacter,setSelectedConnection,setFocus,clearFocus}=useAtlasFocusController();
 const clearPeopleFocus=clearFocus;
 const [journeyMapMode,setJourneyMapMode]=useState(false);
 const [watchOrderOpen,setWatchOrderOpen]=useState(false);
 const {watched:watchedEpisodes,toggleWatched:toggleEpisodeWatched,resetWatched:resetWatchProgress}=useWatchProgress();
 const [view,setView]=useState<View>("map");
 const [dataErrors,setDataErrors]=useState<string[]>([]);
 const [zoom,setZoom]=useState(()=>1);
 const [pan,setPan]=useState(()=>({x:0,y:0}));
 const [isDragging,setIsDragging]=useState(false);
 const [sheet,setSheet]=useState<"peek"|"open">("open");
 const [searchOpen,setSearchOpen]=useState(false);
 const [clusterIds,setClusterIds]=useState<string[]|null>(null);
 const searchTriggerRef=useRef<HTMLButtonElement|null>(null);
 const searchInputRef=useRef<HTMLInputElement|null>(null);
 const searchHistoryRef=useRef(false);
 const [timeOpen,setTimeOpen]=useState(false);
 const [playing,setPlaying]=useState(false);
 const drag=useRef({x:0,y:0,px:0,py:0,moved:false});
 const gestureStart=useRef<number|null>(null);
 const gestureDistance=useRef(0);
 const pointers=useRef(new Map<number,{x:number;y:number}>());
 const pinch=useRef<{distance:number;zoom:number;x:number;y:number;midX:number;midY:number}|null>(null);
 const tapLocation=useRef<string|null>(null);
 const mapSvgRef=useRef<SVGSVGElement|null>(null);
 const mapWorldRef=useRef<SVGGElement|null>(null);
 const raf=useRef<number|null>(null);
 const visual=useRef({x:0,y:0,zoom:1});
 const didAutoHome=useRef(false);
 const [isMobileMap,setIsMobileMap]=useState(()=>typeof window!=="undefined"&&(window.innerWidth<700||(window.innerWidth<=900&&window.innerHeight<=600)));
 useEffect(()=>{initAtlasPerformance();void getRuntimeMeta().then(meta=>{if(meta)trackAtlasMetric("runtime-ready",1,{version:String(meta.version??"unknown"),episodes:Number(meta.counts?.episodes??0),characters:Number(meta.counts?.characters??0),locations:Number(meta.counts?.locations??0)})})},[]);

 useEffect(()=>setDataErrors(validateAtlasData()),[]);
 useEffect(()=>{const onResize=()=>setIsMobileMap(window.innerWidth<700||(window.innerWidth<=900&&window.innerHeight<=600));window.addEventListener("resize",onResize);return()=>window.removeEventListener("resize",onResize)},[]);
 useEffect(()=>{
   if(view!=="map")return;
   const frame=window.requestAnimationFrame(()=>{
     // On a narrow phone/tablet viewport the 1000x600 viewBox gets cropped hard by
     // preserveAspectRatio="slice" — panning from the raw world center (0,0) leaves
     // every marker off the visible slice. Home in on the initial location cluster
     // once, the first time we have real layout to measure against.
     if(!didAutoHome.current&&mapSvgRef.current?.clientWidth){
       didAutoHome.current=true;
       const home=computeHomePan();
       visual.current={x:home.x,y:home.y,zoom:home.zoom};
       setPan({x:home.x,y:home.y});
       setZoom(home.zoom);
       applyMapTransform(home.x,home.y,home.zoom,false);
       return;
     }
     const limits=getMapPanLimits();
     const nextX=clamp(visual.current.x,-limits.x,limits.x);
     const nextY=clamp(visual.current.y,-limits.y,limits.y);
     visual.current={...visual.current,x:nextX,y:nextY};
     setPan(prev=>prev.x===nextX&&prev.y===nextY?prev:{x:nextX,y:nextY});
     applyMapTransform(nextX,nextY,visual.current.zoom,true);
   });
   return()=>window.cancelAnimationFrame(frame);
 },[view,isMobileMap]);
 const applyMapTransform=(x:number,y:number,z:number,_animate=false)=>{
   const svg=mapSvgRef.current;
   const worldGroup=mapWorldRef.current;
   if(!svg||!worldGroup)return;
   const baseScale=Math.max(svg.clientWidth/1000,svg.clientHeight/600);
   if(!Number.isFinite(baseScale)||baseScale<=0)return;
   const cx=500,cy=300,px=x/baseScale,py=y/baseScale;
   worldGroup.setAttribute("transform","translate("+(cx+px)+" "+(cy+py)+") scale("+z+") translate("+(-cx)+" "+(-cy)+")");
 };
 useEffect(()=>{visual.current={x:pan.x,y:pan.y,zoom};applyMapTransform(pan.x,pan.y,zoom,true);},[pan.x,pan.y,zoom]);
 useEffect(()=>{if(view!=="map")setSheet("open");},[view]);
 useEffect(()=>{
   if(!playing)return;
   const id=window.setInterval(()=>setYear(y=>y>=2028?2010:y+1),900);
   return()=>window.clearInterval(id);
 },[playing]);
 useEffect(()=>{
   const onKey=(e:KeyboardEvent)=>{
     if(e.key==="Escape"){
       if(searchOpen){e.preventDefault();closeSearch();return;}
       if(clusterIds){e.preventDefault();setClusterIds(null);return;}
       if(selectedLocation||selectedEpisode||selectedCharacter||selectedConnection||selectedCommunity||selectedFaction){e.preventDefault();clearFocus();setJourneyMapMode(false);return;}
     }
     if((e.target as HTMLElement)?.tagName==="INPUT")return;
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
 const chronology=useMemo(()=>filterChronology(year,series==="ALL"?undefined:META[series].id),[series,year]);
 const currentEra=useMemo(()=>describeEra(year),[year]);
 const episodes=useMemo(()=>chronology.filter(e=>e.kind==="episode"),[chronology]);
 const selectedLoc=atlasData.locations.find(l=>l.id===selectedLocation)??null;
 const selectedEp=episodes.find(e=>e.id===selectedEpisode)??null;
 const episodeContextLocationIds=useMemo(()=>new Set<string>(selectedEpisode?((atlasData.episodes.find((e:any)=>e.id===selectedEpisode)?.locationIds??[]) as string[]):[]),[selectedEpisode]);
 const selectedConnectionData=selectedConnection?atlasData.connections.find((x:any)=>x.id===selectedConnection) as any:null;
 const selectedCommunityData=selectedCommunity?atlasData.communities.find((x:any)=>x.id===selectedCommunity) as any:null;
 const selectedFactionData=selectedFaction?atlasData.factions.find((x:any)=>x.id===selectedFaction) as any:null;
 const episodeWatchOrder=useMemo(()=>getEpisodeWatchOrder(),[]);
 const characterJourneyLocationIds=useMemo(()=>{if(!selectedCharacter)return new Set<string>();const ids=new Set<string>();getCharacterEpisodeIds(selectedCharacter).forEach(eid=>{const e=atlasData.episodes.find((x:any)=>x.id===eid) as any;(e?.locationIds??[]).forEach((id:string)=>ids.add(id))});return ids},[selectedCharacter]);
 const connectionContextLocationIds=useMemo(()=>{const ids=new Set<string>();if(!selectedConnectionData)return ids;[selectedConnectionData.fromId,selectedConnectionData.toId].filter(Boolean).forEach((id:string)=>{const l=atlasData.locations.find(x=>x.id===id);if(l)ids.add(l.id)});const evidence=((atlasData as any).connectionEpisodes?.connections?.[selectedConnectionData.id]?.episodeIds??[]) as string[];evidence.forEach((episodeId:string)=>{const e=atlasData.episodes.find((x:any)=>x.id===episodeId) as any;(e?.locationIds??[]).forEach((id:string)=>ids.add(id))});return ids},[selectedConnectionData]);
 const mapLocations=useMemo(()=>{
   const source=journeyMapMode&&selectedCharacter?atlasData.locations.filter(l=>characterJourneyLocationIds.has(l.id)):locations;
   return source.filter(l=>mapLayer==="ALL"||locationMapLayer(l.type)===mapLayer);
 },[journeyMapMode,selectedCharacter,characterJourneyLocationIds,locations,mapLayer]);

 const closeSearch=()=>{
   setSearchOpen(false);
   if(searchHistoryRef.current){searchHistoryRef.current=false;try{window.history.back()}catch{}}
   window.setTimeout(()=>searchTriggerRef.current?.focus(),0);
 };
 const openSearch=()=>{
   setSearchOpen(true);
   if(!searchHistoryRef.current){try{window.history.pushState({atlasSearch:true},"",window.location.href);searchHistoryRef.current=true}catch{}}
   window.setTimeout(()=>searchInputRef.current?.focus(),0);
 };
 useEffect(()=>{
   const onPopState=()=>{if(searchOpen){searchHistoryRef.current=false;setSearchOpen(false);window.setTimeout(()=>searchTriggerRef.current?.focus(),0);}};
   window.addEventListener("popstate",onPopState);
   return()=>window.removeEventListener("popstate",onPopState);
 },[searchOpen]);
 useEffect(()=>{if(searchOpen)window.setTimeout(()=>searchInputRef.current?.focus(),0)},[searchOpen]);

 const markerGroups=useMemo(()=>{
   const threshold=zoom<1.55?22:zoom<2.25?15:10;
   const groups:Array<{locations:Location[];x:number;y:number}>=[];
   for(const location of mapLocations.filter(hasMapCoordinates)){
     const p=project(location.lat,location.lng);
     let target=groups.find(g=>Math.hypot(g.x-p.x,g.y-p.y)<=threshold);
     if(!target){target={locations:[],x:p.x,y:p.y};groups.push(target);}
     target.locations.push(location);
     const n=target.locations.length;
     target.x=(target.x*(n-1)+p.x)/n;target.y=(target.y*(n-1)+p.y)/n;
   }
   return groups;
 },[mapLocations,zoom]);

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
 const getMapPanLimits=()=>{const el=mapSvgRef.current;if(!el)return {x:0,y:0};const w=el.clientWidth,h=el.clientHeight,baseScale=Math.max(w/1000,h/600),z=visual.current.zoom;const worldW=952*baseScale*z,worldH=556*baseScale*z;return {x:Math.max(0,(worldW-w)/2),y:Math.max(0,(worldH-h)/2)}};
 // "Home" is the initial (present-day) location cluster centered in the viewport, not
 // the raw world/viewBox center — on a narrow phone slice the world center is empty
 // ocean, well off from where the story's early locations (Georgia) actually sit.
 const computeHomePan=()=>{
   const el=mapSvgRef.current;
   if(!el)return {x:0,y:0,zoom:1};
   const surfaceRect=el.getBoundingClientRect();
   const w=el.clientWidth,h=el.clientHeight;
   if(!w||!h)return {x:0,y:0,zoom:1};
   const scale=Math.max(w/1000,h/600);
   const pts=atlasData.locations.filter(l=>l.year<=2010).map(l=>project(l.lat,l.lng));
   if(!pts.length)return {x:0,y:0,zoom:1};
   const cx=pts.reduce((s,p)=>s+p.x,0)/pts.length;
   const cy=pts.reduce((s,p)=>s+p.y,0)/pts.length;
   // A permanently-open content sidebar (tablet/desktop widths) can cover the right
   // portion of the map — center within whatever's actually unobstructed, or "home"
   // can land the story's starting cluster right behind the panel.
   const panelRect=document.querySelector(".contentPanel")?.getBoundingClientRect();
   const visibleW=panelRect&&panelRect.width>100&&panelRect.left<surfaceRect.right
     ?Math.max(160,panelRect.left-surfaceRect.left)
     :w;
   // The stacked top chrome (location card, series filter, map-layer filter, zoom
   // controls) floats over the map itself — on a phone it can reach nearly halfway
   // down the screen. Centering blind to that puts the cluster right behind it
   // (and its markers behind it too, un-tappable). Only count chrome that actually
   // overlaps the horizontal middle, since some of this is left/right-anchored.
   const centerX=surfaceRect.left+surfaceRect.width/2;
   let topExclusion=surfaceRect.top;
   [".mapTopLeft",".mapTopRight",".seriesRail",".mapLayerRail"].forEach(sel=>{
     const chromeEl=document.querySelector(sel);
     if(!chromeEl)return;
     const r=chromeEl.getBoundingClientRect();
     if(r.width===0&&r.height===0)return;
     if(r.left<centerX&&r.right>centerX)topExclusion=Math.max(topExclusion,r.bottom);
   });
   const topExclusionRel=clamp(topExclusion-surfaceRect.top+12,0,h);
   // At zoom 1 the map is scaled to exactly "cover" the container on whichever axis
   // drives that scale — on a portrait phone that's height, which means the vertical
   // pan limit is mathematically zero at zoom 1 (there is no slack to shift into).
   // No pan offset, however small, can move the cluster clear of the chrome above at
   // the default zoom, so panning alone can never fix this — solve for the smallest
   // zoom that actually opens up enough vertical slack to clear the chrome, rather
   // than guessing a flat constant (a short phone needs more help than a tall one).
   // Desired pan y(z) = topExclusionRel/2 - (cy-300)*scale*z is linear in z; the
   // available limit, limitY(z) = (556*scale*z-h)/2, is also linear in z — solve for
   // where they meet. Tablet/desktop keep the original zoom-1 home (plenty of room).
   let homeZoom=1;
   if(isMobileMap){
     // Solve for just enough zoom to clear the chrome with a margin — not to perfectly
     // center the remaining space, which demands far more zoom than the goal needs and
     // pushes the two story regions (Georgia, California/Mexico) too far apart to both
     // stay in frame. The pan itself (below) still aims for center-of-remaining-space;
     // it'll simply clamp to whatever this smaller zoom actually makes available.
     const clearMargin=60;
     const B=-(cy-300)*scale,denom=278*scale-B;
     const zNeeded=denom>0?(topExclusionRel+clearMargin)/denom:1;
     homeZoom=clamp(zNeeded*1.1,1.15,1.85);
   }
   const worldW=952*scale*homeZoom,worldH=556*scale*homeZoom;
   const limits={x:Math.max(0,(worldW-w)/2),y:Math.max(0,(worldH-h)/2)};
   return {
     x:clamp(visibleW/2-w/2-(cx-500)*scale*homeZoom,-limits.x,limits.x),
     y:clamp(topExclusionRel/2-(cy-300)*scale*homeZoom,-limits.y,limits.y),
     zoom:homeZoom
   };
 };
 const resetMap=()=>{const home=computeHomePan();visual.current={x:home.x,y:home.y,zoom:home.zoom};setZoom(home.zoom);setPan({x:home.x,y:home.y});trackAtlasMetric("map-reset",1,{mobile:isMobileMap});};
 const openPeopleEntity=(kind:"community"|"faction",id:string)=>{
   setView("people");setFocus(kind,id);setJourneyMapMode(false);setSheet("open");
 };
 const openWatchOrder=()=>{
   clearPeopleFocus();setView("guide");setWatchOrderOpen(true);setJourneyMapMode(false);setSheet("open");
 };
 const selectCharacter=(id:string)=>{clearPeopleFocus();const character=atlasData.characters.find((x:any)=>x.id===id) as any;if(!character)return;const ids=getCharacterEpisodeIds(id);const eps=ids.map(eid=>atlasData.episodes.find((e:any)=>e.id===eid)).filter(Boolean).sort(compareEpisodesChronologically);const firstYear=eps[0]?.timelineStart??eps[0]?.timelineEnd;if(firstYear)setYear(Number(firstYear));setSelectedCharacter(id);setSelectedLocation(null);setSelectedEpisode(null);setSelectedConnection(null);setJourneyMapMode(false);setView("people");setSheet("open");trackAtlasMetric("character-select",eps.length,{character:id});void getRuntimeRelationships("character",id).then(remote=>{if(remote)trackAtlasMetric("runtime-character-relationships",remote.episodeIds.length,{character:id,remoteIndexed:true})});};
 const selectLocation=(l:Location)=>{ clearPeopleFocus(); setClusterIds(null); const focusStarted=performance.now();
   void getRuntimeRelationships("location",l.id).then(remote=>{if(remote)trackAtlasMetric("runtime-location-relationships",remote.episodeIds.length,{location:l.id,remoteIndexed:true})});
   if(Number(l.year)>0)setYear(Number(l.year));setSelectedLocation(l.id);setSelectedEpisode(null);setSelectedCharacter(null);setSelectedConnection(null);setJourneyMapMode(false);setView("map");setSheet("open");
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
 const selectEpisode=(id:string)=>{clearPeopleFocus();const raw=atlasData.episodes.find((e:any)=>e.id===id) as any;setYearForEpisode(raw);setSelectedEpisode(id);setSelectedLocation(null);setSelectedCharacter(null);setSelectedConnection(null);setJourneyMapMode(false);setView("timeline");setSheet("open")};
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
 const selectAtlasEpisode=(id:string)=>{clearPeopleFocus();const raw=atlasData.episodes.find((e:any)=>e.id===id) as any;setYearForEpisode(raw);setSelectedEpisode(id);setSelectedLocation(null);setSelectedCharacter(null);setSelectedConnection(null);setJourneyMapMode(false);setView("map");setSheet("open");focusEpisodeGeography(raw)};
 const selectUniverseEvent=(event:any)=>{
   clearPeopleFocus();
   setYear(Number(event.year)||year);setSelectedLocation(null);setSelectedEpisode(null);setSelectedCharacter(null);setSelectedConnection(null);setJourneyMapMode(false);setView("map");setSheet("open");
   const locationIds=(event.locationIds??[]) as string[];
   if(locationIds.length)focusEpisodeGeography({id:event.id,locationIds});
 };
 const focusCharacterJourney=()=>{if(!selectedCharacter)return;const ids=getCharacterEpisodeIds(selectedCharacter).flatMap(eid=>(atlasData.episodes.find((e:any)=>e.id===eid) as any)?.locationIds??[]);const unique=[...new Set<string>(ids)];const years=getCharacterEpisodeIds(selectedCharacter).map(eid=>atlasData.episodes.find((e:any)=>e.id===eid) as any).filter(Boolean).flatMap((e:any)=>[Number(e.timelineStart??e.timelineEnd??0)]).filter((n:number)=>Number.isFinite(n)&&n>0);if(years.length)setYear(Math.max(...years));setSeries("ALL");setJourneyMapMode(true);setSelectedConnection(null);setSelectedLocation(null);setSelectedEpisode(null);setView("map");setSheet("open");window.requestAnimationFrame(()=>window.requestAnimationFrame(()=>{const surface=mapSvgRef.current;if(!surface)return;const rect=surface.getBoundingClientRect();const centers=unique.map(id=>surface.querySelector<SVGGElement>(".marker[data-location-id=\""+id+"\"]")).filter(Boolean).map(el=>{const r=(el as SVGGElement).getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}});if(!centers.length)return;const markerX=centers.reduce((sum,p)=>sum+p.x,0)/centers.length;const markerY=centers.reduce((sum,p)=>sum+p.y,0)/centers.length;const targetX=rect.left+rect.width*.5;const targetY=rect.top+rect.height*.38;const limits=getMapPanLimits();const nextX=clamp(visual.current.x+(targetX-markerX),-limits.x,limits.x);const nextY=clamp(visual.current.y+(targetY-markerY),-limits.y,limits.y);visual.current={...visual.current,x:nextX,y:nextY};applyMapTransform(nextX,nextY,visual.current.zoom,true);setPan({x:nextX,y:nextY});trackAtlasMetric("character-journey-geography-focus",1,{character:selectedCharacter,locations:unique.length})}))};
 const focusConnectionGeography=(ids:string[])=>{const usable=ids.filter(id=>{const l=atlasData.locations.find(x=>x.id===id);return !!l&&hasMapCoordinates(l)});if(!usable.length)return;window.requestAnimationFrame(()=>window.requestAnimationFrame(()=>{const surface=mapSvgRef.current;if(!surface)return;const rect=surface.getBoundingClientRect();const centers=usable.map(id=>surface.querySelector<SVGGElement>(".marker[data-location-id=\""+id+"\"]")).filter(Boolean).map(el=>{const r=(el as SVGGElement).getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}});if(!centers.length)return;const markerX=centers.reduce((sum,p)=>sum+p.x,0)/centers.length;const markerY=centers.reduce((sum,p)=>sum+p.y,0)/centers.length;const targetX=rect.left+rect.width*.5;const targetY=rect.top+rect.height*.38;const limits=getMapPanLimits();const nextX=clamp(visual.current.x+(targetX-markerX),-limits.x,limits.x);const nextY=clamp(visual.current.y+(targetY-markerY),-limits.y,limits.y);visual.current={...visual.current,x:nextX,y:nextY};applyMapTransform(nextX,nextY,visual.current.zoom,true);setPan({x:nextX,y:nextY});trackAtlasMetric("connection-geography-focus",1,{locations:usable.length})}))};
 const selectConnection=(id:string)=>{clearPeopleFocus();const connection=atlasData.connections.find((x:any)=>x.id===id) as any;if(!connection)return;const evidence=((atlasData as any).connectionEpisodes?.connections?.[id]??{}) as any;const episodeIds=(evidence.episodeIds??[]) as string[];const years=episodeIds.map(eid=>atlasData.episodes.find((e:any)=>e.id===eid)).filter(Boolean).map((e:any)=>Number(e.timelineStart??e.timelineEnd??0)).filter((n:number)=>Number.isFinite(n)&&n>0);if(years.length)setYear(Math.min(...years));setSeries("ALL");setSelectedConnection(id);setSelectedLocation(null);setSelectedEpisode(null);setSelectedCharacter(null);setJourneyMapMode(false);setView("map");setSheet("open");const contextIds=[connection.fromId,connection.toId,...episodeIds.flatMap(eid=>(atlasData.episodes.find((e:any)=>e.id===eid) as any)?.locationIds??[])].filter(Boolean) as string[];focusConnectionGeography([...new Set(contextIds)]);};

 const pointerDown=(e:React.PointerEvent<SVGSVGElement>)=>{
   e.preventDefault();
   // setPointerCapture retargets this pointer's future events (including pointerup) to
   // the SVG itself, so a marker's own onPointerUp never fires — hit-test the original
   // target here, while it still reflects what was actually touched, and resolve the tap
   // against that on release instead of relying on a handler on the marker.
   if(pointers.current.size===0){
     const hit=(e.target as Element).closest?.("[data-location-id]");
     tapLocation.current=hit?hit.getAttribute("data-location-id"):null;
   }else{
     tapLocation.current=null;
   }
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
     if(!drag.current.moved&&tapLocation.current){
       const tapped=atlasData.locations.find(x=>x.id===tapLocation.current);
       if(tapped)selectLocation(tapped);
     }
     tapLocation.current=null;
   }
 };
 const wheel=(e:React.WheelEvent<SVGSVGElement>)=>{e.preventDefault();const next=clamp(visual.current.zoom*(e.deltaY<0?1.12:.89),1,5);visual.current.zoom=next;applyMapTransform(visual.current.x,visual.current.y,next,false);setZoom(next)};
 const goView=(v:View)=>{clearPeopleFocus();closeSearch();setClusterIds(null);setView(v);setSelectedLocation(null);setSelectedEpisode(null);setSelectedCharacter(null);setSelectedConnection(null);setJourneyMapMode(false);setWatchOrderOpen(false);setSheet("open")};
 const mapYearCount=mapLocations.filter(hasMapCoordinates).length;
 const visibleSeries=series==="ALL"?"THE WORLD":META[series].short;

 return <div className="app">
  <header className="topbar">
   <button className="brand" onClick={()=>{closeSearch();setClusterIds(null);setView("map");setSelectedLocation(null);setSelectedEpisode(null);setSelectedCharacter(null);setSelectedConnection(null);setJourneyMapMode(false)}} aria-label="Return to atlas map">
    <span className="logoMark">◈</span><span><b>TWDU ATLAS</b><small>THE WALKING DEAD UNIVERSE · FIELD GUIDE</small></span>
   </button>
   <button ref={searchTriggerRef} className="mobileSearchButton" onClick={()=>searchOpen?closeSearch():openSearch()} aria-label={searchOpen?"Close atlas search":"Open atlas search"} aria-expanded={searchOpen}><Icon name={searchOpen?"close":"search"}/></button>
   <div className="searchWrap">
    <Icon name="search"/>
    <input value={query} onFocus={openSearch} onChange={e=>{setQuery(e.target.value);openSearch()}} placeholder="Search a place, person, episode…" aria-label="Search atlas" aria-expanded={searchOpen} aria-controls="atlas-search-overlay"/>
    {query&&<button className="clearSearch" onClick={()=>{setQuery("");closeSearch()}} aria-label="Clear atlas search"><Icon name="close"/></button>}
    {searchOpen&&query&&<div className="searchResults">{searchResults.length?searchResults.map(r=><button key={r.kind+r.id} onClick={()=>{if(r.kind==="location"){const l=atlasData.locations.find(x=>x.id===r.id);if(l)selectLocation(l)}else if(r.kind==="episode")selectEpisode(r.id);else if(r.kind==="character")selectCharacter(r.id);else if(r.kind==="community"||r.kind==="faction")openPeopleEntity(r.kind,r.id);setQuery("");setSearchOpen(false)}}><span className="resultIcon">{r.kind==="episode"?"EP":r.kind.slice(0,2).toUpperCase()}</span><span className="resultText"><b>{r.title}</b><small>{r.meta}</small></span><Icon name="chevron"/></button>):<div className="emptySearch">No matching atlas records.</div>}</div>}
   </div>
   <div className="headerMeta"><span>LIVE ATLAS</span><b>{year}</b><em>{currentEra.short}</em></div>
  </header>

  <main className="atlasMain">
   <section className={"map view-"+view+(selectedLocation||selectedEpisode||selectedCharacter||selectedConnection||selectedCommunity||selectedFaction||watchOrderOpen?" detailOpen":"")} aria-labelledby="atlas-map-heading">
    <h1 id="atlas-map-heading" className="srOnly">Atlas map</h1>
    <div className="mapAtmosphere"/>
    <div className="mapSurface">
     <svg ref={mapSvgRef} viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid slice" className={isDragging?"dragging":""} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} onWheel={wheel}>
      <defs>
       <linearGradient id="ocean" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#9fb2b4"/><stop offset=".48" stopColor="#82999d"/><stop offset="1" stopColor="#60777b"/></linearGradient>
       <linearGradient id="land" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#d8d3c5"/><stop offset=".55" stopColor="#b9b7aa"/><stop offset="1" stopColor="#96988e"/></linearGradient>
       <radialGradient id="oceanGlow" cx=".5" cy=".38" r=".72"><stop offset="0" stopColor="#c7d4d4" stopOpacity=".55"/><stop offset="1" stopColor="#51696e" stopOpacity=".08"/></radialGradient>
       <filter id="landShadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="5" stdDeviation="5" floodColor="#26383a" floodOpacity=".28"/></filter>
       <filter id="paperNoise"><feTurbulence type="fractalNoise" baseFrequency=".65" numOctaves="2" stitchTiles="stitch" result="noise"/><feColorMatrix in="noise" type="saturate" values="0" result="gray"/><feComponentTransfer><feFuncA type="table" tableValues="0 .055"/></feComponentTransfer><feBlend in="SourceGraphic" in2="gray" mode="multiply"/></filter>
      </defs>
      <MapBackground/>
      <g ref={mapWorldRef} className="mapWorld">
      <MapGeography/>
      {zoom>1.12&&<g className="mapLabels"><text x="184" y="350">NORTH AMERICA</text><text x="557" y="150">EUROPE</text><text x="782" y="360">ASIA</text></g>}
      <g className="markers">{markerGroups.map(group=>{
       if(group.locations.length>1){
        const ids=group.locations.map(l=>l.id);
        const label=ids.length+" locations at this map point";
        return <g key={"cluster-"+ids.join("-")} className="markerCluster" transform={"translate("+group.x+" "+group.y+")"} role="button" tabIndex={0} aria-label={"Open "+label} onClick={()=>setClusterIds(ids)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();setClusterIds(ids)}}}>
          <circle className="markerClusterHit" r={22/zoom} fill="transparent"/>
          <circle className="markerClusterRing" r={18/zoom}/>
          <circle className="markerClusterCore" r={13/zoom}/>
          <text className="markerClusterCount" textAnchor="middle" dominantBaseline="central">{ids.length}</text>
        </g>;
       }
       const l=group.locations[0],p=project(l.lat,l.lng),meta=SERIES_BY_ID[l.seriesId];const isSelected=selectedLocation===l.id;const isEpisodeContext=episodeContextLocationIds.has(l.id);
       const isConnectionContext=connectionContextLocationIds.has(l.id);
       const isCharacterJourneyContext=journeyMapMode&&characterJourneyLocationIds.has(l.id);const iconSize=isSelected?20:18;const iconHalf=iconSize/2;const markerTitle=l.name+" · "+l.type+" · "+meta.short+" · "+l.year+"+ · "+l.certainty;return <g key={l.id} data-location-id={l.id} className={"marker"+(isSelected?" selected":"")+(isEpisodeContext?" episodeContext":"")+(isConnectionContext?" connectionContext":"")+(isCharacterJourneyContext?" characterJourneyContext":"")} transform={"translate("+p.x+" "+p.y+")"} role="button" tabIndex={0} aria-label={"Open "+l.name+" location"} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();selectLocation(l)}}}>
       <title>{markerTitle}</title>
       <circle className="markerHit" r={(isMobileMap?16:11)/zoom} fill="transparent"/><g className="markerGlyph" transform={"scale("+(1/zoom)+") translate(-"+iconHalf+" -"+iconHalf+")"} style={{color:meta.color}}><g className="markerIcon" transform={"scale("+(iconSize/24)+")"} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><AtlasIconGlyph name={locationIconName(l.type) as any}/></g><circle className="markerCore" cx={iconHalf} cy={iconHalf} r={1.2} fill="currentColor"/></g>{(!isMobileMap&&(zoom>1.34||isSelected|| (l.year<=year&&l.name.length<22&&["Alexandria","Hilltop","King County","Woodbury","Oceanside","Commonwealth","Terminus"].includes(l.name))))&&<text x="5" y=".5" className="markerLabel">{l.name}</text>}
      </g>;
      })}</g>
     </g>
     </svg>
    </div>

    <div className="mapChrome mapTopLeft">
      <div className="locationKicker"><span className="liveDot"/>{visibleSeries}<span className="mapModeTag">MAP</span></div>
      <strong>{mapYearCount} <small>{MAP_LAYER_LABELS[mapLayer]} · {year}</small></strong>
    </div>

    <button className="mobileLocationsButton" onClick={()=>setSheet("open")} aria-label={`Open ${mapYearCount} mapped locations`}><Icon name="pin"/><span>LOCATIONS</span><b>{mapYearCount}</b></button>

    <div className="mapChrome mapTopRight">
      <button onClick={()=>setZoomValue(zoom+.5)} aria-label="Zoom in"><Icon name="plus"/></button>
      <button onClick={()=>setZoomValue(zoom-.5)} aria-label="Zoom out"><Icon name="minus"/></button>
      <button onClick={resetMap} aria-label="Reset map"><Icon name="locate"/></button>
      <div className="zoomBadge">{Math.round(zoom*100)}%</div>
    </div>

    {clusterIds&&<div className="markerClusterSheet" role="dialog" aria-modal="false" aria-labelledby="cluster-sheet-title"><div className="markerClusterSheetHead"><div><small>MAP LOCATION CLUSTER</small><b id="cluster-sheet-title">{clusterIds.length} locations</b></div><button onClick={()=>setClusterIds(null)} aria-label="Close location cluster"><Icon name="close"/></button></div><div className="markerClusterList">{clusterIds.map(id=>{const l=atlasData.locations.find(x=>x.id===id);if(!l)return null;const meta=SERIES_BY_ID[l.seriesId];return <button key={id} onClick={()=>selectLocation(l)}><span className="clusterListIcon" style={{color:meta?.color}}><AtlasIconGlyph name={locationIconName(l.type) as any}/></span><span><b>{l.name}</b><small>{meta?.short||l.seriesId} · {l.type} · {l.year}+</small></span><Icon name="chevron"/></button>})}</div></div>}

    <div className="mapCompass" aria-hidden="true"><span>N</span><i></i><small>1:50m</small></div>
    <div className={`mapLegend ${sheet==="open"?"sheetOpen":""}`} aria-label="Map legend"><small>SERIES LAYER</small>{SERIES_KEYS.map(k=><span key={k}><i style={{background:META[k].color}}/>{META[k].short}</span>)}</div>

    {view==="map"&&!selectedLocation&&!selectedEpisode&&<div className="seriesRail" aria-label="Series filter"><span className="seriesRailHint" aria-hidden="true">SWIPE</span>
      <button className={series==="ALL"?"active":""} aria-pressed={series==="ALL"} onClick={()=>setSeries("ALL")}>ALL</button>
      {SERIES_KEYS.map(k=><button key={k} aria-pressed={series===k} className={series===k?"active":""} style={series===k?{"--series":META[k].color} as CSSProperties:{}} onClick={()=>setSeries(k)}>{META[k].short}</button>)}
    </div>}
    {view==="map"&&!selectedLocation&&!selectedEpisode&&!selectedCharacter&&<div className="mapLayerRail" aria-label="Map location layer filter">
      <span className="mapLayerLabel"><Icon name="layers"/> LAYERS</span>
      {(Object.keys(MAP_LAYER_LABELS) as MapLayer[]).map(layer=><button key={layer} className={mapLayer===layer?"active":""} aria-pressed={mapLayer===layer} onClick={()=>setMapLayer(layer)}>{MAP_LAYER_LABELS[layer]}</button>)}
    </div>}

    {!isMobileMap&&<AtlasTimelineDock year={year} onYearChange={y=>{setPlaying(false);setYear(y)}} series={series} onEpisode={selectAtlasEpisode} selectedEpisode={selectedEpisode} playing={playing} onTogglePlaying={()=>setPlaying(v=>!v)} onConnections={()=>goView("people")}/>}

    {isMobileMap&&view==="map"&&!selectedLocation&&!selectedEpisode&&!selectedCharacter&&<MobileTimeBar year={year} playing={playing} onYearChange={y=>{setPlaying(false);setYear(y)}} onTogglePlaying={()=>setPlaying(v=>!v)}/>}

    {searchOpen&&<div id="atlas-search-overlay" className="searchOverlay" role="dialog" aria-modal="true" aria-labelledby="atlas-search-title"><div className="searchOverlayHead"><b id="atlas-search-title">SEARCH THE ATLAS</b><button onClick={closeSearch} aria-label="Close atlas search"><Icon name="close"/></button></div><div className="searchOverlayInput"><Icon name="search"/><input ref={searchInputRef} autoFocus value={query} onChange={e=>setQuery(e.target.value)} placeholder="Place, person, episode, faction…" aria-label="Search the atlas"/>{query&&<button onClick={()=>setQuery("")} aria-label="Clear search"><Icon name="close"/></button>}</div>{query&&<div className="searchOverlayResults" aria-live="polite">{searchResults.length?searchResults.map(r=><button key={r.kind+r.id} onClick={()=>{if(r.kind==="location"){const l=atlasData.locations.find(x=>x.id===r.id);if(l)selectLocation(l)}else if(r.kind==="episode")selectEpisode(r.id);else if(r.kind==="character")selectCharacter(r.id);else if(r.kind==="community"||r.kind==="faction")openPeopleEntity(r.kind,r.id);setQuery("");closeSearch()}}><span className="resultIcon">{r.kind==="episode"?"EP":r.kind.slice(0,2).toUpperCase()}</span><span className="resultText"><b>{r.title}</b><small>{r.meta}</small></span><Icon name="chevron"/></button>):<div className="emptySearch"><b>No matching atlas records.</b><span>Try a place, person, episode, or faction.</span><button onClick={()=>setQuery("")}>CLEAR SEARCH</button></div>}</div>}<button className="searchOverlayMapBack" onClick={()=>{setQuery("");closeSearch();goView("map")}}>BACK TO MAP</button></div>}

    <section className={`contentPanel ${sheet} ${selectedLoc||selectedEp||selectedCharacter||selectedConnection||selectedCommunity||selectedFaction||watchOrderOpen?"hasDetail":""}`}>
      <button className="panelGrab" onClick={()=>setSheet(v=>v==="open"?"peek":"open")} aria-expanded={sheet==="open"} aria-label={sheet==="open"?"Collapse information panel":"Expand information panel"}><span/></button>
      <div className={`panelHeader ${selectedLoc||selectedEp||selectedCharacter||selectedConnection||selectedCommunity||selectedFaction||watchOrderOpen?"detailHeader":""}`}>
       <div><small>{selectedLoc?SERIES_BY_ID[selectedLoc.seriesId]?.name:selectedEp?SERIES_BY_ID[selectedEp.seriesId]?.name:selectedConnection?"UNIVERSE LINK":selectedCommunity?"COMMUNITY":selectedFaction?"FACTION":watchOrderOpen?"CHRONOLOGY":view==="map"?"ATLAS":"TWDU ATLAS"}</small><h2>{selectedLoc?.name||selectedEp?.title||selectedConnectionData?.label||selectedCommunityData?.name||selectedFactionData?.name||((selectedCharacter&&atlasData.characters.find((x:any)=>x.id===selectedCharacter)?.name)||null)||(watchOrderOpen?"Watch Order":null)||(view==="map"?`${year} · ${mapYearCount} mapped`:view==="timeline"?"Chronology":view==="people"?"People":"Field guide")}</h2></div>
       {(selectedLoc||selectedEp||selectedCharacter||selectedConnection||selectedCommunity||selectedFaction||watchOrderOpen)&&<button className="closePanel" onClick={()=>{if(selectedLoc||selectedEp||selectedCharacter||selectedConnection||selectedCommunity||selectedFaction){clearFocus();setJourneyMapMode(false)}else setWatchOrderOpen(false)}} aria-label="Close details"><Icon name="close"/></button>}
      </div>
      <ErrorBoundary key={selectedLocation||selectedEpisode||selectedCharacter||selectedConnection||selectedCommunity||selectedFaction||(watchOrderOpen?"watch-order":"")||view} onReset={()=>{clearFocus();setWatchOrderOpen(false);setView("map")}}>
      {selectedLoc?<LocationDetail location={selectedLoc} onEpisode={selectEpisode} onCharacter={selectCharacter} onLocation={selectLocation} onConnection={selectConnection} onCommunity={id=>openPeopleEntity("community",id)} onFaction={id=>openPeopleEntity("faction",id)}/>:selectedEp?<EpisodeDetail episode={selectedEp} onLocation={selectLocation} onEpisode={selectEpisode} onCharacter={selectCharacter} onConnection={selectConnection} onCommunity={id=>openPeopleEntity("community",id)} onFaction={id=>openPeopleEntity("faction",id)}/>:selectedCharacter?<CharacterDetail characterId={selectedCharacter} onEpisode={selectEpisode} onLocation={selectLocation} onCharacter={selectCharacter} onConnection={selectConnection} onJourney={focusCharacterJourney} onCommunity={id=>openPeopleEntity("community",id)} onFaction={id=>openPeopleEntity("faction",id)}/>:selectedConnection?<ConnectionDetail connectionId={selectedConnection} onCharacter={selectCharacter} onLocation={selectLocation} onEpisode={selectEpisode} onConnection={selectConnection} onCommunity={id=>openPeopleEntity("community",id)} onFaction={id=>openPeopleEntity("faction",id)}/>:selectedCommunity?<GroupDetail kind="community" groupId={selectedCommunity} onCharacter={selectCharacter} onLocation={selectLocation} onEpisode={selectEpisode} onConnection={selectConnection} onCommunity={id=>openPeopleEntity("community",id)} onFaction={id=>openPeopleEntity("faction",id)}/>:selectedFaction?<GroupDetail kind="faction" groupId={selectedFaction} onCharacter={selectCharacter} onLocation={selectLocation} onEpisode={selectEpisode} onConnection={selectConnection} onCommunity={id=>openPeopleEntity("community",id)} onFaction={id=>openPeopleEntity("faction",id)}/>:watchOrderOpen?<WatchOrderContent episodes={episodeWatchOrder} watched={watchedEpisodes} onToggleWatched={toggleEpisodeWatched} onResetWatched={resetWatchProgress} onEpisode={selectEpisode}/>:view==="map"?<MapContent locations={mapLocations} onSelect={selectLocation}/>:view==="timeline"?<TimelineContent episodes={episodes} onEpisode={selectEpisode} onUniverseEvent={selectUniverseEvent} onConnections={()=>{setView("people");setSelectedConnection(null);setSelectedLocation(null);setSelectedEpisode(null);setSelectedCharacter(null);setSheet("open")}} onYearChange={setYear} currentYear={year}/>:view==="people"?<PeopleContent onCharacter={selectCharacter} onLocation={id=>{const l=atlasData.locations.find(x=>x.id===id);if(l)selectLocation(l)}} onEpisode={selectEpisode} onConnection={selectConnection} onCommunity={id=>openPeopleEntity("community",id)} onFaction={id=>openPeopleEntity("faction",id)}/>:<GuideContent errors={dataErrors} onView={goView} onWatchOrder={openWatchOrder}/>}
      </ErrorBoundary>
    </section>

    <nav className="bottomNav" aria-label="Atlas sections">
      {(["map","timeline","people","guide"] as View[]).map(v=><button key={v} aria-current={view===v?"page":undefined} className={view===v?"active":""} onClick={()=>goView(v)}><Icon name={v==="map"?"map":v==="timeline"?"timeline":v==="people"?"people":"guide"}/><small>{v==="map"?"MAP":v==="timeline"?"TIME":v==="people"?"PEOPLE":"GUIDE"}</small></button>)}
    </nav>
   </section>
  </main>
 </div>;
}

function FandomIntelligence({entityType,entityId,onCharacter,onLocation,onEpisode}:{entityType:"characters"|"locations"|"episodes";entityId:string;onCharacter?:(id:string)=>void;onLocation?:(id:string)=>void;onEpisode?:(id:string)=>void}){
 const record=(fandomCanonical as any)?.[entityType]?.[entityId];
 if(!record)return null;
 const hints=record.hints||{};
 const labels:any={aliases:"ALIASES",actor:"PORTRAYED BY",status:"STATUS",firstAppearance:"FIRST APPEARANCE",lastAppearance:"LAST APPEARANCE",occupation:"OCCUPATION",affiliation:"AFFILIATION",family:"FAMILY",relationships:"RELATIONSHIPS",type:"TYPE",region:"REGION",residents:"RESIDENTS",coordinates:"COORDINATES",season:"SEASON",episodeNumber:"EPISODE",airDate:"AIR DATE",director:"DIRECTOR",writer:"WRITERS",cast:"CAST",locations:"FILMED / FEATURED LOCATIONS",productionCode:"PRODUCTION CODE",viewership:"VIEWERSHIP"};
 const entries=Object.entries(hints).filter(([key,value])=>key!=="image"&&value!=null&&String(value).trim()!=="");
 const knownKeys=new Set(entries.map(([key])=>key));
 const allFields=Object.entries(record.fields||{}).filter(([key,value])=>!knownKeys.has(key)&&value!=null&&String(value).trim()!=="");
 const asText=(value:any)=>Array.isArray(value)?value.join(" · "):String(value);
 const sections=Array.isArray(record.details?.sections)?record.details.sections:[];
 const links=Array.isArray(record.details?.linkedPages)?record.details.linkedPages:[];
 const normalize=(value:string)=>String(value||"").toLowerCase().replace(/\\[[^\\]]*\\]/g,"").replace(/\\([^)]*\\)/g,"").replace(/[^a-z0-9]+/g," ").trim();
 const atlasEntities=[
  ...atlasData.characters.map((x:any)=>({kind:"character",id:x.id,name:x.name,aliases:x.aliases||[]})),
  ...atlasData.locations.map((x:any)=>({kind:"location",id:x.id,name:x.name,aliases:x.aliases||[]})),
  ...atlasData.episodes.map((x:any)=>({kind:"episode",id:x.id,name:x.title,aliases:x.aliases||[]}))
 ];
 const linkedAtlas=links.map((page:string)=>{const key=normalize(page);const match=atlasEntities.find((x:any)=>[x.name,...(Array.isArray(x.aliases)?x.aliases:[])].some((v:string)=>normalize(v)===key));return match?{...match,page}:null}).filter(Boolean) as any[];
 const uniqueLinked=linkedAtlas.filter((x,i,a)=>a.findIndex(y=>y.kind===x.kind&&y.id===x.id)===i).slice(0,24);
 const openLinked=(item:any)=>{if(item.kind==="character")onCharacter?.(item.id);else if(item.kind==="location")onLocation?.(item.id);else onEpisode?.(item.id);};
 return <section className="fandomIntel">
  <div className="sectionTitle">WIKI INTELLIGENCE <span>FANDOM</span></div>
  {record.extract&&<div className="fandomExtract">{record.extract}</div>}
  {entries.length>0&&<div className="fandomFacts">{entries.map(([key,value])=><div key={key}><small>{labels[key]||key.replaceAll("_"," ").toUpperCase()}</small><b>{asText(value)}</b></div>)}</div>}
  {uniqueLinked.length>0&&<><div className="fandomSubhead">ATLAS-LINKED WIKI PAGES <span>{uniqueLinked.length}</span></div><div className="fandomAtlasLinks">{uniqueLinked.map((item:any)=><button key={item.kind+item.id} onClick={()=>openLinked(item)}><small>{item.kind.toUpperCase()}</small><b>{item.name}</b><Icon name="chevron"/></button>)}</div></>}
  {sections.length>0&&<><div className="fandomSubhead">PAGE SECTIONS</div><div className="fandomTags">{sections.slice(0,24).map((s:string)=><span key={s}>{s}</span>)}</div></>}
  {links.length>0&&<><div className="fandomSubhead">LINKED WIKI PAGES <span>{links.length}</span></div><div className="fandomTags">{links.slice(0,30).map((s:string)=><span key={s}>{s}</span>)}</div></>}
  {allFields.length>0&&<details className="fandomMore"><summary>ALL WIKI FIELDS <span>{allFields.length}</span></summary><div className="fandomMoreGrid">{allFields.map(([key,value])=><div key={key}><small>{key.replaceAll("_"," ").toUpperCase()}</small><b>{asText(value)}</b></div>)}</div></details>}
  <a className="fandomSource" href={record.sourceUrl} target="_blank" rel="noreferrer"><span>WALKING DEAD WIKI · SOURCE PAGE</span><Icon name="arrow"/></a>
 </section>;
}

function MediaStrip({items,label="MEDIA"}:{items:{src?:string;title:string;meta?:string}[];label?:string}){const valid=items.filter(x=>x.src);if(!valid.length)return null;return <><div className="sectionTitle">{label}<span>{valid.length}</span></div><div className="mediaStrip">{valid.map((item,i)=><figure key={item.title+"-"+i}><img src={atlasImageUrl(item.src!,520)} srcSet={atlasImageSrcSet(item.src!,[320,520])} sizes="180px" loading="lazy" decoding="async" alt="" onError={e=>onAtlasImageError(e,item.src!)}/><figcaption><b>{item.title}</b>{item.meta&&<small>{item.meta}</small>}</figcaption></figure>)}</div></>}

function LocationDetail({location,onEpisode,onCharacter,onLocation,onConnection,onCommunity,onFaction}:{location:Location;onEpisode:(id:string)=>void;onCharacter:(id:string)=>void;onLocation:(l:Location)=>void;onConnection:(id:string)=>void;onCommunity:(id:string)=>void;onFaction:(id:string)=>void}){
 const [runtimeEpisodeIds,setRuntimeEpisodeIds]=useState<string[]|null>(null);
 useEffect(()=>{let active=true;void getRuntimeEpisodeIds("location",location.id).then(ids=>{if(active)setRuntimeEpisodeIds(ids)});return()=>{active=false}},[location.id]);const meta=SERIES_BY_ID[location.seriesId];const placeMedia=(atlasData as any).media?.places?.[location.id];const placeImage=placeMedia?.image||(atlasData as any).media?.series?.[location.seriesId]?.keyArt;const placeMediaFallback=!placeMedia?.image&&Boolean(placeImage);const relatedMedia=[...atlasData.episodes.filter((e:any)=>(e.locationIds??[]).includes(location.id)).map((e:any)=>{const m=(episodeMedia as any).episodes?.[e.id];return {src:m?.image,title:e.title,meta:e.seriesId?SERIES_BY_ID[e.seriesId]?.short:""}}),placeMedia?.image?{src:placeMedia.image,title:location.name,meta:"Fandom / Atlas"}:null].filter(Boolean) as any[];const curatedIds=runtimeEpisodeIds??getLocationEpisodeIds(location.id);const strictEpisodes=atlasData.episodes.filter((e:any)=>(e.locationIds??[]).includes(location.id));const strictIds=new Set(strictEpisodes.map((e:any)=>e.id));const historicalEpisodes=curatedIds.filter(id=>!strictIds.has(id)).map(id=>atlasData.episodes.find((e:any)=>e.id===id)).filter(Boolean) as any[];const episodes=[...strictEpisodes];const events=atlasData.events.filter((e:any)=>e.locationIds?.includes(location.id));return <div className="contentScroll"><div className="entityHero" style={{"--accent":meta.color} as CSSProperties}>{placeImage&&<img src={atlasImageUrl(placeImage,1200)} onError={e=>onAtlasImageError(e,placeImage)} srcSet={atlasImageSrcSet(placeImage)} sizes="(max-width: 699px) 92vw, 470px" loading="eager" decoding="async" alt="" className="entityArt"/>}<div className="entityHeroCopy"><span>{meta.short} · {location.year}</span><h3>{location.name}</h3><p>{location.type} · {location.certainty}{placeMediaFallback?" · series art fallback":""}</p></div></div><div className="detailGrid"><div><small>TYPE</small><b>{location.type}</b></div><div><small>ERA</small><b>{location.year}+</b></div><div><small>DIRECT EPISODES</small><b>{strictEpisodes.length}</b></div><div><small>HISTORY LINKS</small><b>{historicalEpisodes.length}</b></div></div><MediaStrip items={relatedMedia} label="VISUAL ARCHIVE"/><div className="locationHistoryStrip"><span><small>CHRONOLOGY</small><b>{episodes.length?`${Math.min(...episodes.map((e:any)=>Number(e.timelineStart??e.timelineEnd??location.year)))}–${Math.max(...episodes.map((e:any)=>Number(e.timelineEnd??e.timelineStart??location.year)))}`:`${location.year}+`}</b></span><span><small>FIRST EPISODE</small><b>{episodes[0]?.title||"No direct episode"}</b></span><span><small>SERIES</small><b>{new Set(episodes.map((e:any)=>e.seriesId)).size||1}</b></span></div><MiniTimeline items={episodes.map((e:any)=>({id:e.id,start:Number(e.timelineStart??e.timelineEnd??location.year),end:Number(e.timelineEnd??e.timelineStart??location.year),title:e.title,color:meta.color}))} markYear={location.year} onSelect={onEpisode} emptyLabel="No episode-anchored chronology recorded for this location yet."/><FandomIntelligence entityType="locations" entityId={location.id} onCharacter={onCharacter} onEpisode={onEpisode} onLocation={id=>{const l=atlasData.locations.find(x=>x.id===id);if(l)onLocation(l)}}/><div className="sectionTitle">DIRECT EPISODE PRESENCE <span>{episodes.length}</span></div>{episodes.length?<div className="cards">{episodes.map((e:any)=><button className="entityCard episodeCard" key={e.id} onClick={()=>onEpisode(e.id)}><span className="episodeYear">{e.timelineStart||"?"}</span><span><small>{meta.short} · S{String(e.seasonId).slice(-2)}E{String(e.episodeNumber).padStart(2,"0")}</small><b>{e.title}</b><em>{e.certainty} · {e.timelinePrecision}</em></span><Icon name="chevron"/></button>)}</div>:<p className="muted">No direct episode geography link has been recorded.</p>}{historicalEpisodes.length>0&&<><div className="sectionTitle">HISTORICAL REFERENCES <span>{historicalEpisodes.length}</span></div><div className="historicalLinks">{historicalEpisodes.map((e:any)=><button key={e.id} onClick={()=>onEpisode(e.id)}><span><small>CURATED HISTORY · {SERIES_BY_ID[e.seriesId]?.short}</small><b>{e.title}</b><em>{e.timelineStart||"?"} · broader location association</em></span><Icon name="chevron"/></button>)}</div></>}{events.length>0&&<><div className="sectionTitle">MAJOR EVENTS <span>{events.length}</span></div><div className="timelineList">{events.map((e:any)=><article key={e.id}><strong>{e.year}</strong><div><small>EVENT · {meta.short}</small><b>{e.title}</b><span>{e.certainty}</span></div></article>)}</div></>}<div className="sourceNote"><Icon name="pin"/><span>Direct episode geography is kept separate from curated historical references. Approximate placements remain explicitly labeled.</span></div><EntityGraphView heading="CONNECTIONS FROM HERE" root={"location:"+location.id} onCharacter={onCharacter} onLocation={id=>{const l=atlasData.locations.find(x=>x.id===id);if(l)onLocation(l)}} onEpisode={onEpisode} onConnection={onConnection} onCommunity={onCommunity} onFaction={onFaction}/></div>;}
function ConnectionDetail({connectionId,onCharacter,onLocation,onEpisode,onConnection,onCommunity,onFaction}:{connectionId:string;onCharacter:(id:string)=>void;onLocation:(l:Location)=>void;onEpisode:(id:string)=>void;onConnection:(id:string)=>void;onCommunity:(id:string)=>void;onFaction:(id:string)=>void}){
 const connection=atlasData.connections.find((x:any)=>x.id===connectionId) as any;
 if(!connection)return <div className="contentScroll"><p className="muted">Connection record not found.</p></div>;
 const evidence=((atlasData as any).connectionEpisodes?.connections?.[connectionId]??{}) as any;
 const episodeIds=(evidence.episodeIds??[]) as string[];
 const episodes=episodeIds.map(id=>atlasData.episodes.find((e:any)=>e.id===id)).filter(Boolean) as any[];
 const endpoint=(id:string)=>{const pools:any=[atlasData.characters,atlasData.locations,atlasData.communities,atlasData.factions,atlasData.series];for(const pool of pools){const item=pool.find((x:any)=>x.id===id);if(item)return item}return null};
 const from=endpoint(connection.fromId),to=endpoint(connection.toId);
 const endpointLabel=(item:any,id:string)=>item?.name||item?.title||id;
 const endpointKind=(item:any)=>{if(atlasData.characters.some((x:any)=>x.id===item?.id))return "CHARACTER";if(atlasData.locations.some((x:any)=>x.id===item?.id))return "LOCATION";if(atlasData.communities.some((x:any)=>x.id===item?.id))return "COMMUNITY";if(atlasData.factions.some((x:any)=>x.id===item?.id))return "FACTION";if(atlasData.series.some((x:any)=>x.id===item?.id))return "SERIES";return "ENTITY"};
 const contextLocations=[...new Set(episodes.flatMap((e:any)=>e.locationIds??[]))].map(id=>atlasData.locations.find(l=>l.id===id)).filter(Boolean) as Location[];
 const openEndpoint=(item:any)=>{if(!item)return;const id=item.id;if(atlasData.characters.some((x:any)=>x.id===id))onCharacter(id);else if(atlasData.locations.some((x:any)=>x.id===id))onLocation(item as Location)};
 return <div className="contentScroll">
  <div className="connectionHero"><span>UNIVERSE CONNECTION · {connection.type.replaceAll("-"," ").toUpperCase()}</span><h3>{connection.label}</h3><p>{connection.certainty} · {evidence.evidenceKind==="direct"?"episode-level evidence":"curated relationship evidence"}</p></div>
  <div className="connectionEndpoints">
   {[{side:"FROM",item:from,id:connection.fromId},{side:"TO",item:to,id:connection.toId}].map((entry:any)=><article key={entry.side} className="connectionEndpoint"><small>{entry.side} · {endpointKind(entry.item)}</small><b>{endpointLabel(entry.item,entry.id)}</b>{(atlasData.characters.some((x:any)=>x.id===entry.id)||atlasData.locations.some((x:any)=>x.id===entry.id))&&<button onClick={()=>openEndpoint(entry.item)}><span>OPEN ENTITY</span><Icon name="chevron"/></button>}</article>)}
  </div>
  <div className="sectionTitle">RELATIONSHIP FOCUS</div>
  <div className="connectionFocusCard"><div><small>MAP CONTEXT</small><b>{contextLocations.length||"No mapped"} {contextLocations.length===1?"location":"locations"}</b><span>Episode evidence geography is highlighted on the map. Character geography is not inferred beyond the documented evidence.</span></div><button onClick={()=>onConnection(connectionId)}><Icon name="map"/><span>FOCUS BOTH ENDS</span></button></div>
  <MiniTimeline items={episodes.filter((e:any)=>e.timelineStart!=null||e.timelineEnd!=null).map((e:any)=>({id:e.id,start:Number(e.timelineStart??e.timelineEnd),end:Number(e.timelineEnd??e.timelineStart),title:e.title,color:SERIES_BY_ID[e.seriesId]?.color}))} onSelect={onEpisode} emptyLabel="No episode evidence anchored to universe time yet."/>
  {contextLocations.length>0&&<><div className="sectionTitle">EVIDENCE GEOGRAPHY <span>{contextLocations.length}</span></div><div className="miniTags locationLinks">{contextLocations.map(l=><button key={l.id} onClick={()=>onLocation(l)}><Icon name="pin"/>{l.name}</button>)}</div></>}
  {episodes.length>0&&<><div className="sectionTitle">DOCUMENTED EPISODES <span>{episodes.length}</span></div><div className="cards connectionEvidenceEpisodes">{episodes.map((e:any)=><button className="entityCard episodeCard" key={e.id} onClick={()=>onEpisode(e.id)}><span className="episodeYear">{e.timelineStart??"?"}</span><span><small>{SERIES_BY_ID[e.seriesId]?.short} · S{String(e.seasonId).slice(-2)}E{String(e.episodeNumber).padStart(2,"0")}</small><b>{e.title}</b><em>{evidence.evidenceKind==="direct"?"DIRECT EVIDENCE":"CURATED CONTEXT"}</em></span><Icon name="chevron"/></button>)}</div></>}
  <div className="sectionTitle">PROVENANCE</div>
  <div className="sourceNote"><Icon name="layers"/><span>{evidence.basis||"Connection record is part of the atlas relationship registry."} · Certainty: {connection.certainty}. Evidence: {evidence.evidenceKind||"registry"}. {evidence.sourcePages?.length?`${evidence.sourcePages.length} source page${evidence.sourcePages.length===1?"":"s"} recorded.`:"No episode-specific source page is recorded for this relationship."}</span></div>
  <EntityGraphView heading="TRAVERSE THIS LINK" root={"connection:"+connectionId} onCharacter={onCharacter} onLocation={id=>{const l=atlasData.locations.find(x=>x.id===id);if(l)onLocation(l)}} onEpisode={onEpisode} onConnection={onConnection} onCommunity={onCommunity} onFaction={onFaction}/>
 </div>;
}
function EpisodeDetail({episode,onLocation,onEpisode,onCharacter,onConnection,onCommunity,onFaction}:{episode:any;onLocation:(l:Location)=>void;onEpisode:(id:string)=>void;onCharacter:(id:string)=>void;onConnection:(id:string)=>void;onCommunity:(id:string)=>void;onFaction:(id:string)=>void}){
 const raw=atlasData.episodes.find((e:any)=>e.id===episode.id) as any;
 const meta=SERIES_BY_ID[episode.seriesId];
 const derivedConnectionIds=getEpisodeConnectionIds(episode.id);
 const endpointName=(id:string)=>{const pools:any=[atlasData.characters,atlasData.locations,atlasData.communities,atlasData.factions,atlasData.series,atlasData.connections];for(const pool of pools){const item=pool.find((x:any)=>x.id===id);if(item)return item.name||item.title||item.label||id}return id};
 const media=((atlasData as any).media?.episodes?.[episode.id] ?? (episodeMedia as any).episodes?.[episode.id] ?? (atlasData as any).media?.series?.[episode.seriesId]);
 const episodeGallery=[...new Set([
   ...(Array.isArray(media?.gallery)?media.gallery:[]),
   ...(media?.image?[media.image]:[]),
   ...((episodeMedia as any).episodes?.[episode.id]?.gallery??[])
 ].filter(Boolean))].slice(0,18);
 const locations=atlasData.locations.filter(l=>raw?.locationIds?.includes(l.id));
 const ordered=buildChronology().filter(x=>x.kind==="episode");
 const index=ordered.findIndex(x=>x.id===episode.id);
 const prev=ordered[index-1],next=ordered[index+1];
 return <div className="contentScroll">
  <div className="episodeHero" style={{"--accent":meta.color} as CSSProperties}>{media?.image&&<img src={atlasImageUrl(media.image,1200)} onError={e=>onAtlasImageError(e,media.image)} srcSet={atlasImageSrcSet(media.image)} sizes="(max-width: 699px) 94vw, 470px" loading="eager" decoding="async" fetchPriority="high" alt="" className="episodeArt"/>}<div className="episodeHeroCopy"><span>{meta.name} · {episode.seasonId?.toUpperCase()}E{String(episode.episodeNumber).padStart(2,"0")}</span><h3>{episode.title}</h3><div className="episodeMeta"><b>{episode.start===episode.end?episode.start:`${episode.start}–${episode.end}`}</b><em>{episode.certainty}</em><em>{episode.precision}</em></div>{raw?.airDate&&<p className="episodeAirDate">AIRED {new Date(raw.airDate+"T00:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}).toUpperCase()}</p>}</div></div>
  {episodeGallery.length>1&&<MediaStrip items={episodeGallery.map((image:string,i:number)=>({id:episode.id+"-"+i,image,title:i===0?"PRIMARY FRAME":`FRAME ${String(i+1).padStart(2,"0")}`,subtitle:meta.short}))} label="VISUAL ARCHIVE"/>}
  <FandomIntelligence entityType="episodes" entityId={episode.id} onEpisode={onEpisode} onLocation={id=>{const l=atlasData.locations.find(x=>x.id===id);if(l)onLocation(l)}} onCharacter={onCharacter}/>
  {locations.length>0&&<><div className="sectionTitle">LOCATIONS <span>{locations.length}</span></div><div className="miniTags locationLinks">{locations.map(l=><button key={l.id} onClick={()=>onLocation(l)}><Icon name="pin"/>{l.name}</button>)}</div></>}
  {derivedConnectionIds.length>0&&<><div className="sectionTitle">UNIVERSE CONNECTIONS <span>{derivedConnectionIds.length}</span></div><div className="connectionLinks">{derivedConnectionIds.map((id:string)=>{const c=atlasData.connections.find((x:any)=>x.id===id);const evidence=(atlasData as any).connectionEpisodes?.connections?.[id];return c?<article key={id}><small>{c.type.replaceAll("-"," ").toUpperCase()} · {evidence?.evidenceKind==="direct"?"EPISODE EVIDENCE":"CURATED CONTEXT"}</small><button className="connectionFocusButton" onClick={()=>onConnection(id)}><b>{c.label}</b><span>{endpointName(c.fromId)} ↔ {endpointName(c.toId)} · {c.certainty}</span><Icon name="chevron"/></button></article>:null})}</div></>}
  <div className="sectionTitle">CHRONOLOGY NAVIGATION</div>
  <div className="episodeNav">{prev&&<button onClick={()=>onEpisode(prev.id)}><small>PREVIOUS</small><b>{prev.title}</b><span>{prev.start}</span></button>}<div className="chronologyMarker"><span>IN UNIVERSE</span><strong>{episode.start}</strong></div>{next&&<button onClick={()=>onEpisode(next.id)}><small>NEXT</small><b>{next.title}</b><span>{next.start}</span></button>}</div>
  <MiniTimeline items={[{id:episode.id,start:episode.start,end:episode.end,title:episode.title,color:meta.color}]} activeId={episode.id}/>
  <div className="sourceNote"><Icon name="layers"/><span>Air date and in-universe chronology are separate fields. Ranges and uncertain placements stay labeled rather than flattened.</span></div>
  {(()=>{const sources=(raw?.sources??[]).map((id:string)=>atlasData.sources.find((s:any)=>s.id===id)).filter(Boolean) as any[];return sources.length>0&&<><div className="sectionTitle">SOURCES <span>{sources.length}</span></div><div className="sourceDirectory episodeSourceDirectory">{sources.map((source:any)=><a key={source.id} className="sourceDirectoryItem" href={source.url} target="_blank" rel="noreferrer"><span><small>{String(source.type||"source").replaceAll("-"," ").toUpperCase()}</small><b>{source.title}</b><em>{source.note}</em></span><Icon name="arrow"/></a>)}</div></>})()}
  <EntityGraphView heading="CONNECTIONS FROM HERE" root={"episode:"+episode.id} onCharacter={onCharacter} onLocation={id=>{const l=atlasData.locations.find(x=>x.id===id);if(l)onLocation(l)}} onEpisode={onEpisode} onConnection={onConnection} onCommunity={onCommunity} onFaction={onFaction}/>
 </div>;
}

function MapContent({locations,onSelect}:{locations:Location[];onSelect:(l:Location)=>void}){
 const mappedLocations=locations.filter(hasMapCoordinates);
 const unplacedLocations=locations.filter(l=>!hasMapCoordinates(l));
 return <div className="contentScroll">
  <div className="panelSummary"><div><small>ACTIVE MAP LAYER</small><b>{mappedLocations.length} mapped locations</b></div><span>2010–{Math.max(...locations.map(x=>x.year),2010)}</span></div>
  <div className="sectionTitle">MAPPED LOCATIONS <span>{mappedLocations.length}</span></div>
  <div className="cards">{mappedLocations.map(l=>{const pm=(atlasData as any).media?.places?.[l.id];return <button className="entityCard locationCard" key={l.id} onClick={()=>onSelect(l)}>{(()=>{const image=pm?.image||(atlasData as any).media?.series?.[l.seriesId]?.keyArt;return image?<img src={atlasImageUrl(image,720)} onError={e=>onAtlasImageError(e,image)} srcSet={atlasImageSrcSet(image,[360,540,720])} sizes="180px" loading="lazy" decoding="async" alt="" className="cardArt"/>:null})()}<span><small>{SERIES_BY_ID[l.seriesId]?.short} · {l.year}</small><b>{l.name}</b><em>{l.type} · {l.certainty}</em></span><Icon name="chevron"/></button>})}</div>
  {unplacedLocations.length>0&&<><div className="sectionTitle">UNPLACED LOCATIONS <span>{unplacedLocations.length}</span></div><div className="miniTags locationLinks">{unplacedLocations.map(l=><button key={l.id} onClick={()=>onSelect(l)}><Icon name="pin"/>{l.name}<small>{l.certainty}</small></button>)}</div></>}
 </div>
}

function TimelineContent({episodes,onEpisode,onUniverseEvent,onConnections,onYearChange,currentYear}:{episodes:any[];onEpisode:(id:string)=>void;onUniverseEvent:(event:any)=>void;onConnections:()=>void;onYearChange:(year:number)=>void;currentYear:number}){
 const [filter,setFilter]=useState<string>("ALL");
 const [showWebisodes,setShowWebisodes]=useState(false);
 const available=useMemo(()=>Object.keys(META) as SeriesKey[],[]);
 const visible=useMemo(()=>filter==="ALL"?episodes:episodes.filter(e=>e.seriesId===META[filter as SeriesKey].id),[episodes,filter]);
 const latest=episodes.reduce((n,e)=>Math.max(n,Number(e.start??0)),0);
 return <div className="contentScroll">
  <div className="timelineIntro"><span>UNIVERSE TIME</span><h3>Follow the story through in-universe chronology.</h3><p>Use the chronology atlas to see every series on one continuous story-time axis. Click any episode block to open its evidence, geography and connections.</p></div>
  <ChronologyMatrix year={currentYear} onYearChange={onYearChange} series={filter==="ALL"?"ALL":filter as SeriesKey} onEpisode={onEpisode} onConnections={onConnections}/>
  <div className="timelineSnapshot"><div><small>VISIBLE EPISODES</small><b>{visible.length}</b><span>{latest||"—"} latest story year</span></div><div><small>ACTIVE SERIES</small><b>{available.length}</b><span>series represented in this layer</span></div></div>
  <div className="timelineFilters" aria-label="Timeline series filters"><button className={filter==="ALL"?"active":""} onClick={()=>setFilter("ALL")}>ALL <span>{episodes.length}</span></button>{available.map(key=>{const count=episodes.filter(e=>e.seriesId===META[key].id).length;return <button key={key} disabled={!count} className={filter===key?"active":""} onClick={()=>count&&setFilter(key)}>{META[key].short} <span>{count}</span></button>})}</div>
  <div className="sectionTitle">EPISODES <span>{visible.length}</span></div>
  <button className={"timelineSecondaryToggle "+(showWebisodes?"active":"")} onClick={()=>setShowWebisodes(v=>!v)}><span>SECONDARY LAYER</span><b>{showWebisodes?"HIDE":"SHOW"} WEBSERIES</b><small>Release chronology · 63 installments · story placement not forced where exact in-universe dates are unavailable.</small><Icon name={showWebisodes?"chevronUp":"chevron"}/></button>
  <div className="sectionTitle">UNIVERSE EVENTS <span>{((atlasData as any).universeEvents||[]).length}</span></div>
  <div className="universeEventList">{((atlasData as any).universeEvents||[]).map((event:any)=>{const locationIds=(event.locationIds??[]) as string[];const content=<><strong>{event.year}</strong><div><small>{SERIES_BY_ID[event.seriesId]?.short||event.seriesId} · UNIVERSE EVENT</small><b>{event.title}</b><span>{event.description||event.certainty}</span>{locationIds.length>0?<em>{locationIds.length} mapped location{locationIds.length===1?"":"s"} · OPEN MAP</em>:null}</div>{locationIds.length>0?<Icon name="chevron"/>:null}</>;return locationIds.length>0?<button className="universeEventRow" key={event.id} onClick={()=>onUniverseEvent(event)} aria-label={"Open map for "+event.title}>{content}</button>:<article className="universeEventRow" key={event.id}>{content}</article>})}</div>
  <div className="timelineList episodeList timelineCards">{visible.map((e:any)=>{const em=(episodeMedia as any).episodes?.[e.id];const mediaAvailable=Boolean(em?.image);const mediaVerified=em?.status==="verified";return <button className={mediaAvailable?"episodeRow mediaRow hasMedia":"episodeRow mediaRow"} key={e.id} onClick={()=>onEpisode(e.id)}>{mediaAvailable&&<span className="rowMedia"><img src={atlasImageUrl(em.image,240)} onError={e=>onAtlasImageError(e,em.image)} srcSet={atlasImageSrcSet(em.image,[160,240,360])} sizes="80px" loading="lazy" decoding="async" alt="" className="rowThumb"/></span>}<strong>{e.start||"?"}</strong><span><small>{SERIES_BY_ID[e.seriesId]?.short} · S{String(e.seasonId).slice(-2)}E{String(e.episodeNumber).padStart(2,"0")}</small><b>{e.title}</b><em>{e.precision} · {e.certainty}</em></span><i className={mediaVerified?"mediaIndicator verified":mediaAvailable?"mediaIndicator fallback":"mediaIndicator"} aria-label={mediaVerified?"Verified official episode media":mediaAvailable?"AMC series key art fallback":"No episode media available"}/><Icon name="chevron"/></button>})}</div>
  {showWebisodes&&<div className="webisodeLayer"><div className="sectionTitle">WEBSERIES RELEASE CHRONOLOGY <span>{Number((atlasData as any).webisodes?.totalEpisodes||0)}</span></div>{((atlasData as any).webisodes?.series||[]).map((w:any)=><article className="webisodeRow" key={w.id}><strong>{w.releaseStart?.slice(0,4)||"?"}</strong><div><small>{SERIES_BY_ID[w.seriesId]?.short||w.seriesId} · {w.episodeCount} installments</small><b>{w.title}</b><span>{w.releaseStart===w.releaseEnd?w.releaseStart:w.releaseStart+" → "+w.releaseEnd}</span></div></article>)}<p className="muted">Webisodes remain a secondary release-order layer because the current registry does not provide sufficiently precise in-universe dates for every installment.</p></div>}
 </div>
}

function ChronologyMatrix({year,onYearChange,series,onEpisode,onConnections}:{year:number;onYearChange:(year:number)=>void;series:SeriesKey|"ALL";onEpisode:(id:string)=>void;onConnections:()=>void}){
 const [mode,setMode]=useState<"overview"|"focus">("overview");
 const all=useMemo(()=>buildChronology(),[]);
 const min=UNIVERSE_MIN_YEAR,max=UNIVERSE_MAX_YEAR;
 const focusYear=Math.round(year);
 const pos=(y:number)=>yearToPercent(y,min,max);
 const era=useMemo(()=>describeEra(focusYear),[focusYear]);
 const lanes=useMemo(()=>Object.keys(META).filter(k=>all.some(x=>x.seriesId===META[k as SeriesKey].id)) as SeriesKey[],[all]);
 const visible=useMemo(()=>all.filter(x=>series==="ALL"||x.seriesId===META[series].id),[all,series]);
 const byLaneYear=useMemo(()=>{
  const result=new Map<SeriesKey,Map<number,{count:number;episodes:string[];events:string[]}>>();
  for(const key of lanes){
   const map=new Map<number,{count:number;episodes:string[];events:string[]}>();
   for(const item of visible.filter(x=>x.seriesId===META[key].id)){
    const startYear=Math.round(item.start),endYear=Math.round(item.end);
    for(let y=Math.max(min,startYear);y<=Math.min(max,endYear);y++){
     const cell=map.get(y)||{count:0,episodes:[],events:[]};
     cell.count++;
     if(item.kind==="episode")cell.episodes.push(item.id);else cell.events.push(item.id);
     map.set(y,cell);
    }
   }
   result.set(key,map);
  }
  return result;
 },[visible,lanes]);
 const focusItems=useMemo(()=>visible.filter(x=>x.start<=focusYear&&x.end>=focusYear).sort(compareEpisodesChronologically),[visible,focusYear]);
 const focusEpisodes=focusItems.filter(x=>x.kind==="episode");
 const focusEvents=focusItems.filter(x=>x.kind!=="episode");
 const maxCount=useMemo(()=>Math.max(1,...[...byLaneYear.values()].flatMap(m=>[...m.values()].map(v=>v.count))),[byLaneYear]);
 const jump=(y:number)=>onYearChange(Math.max(min,Math.min(max,y)));
 return <section className={"chronologyAtlas"+(mode==="focus"?" focusMode":"")} aria-label="Universe chronology atlas">
  <header className="chronologyAtlasHead">
   <div className="chronologyAtlasTitle"><span className="chronologyAtlasLive"/><div><small>CHRONOLOGY ATLAS</small><h3>See the whole universe at once</h3><p>{visible.length} chronology records · selected year <b>{focusYear}</b> <em className="chronologyAtlasEra">{era.short}</em></p></div></div>
   <div className="chronologyAtlasTools"><button className="chronologyModeButton" onClick={()=>setMode(m=>m==="overview"?"focus":"overview")}>{mode==="overview"?"YEAR FOCUS":"OVERVIEW"}</button><button onClick={()=>jump(focusYear-1)} aria-label="Previous year">−</button><output>{focusYear}</output><button onClick={()=>jump(focusYear+1)} aria-label="Next year">+</button><button className="matrixLinks" onClick={onConnections}>LINKS</button></div>
  </header>
  <div className="chronologyAtlasRead"><span>READING THE ATLAS</span><b>Each block shows how much story activity exists in that series during a year.</b><small>Tap any year column to move the global timeline. Brighter blocks indicate more recorded chronology.</small></div>
  <div className="chronologyAtlasChartWrap">
   <div className="chronologyAtlasChart">
    <div className="chronologyAtlasAxis"><div className="chronologyAtlasAxisLabel">SERIES</div>{[2010,2012,2014,2016,2018,2020,2022,2024,2026,2028].map(y=><button key={y} className={focusYear===y?"current":""} style={{left:pos(y)+"%"}} onClick={()=>jump(y)}>{y}</button>)}</div>
    <div className="chronologyAtlasGrid">
     {lanes.map(key=>{
      const lane=byLaneYear.get(key)!;
      return <div className="chronologyAtlasLane" key={key}>
       <div className="chronologyAtlasLaneName"><i style={{background:META[key].color}}/><span>{META[key].short}</span></div>
       <div className="chronologyAtlasCells">
        {Array.from({length:max-min+1},(_,i)=>min+i).map(y=>{
         const cell=lane.get(y);
         const selected=y===focusYear;
         const intensity=cell?Math.max(.18,Math.min(1,.3+.7*(cell.count/maxCount))):0;
         const label=cell?META[key].name+" · "+y+" · "+cell.count+" record"+(cell.count===1?"":"s"):"No recorded chronology in "+y;
         return <button key={y} className={"chronologyYearCell"+(selected?" selected":"")+(cell?" hasData":"")} style={{"--intensity":String(intensity),"--bar":META[key].color} as CSSProperties} title={label} aria-label={label} onClick={()=>jump(y)}>{cell&&<><span className="chronologyCellBar"/>{cell.count>1&&<b>{cell.count}</b>}</>}</button>;
        })}
       </div>
      </div>;
     })}
     <div className="chronologyAtlasCursor" style={{left:pos(focusYear)+"%"}}><span>{focusYear}</span></div>
    </div>
   </div>
  </div>
  <div className="chronologyAtlasControls"><div><b>{focusYear}</b><span>UNIVERSE YEAR</span></div><input type="range" min={min} max={max} step="1" value={focusYear} onChange={e=>jump(Number(e.target.value))} aria-label="Select universe year"/><button onClick={()=>{const next=focusYear>=max?min:focusYear+1;jump(next)}}>{focusYear>=max?"START":"NEXT YEAR"} <span>→</span></button></div>
  <div className="chronologyAtlasFocus">
   <div className="chronologyAtlasFocusHead"><div><small>YEAR FOCUS</small><b>{focusYear}</b><em className="chronologyAtlasEra">{era.short}</em></div><span>{focusEpisodes.length} episodes · {focusEvents.length} events</span></div>
   {(focusEpisodes.length||focusEvents.length)?<div className="chronologyFocusList">{focusItems.slice(0,8).map(item=><button key={item.kind+":"+item.id} onClick={()=>item.kind==="episode"?onEpisode(item.id):jump(item.start)}><strong>{META[(Object.keys(META) as SeriesKey[]).find(k=>META[k].id===item.seriesId) as SeriesKey]?.short||item.seriesId}</strong><span><small>{item.kind==="episode"?"EPISODE":"EVENT"}</small><b>{item.title}</b></span><i>{Math.round(item.start)}{item.end!==item.start?"–"+Math.round(item.end):""}</i></button>)}{focusItems.length>8&&<small className="chronologyFocusMore">+{focusItems.length-8} more records in the episode list below.</small>}</div>:<p className="muted">No chronology records overlap this year.</p>}
  </div>
 </section>;
}

function CharacterDetail({characterId,onEpisode,onLocation,onCharacter,onConnection,onJourney,onCommunity,onFaction}:{characterId:string;onEpisode:(id:string)=>void;onLocation:(l:Location)=>void;onCharacter:(id:string)=>void;onConnection:(id:string)=>void;onJourney:()=>void;onCommunity:(id:string)=>void;onFaction:(id:string)=>void}){
 const [runtimeEpisodeIds,setRuntimeEpisodeIds]=useState<string[]|null>(null);
 useEffect(()=>{let active=true;void getRuntimeEpisodeIds("character",characterId).then(ids=>{if(active)setRuntimeEpisodeIds(ids)});return()=>{active=false}},[characterId]);
 const character=atlasData.characters.find((x:any)=>x.id===characterId) as any;
 if(!character)return null;
 const eps=(runtimeEpisodeIds??getCharacterEpisodeIds(characterId)).map(id=>atlasData.episodes.find((e:any)=>e.id===id)).filter(Boolean).sort(compareEpisodesChronologically);
 const locations=[...new Set(eps.flatMap((e:any)=>e.locationIds??[]))].map(id=>atlasData.locations.find(l=>l.id===id)).filter(Boolean) as Location[];
 const links=atlasData.connections.filter((x:any)=>x.fromId===characterId||x.toId===characterId);
 const media=(atlasData as any).media?.characters?.[characterId];
 const characterImage=media?.image||(atlasData as any).media?.series?.[character.seriesIds?.[0]]?.keyArt;
 const characterMediaFallback=!media?.image&&Boolean(characterImage); const characterGallery=eps.map((e:any)=>{const m=(episodeMedia as any).episodes?.[e.id];return {src:m?.image,title:e.title,meta:e.seriesId?SERIES_BY_ID[e.seriesId]?.short:""}}).filter((x:any)=>x.src).slice(0,18);
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
   {characterImage&&<img src={atlasImageUrl(characterImage,1200)} onError={e=>onAtlasImageError(e,characterImage)} srcSet={atlasImageSrcSet(characterImage)} sizes="(max-width: 699px) 92vw, 470px" loading="eager" decoding="async" alt="" className="entityArt"/>}
   <div className="entityHeroCopy"><span>CHARACTER · {(character.seriesIds||[]).map((id:string)=>SERIES_BY_ID[id]?.short).filter(Boolean).join(" · ")}</span><h3>{character.name}</h3><p>{character.certainty||"tracked"} · {eps.length} linked episodes{characterMediaFallback?" · series art fallback":""}</p></div>
  </div>
  <MediaStrip items={characterGallery} label="VISUAL ARCHIVE"/>
  <FandomIntelligence entityType="characters" entityId={characterId} onEpisode={onEpisode} onLocation={id=>{const l=atlasData.locations.find(x=>x.id===id);if(l)onLocation(l)}} onCharacter={onCharacter}/>
  <div className="detailGrid"><div><small>EPISODES</small><b>{eps.length}</b></div><div><small>LOCATIONS</small><b>{locations.length}</b></div><div><small>SERIES</small><b>{(character.seriesIds||[]).length}</b></div><div><small>LINKS</small><b>{links.length}</b></div></div>
  <MiniTimeline items={eps.filter((e:any)=>e.timelineStart!=null||e.timelineEnd!=null).map((e:any)=>({id:e.id,start:Number(e.timelineStart??e.timelineEnd),end:Number(e.timelineEnd??e.timelineStart),title:e.title,color:SERIES_BY_ID[e.seriesId]?.color}))} onSelect={onEpisode} emptyLabel="No episode-anchored chronology recorded for this character yet."/>
  <div className="sectionTitle">SERIES JOURNEY <span>{seriesSpans.length}</span></div>
  {seriesSpans.length?<div className="journeyRail">{seriesSpans.map((span:any,i:number)=><div className="journeySegment" key={span.seriesId+i} style={{"--accent":SERIES_BY_ID[span.seriesId]?.color||"#8f9b9c"} as CSSProperties}><span>{SERIES_BY_ID[span.seriesId]?.short||span.seriesId}</span><b>{span.count}</b><small>{span.start}{span.end!==span.start?"–"+span.end:""}</small>{i<seriesSpans.length-1&&<i aria-hidden="true">→</i>}</div>)}</div>:<p className="muted">No episode-level character links have been recorded yet.</p>}
  <div className="sectionTitle">EPISODE JOURNEY <span>{eps.length}</span></div>
  {eps.length?<div className="timelineList characterJourney">{eps.map((e:any,i:number)=>{
    const previous=eps[i-1]; const transitioned=!!previous&&previous.seriesId!==e.seriesId;
    return <div key={e.id}>{transitioned&&<div className="journeyTransition"><span>UNIVERSE TRANSITION</span><b>{SERIES_BY_ID[previous.seriesId]?.short} → {SERIES_BY_ID[e.seriesId]?.short}</b></div>}<button onClick={()=>onEpisode(e.id)}><strong>{e.timelineStart??"?"}</strong><div><small>{SERIES_BY_ID[e.seriesId]?.short} · S{String(e.seasonId).slice(-2)}E{String(e.episodeNumber).padStart(2,"0")}</small><b>{e.title}</b><span>{(e.locationIds||[]).length} locations · {e.certainty}</span></div><Icon name="chevron"/></button></div>;
  })}</div>:null}
  {locations.length>0&&<div className="journeyMapAction"><div><small>MAP CONTEXT</small><b>See the complete recorded journey</b><span>Show every episode-linked location for this character on the map, without inferring unrecorded travel.</span></div><button onClick={onJourney}><Icon name="map"/><span>SHOW JOURNEY</span></button></div>}
  <div className="sectionTitle">GEOGRAPHY <span>{locations.length}</span></div>
  <div className="miniTags locationLinks">{locations.map(l=><button key={l.id} onClick={()=>onLocation(l)}><Icon name="pin"/>{l.name}</button>)}</div>
  {links.length>0&&<><div className="sectionTitle">DOCUMENTED CONNECTIONS <span>{links.length}</span></div><div className="connectionLinks">{links.map((x:any)=>{
    const other=x.fromId===characterId?x.toId:x.fromId;
    const otherCharacter=atlasData.characters.find((c:any)=>c.id===other);
    return <article key={x.id}><small>{x.type.replaceAll("-"," ").toUpperCase()} · {x.certainty}</small><button className="connectionFocusButton" onClick={()=>onConnection(x.id)}><b>{x.label}</b><Icon name="chevron"/></button>{otherCharacter?<button className="connectionTarget" onClick={()=>onCharacter(otherCharacter.id)}>{otherCharacter.name}<Icon name="chevron"/></button>:<span>{endpointName(x.fromId)} → {endpointName(x.toId)}</span>}</article>;
  })}</div></>}
  <EntityGraphView heading="CONNECTIONS FROM HERE" root={"character:"+characterId} onCharacter={onCharacter} onLocation={id=>{const l=atlasData.locations.find(x=>x.id===id);if(l)onLocation(l)}} onEpisode={onEpisode} onConnection={onConnection} onCommunity={onCommunity} onFaction={onFaction}/>
 </div>;
}
function GroupDetail({kind,groupId,onCharacter,onLocation,onEpisode,onConnection,onCommunity,onFaction}:{kind:"community"|"faction";groupId:string;onCharacter:(id:string)=>void;onLocation:(l:Location)=>void;onEpisode:(id:string)=>void;onConnection:(id:string)=>void;onCommunity:(id:string)=>void;onFaction:(id:string)=>void}){
 const group=(kind==="community"?atlasData.communities:atlasData.factions).find((x:any)=>x.id===groupId) as any;
 if(!group)return <div className="contentScroll"><p className="muted">{kind==="community"?"Community":"Faction"} record not found.</p></div>;
 const eps=getGroupEpisodeIds(kind,groupId).map(id=>atlasData.episodes.find((e:any)=>e.id===id)).filter(Boolean).sort(compareEpisodesChronologically) as any[];
 const locations=[...new Set(eps.flatMap((e:any)=>e.locationIds??[]))].map(id=>atlasData.locations.find(l=>l.id===id)).filter(Boolean) as Location[];
 const members=[...new Set(eps.flatMap((e:any)=>e.characterIds??[]))].map(id=>atlasData.characters.find((c:any)=>c.id===id)).filter(Boolean) as any[];
 const links=atlasData.connections.filter((x:any)=>x.fromId===groupId||x.toId===groupId);
 const accent=SERIES_BY_ID[eps[0]?.seriesId]?.color||"#aab7b3";
 const endpointName=(id:string)=>{const pools:any=[atlasData.characters,atlasData.locations,atlasData.communities,atlasData.factions,atlasData.series];for(const pool of pools){const item=pool.find((x:any)=>x.id===id);if(item)return item.name||item.title||id}return id};
 return <div className="contentScroll">
  <div className="connectionHero" style={{"--accent":accent} as CSSProperties}><span>{kind.toUpperCase()}{group.type?" · "+String(group.type).replaceAll("-"," ").toUpperCase():""}</span><h3>{group.name}</h3><p>{group.certainty} · {eps.length} linked episodes</p></div>
  <div className="detailGrid"><div><small>EPISODES</small><b>{eps.length}</b></div><div><small>MEMBERS</small><b>{members.length}</b></div><div><small>LOCATIONS</small><b>{locations.length}</b></div><div><small>LINKS</small><b>{links.length}</b></div></div>
  <MiniTimeline items={eps.filter((e:any)=>e.timelineStart!=null||e.timelineEnd!=null).map((e:any)=>({id:e.id,start:Number(e.timelineStart??e.timelineEnd),end:Number(e.timelineEnd??e.timelineStart),title:e.title,color:SERIES_BY_ID[e.seriesId]?.color}))} onSelect={onEpisode} emptyLabel={`No episode-anchored chronology recorded for this ${kind} yet.`}/>
  {members.length>0&&<><div className="sectionTitle">MEMBERS <span>{members.length}</span></div><div className="miniTags">{members.map((c:any)=><button key={c.id} onClick={()=>onCharacter(c.id)}><Icon name="people"/>{c.name}</button>)}</div></>}
  {locations.length>0&&<><div className="sectionTitle">TERRITORY <span>{locations.length}</span></div><div className="miniTags locationLinks">{locations.map(l=><button key={l.id} onClick={()=>onLocation(l)}><Icon name="pin"/>{l.name}</button>)}</div></>}
  {eps.length>0&&<><div className="sectionTitle">EPISODES <span>{eps.length}</span></div><div className="cards">{eps.map((e:any)=><button className="entityCard episodeCard" key={e.id} onClick={()=>onEpisode(e.id)}><span className="episodeYear">{e.timelineStart??"?"}</span><span><small>{SERIES_BY_ID[e.seriesId]?.short} · S{String(e.seasonId).slice(-2)}E{String(e.episodeNumber).padStart(2,"0")}</small><b>{e.title}</b><em>{e.certainty}</em></span><Icon name="chevron"/></button>)}</div></>}
  {links.length>0&&<><div className="sectionTitle">DOCUMENTED CONNECTIONS <span>{links.length}</span></div><div className="connectionLinks">{links.map((x:any)=><article key={x.id}><small>{x.type.replaceAll("-"," ").toUpperCase()} · {x.certainty}</small><button className="connectionFocusButton" onClick={()=>onConnection(x.id)}><b>{x.label}</b><span>{endpointName(x.fromId)} → {endpointName(x.toId)}</span></button></article>)}</div></>}
  {!eps.length&&!links.length&&<p className="muted">No episode geography or documented connections have been recorded for this {kind} yet.</p>}
  <div className="sourceNote"><Icon name="layers"/><span>Membership and territory are derived from documented episode geography rather than authored history.</span></div>
  <EntityGraphView heading="CONNECTIONS FROM HERE" root={kind+":"+groupId} onCharacter={onCharacter} onLocation={id=>{const l=atlasData.locations.find(x=>x.id===id);if(l)onLocation(l)}} onEpisode={onEpisode} onConnection={onConnection} onCommunity={onCommunity} onFaction={onFaction}/>
 </div>;
}
function PeopleContent({onCharacter,onLocation,onEpisode,onConnection,onCommunity,onFaction}:{onCharacter:(id:string)=>void;onLocation:(id:string)=>void;onEpisode:(id:string)=>void;onConnection:(id:string)=>void;onCommunity:(id:string)=>void;onFaction:(id:string)=>void}){
 const [query,setQuery]=useState("");
 const q=query.trim().toLowerCase();
 const characters=atlasData.characters.filter((c:any)=>!q||c.name.toLowerCase().includes(q));
 // The character grid otherwise carries zero chronology cues — a visitor has to open a
 // card to learn even roughly where in universe time someone belongs. Deriving each
 // character's earliest anchored episode year once (buildChronology is memoized, so
 // this is cheap) lets the grid itself carry a "Time" cue, consistent with the rest of
 // the app's Time -> Story -> Geography loop.
 const characterFirstYear=useMemo(()=>{
  const map=new Map<string,number>();
  for(const item of buildChronology()){
   if(item.kind!=="episode")continue;
   const y=Number(item.start);
   if(!Number.isFinite(y)||y<=0)continue;
   for(const id of item.characterIds??[]){
    const prev=map.get(id);
    if(prev===undefined||y<prev)map.set(id,y);
   }
  }
  return map;
 },[]);
 return <div className="contentScroll">
  <div className="peopleHero"><div><small>PEOPLE INDEX</small><b>{atlasData.characters.length} tracked characters</b></div><span>{atlasData.connections.length} documented connections</span></div>
  <div className="peopleIntro"><small>START WITH A PERSON</small><p>Select a character to follow their episode journey, geography, and documented links across the universe.</p></div>
  <div className="peopleSearch"><span>SEARCH PEOPLE</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Find a character…" aria-label="Search characters"/></div>
  <EntityGraphView heading="EXPLORE CONNECTIONS" onCharacter={onCharacter} onLocation={onLocation} onEpisode={onEpisode} onConnection={onConnection} onCommunity={onCommunity} onFaction={onFaction}/>
  <div className="sectionTitle">CHARACTERS <span>{characters.length} OF {atlasData.characters.length}</span></div>
  <div className="peopleGrid">{characters.map((c:any)=>{const cm=(atlasData as any).media?.characters?.[c.id];const firstYear=characterFirstYear.get(c.id);const image=cm?.image;return <button className="entityCard characterCard" key={c.id} onClick={()=>onCharacter(c.id)}><CharacterPortrait character={c} image={image} gallery={cm?.gallery||[]} size={58}/><span><small>CHARACTER{firstYear!=null&&<em className="characterFirstYear">{firstYear}</em>}</small><b>{c.name}</b><em>{(c.seriesIds||[]).map((id:string)=>SERIES_BY_ID[id]?.short).filter(Boolean).join(" · ")||c.certainty}</em></span><Icon name="chevron"/></button>})}</div>
  {!characters.length&&<p className="muted">No tracked character matches "{query}".</p>}
  <div className="sectionTitle">FACTIONS <span>{atlasData.factions.length}</span></div><div className="miniTags">{atlasData.factions.map((f:any)=><button className="entityTagButton" key={f.id} onClick={()=>onFaction(f.id)}>{f.name}<small className="entityTagMeta">{f.certainty}</small></button>)}</div><div className="sectionTitle">COMMUNITIES <span>{atlasData.communities.length}</span></div><div className="miniTags">{atlasData.communities.map((c:any)=><button className="entityTagButton" key={c.id} onClick={()=>onCommunity(c.id)}>{c.name}<small className="entityTagMeta">{[c.type?.replaceAll("-"," "),c.certainty].filter(Boolean).join(" · ")}</small></button>)}</div>
  <div className="sectionTitle">DOCUMENTED CONNECTIONS <span>{atlasData.connections.length}</span></div><div className="timelineList connectionDirectory">{atlasData.connections.map((c:any)=>{const name=(id:string)=>{const pools:any=[atlasData.characters,atlasData.locations,atlasData.communities,atlasData.factions,atlasData.series,atlasData.connections];for(const pool of pools){const item=pool.find((x:any)=>x.id===id);if(item)return item.name||item.title||item.label||id}return id};return <article key={c.id}><strong>↔</strong><div><small>{c.type.replaceAll("-"," ").toUpperCase()}</small><button className="connectionFocusButton" onClick={()=>onConnection(c.id)}><b>{c.label}</b><Icon name="chevron"/></button><span>{name(c.fromId)} → {name(c.toId)} · {c.certainty}</span></div></article>})}</div>
 </div>}
function GuideContent({errors,onView,onWatchOrder}:{errors:string[];onView:(view:View)=>void;onWatchOrder:()=>void}){const episodeCount=atlasData.seasonMeta.reduce((n:any,x:any)=>n+x.episodeCount,0);const episodeWatchOrder=getEpisodeWatchOrder();const anchoredWatchOrder=episodeWatchOrder.filter(x=>x.chronologyStatus==="anchored").length;const sharedYearWatchOrder=episodeWatchOrder.filter(x=>x.chronologyStatus==="shared-year").length;const webisodeCount=Number((atlasData as any).webisodes?.totalEpisodes||0);const art=(atlasData as any).media?.series?.twd?.keyArt;const mediaEntries=Object.values((episodeMedia as any).episodes||{}) as any[];const mediaBySeries=Object.values(SERIES_BY_ID).map(meta=>{const rows=mediaEntries.filter((m:any)=>m.seriesId===meta.id);return {meta,total:rows.length,verified:rows.filter((m:any)=>m.status==="verified").length,available:rows.filter((m:any)=>Boolean(m.image)).length}}).filter(x=>x.total>0);const mediaGaps=atlasData.episodes.filter((e:any)=>{const m=(episodeMedia as any).episodes?.[e.id];return !m?.image}).slice(0,12);const verified=mediaEntries.filter(m=>m.status==="verified").length;const available=mediaEntries.filter(m=>Boolean(m.image)).length;return <div className="contentScroll"><div className="guideHero">{art&&<img src={atlasImageUrl(art,1200)} onError={e=>onAtlasImageError(e,art)} srcSet={atlasImageSrcSet(art)} sizes="(max-width: 699px) 94vw, 470px" loading="eager" decoding="async" fetchPriority="high" alt="" className="guideArt"/>}<div className="guideHeroCopy"><span>FIELD GUIDE</span><h3>Find your way through the Walking Dead universe.</h3><p>Use the map to travel through geography, the timeline to browse chronology, or People to follow documented character journeys.</p></div></div><div className="guidePaths"><button onClick={()=>onView("map")}><span className="guidePathIcon"><Icon name="map"/></span><div><small>START WITH THE MAP</small><b>Explore the world</b><span>See locations in their historical context.</span></div><Icon name="chevron"/></button><button onClick={()=>onView("timeline")}><span className="guidePathIcon"><Icon name="timeline"/></span><div><small>BROWSE CHRONOLOGY</small><b>Follow universe time</b><span>Scrub from the outbreak through the later stories.</span></div><Icon name="chevron"/></button><button onClick={()=>onView("people")}><span className="guidePathIcon"><Icon name="people"/></span><div><small>FOLLOW A PERSON</small><b>Trace a character journey</b><span>Move through episodes, places and documented links.</span></div><Icon name="chevron"/></button><button onClick={onWatchOrder}><span className="guidePathIcon"><Icon name="play"/></span><div><small>WATCH IN ORDER</small><b>Follow the chronological watch order</b><span>Every episode across every series, ordered by when it happens in-universe.</span></div><Icon name="chevron"/></button></div><div className="sectionTitle">ATLAS AT A GLANCE <span>VERIFIED DATA</span></div><div className="guideStats"><div><b>{atlasData.series.length}</b><span>SERIES</span></div><div><b>{atlasData.locations.length}</b><span>LOCATIONS</span></div><div><b>{episodeCount}</b><span>EPISODES</span></div><div><b>{atlasData.connections.length}</b><span>LINKS</span></div></div><div className="guideSecondary"><button onClick={onWatchOrder}><small>WATCH ORDER</small><b>{episodeWatchOrder.length} episode anchors</b><span>{anchoredWatchOrder} anchored · {sharedYearWatchOrder} shared-year · {webisodeCount} webisodes tracked separately.</span></button><div><small>MEDIA COVERAGE</small><b>{available} / {episodeCount}</b><span>{verified} episode-specific assets verified · {available-verified} AMC series-art fallbacks.</span></div></div><div className="sectionTitle">MEDIA AUDIT <span>{available}/{episodeCount}</span></div><div className="mediaAuditGrid">{mediaBySeries.map((row:any)=><div key={row.meta.id}><small>{row.meta.short}</small><b>{row.available}/{row.total}</b><span>{row.verified} verified · {Math.max(0,row.available-row.verified)} fallback</span></div>)}</div>{mediaGaps.length>0&&<div className="mediaGapNote"><b>UNRESOLVED EPISODE MEDIA</b><span>{mediaGaps.map((e:any)=>`${SERIES_BY_ID[e.seriesId]?.short||e.seriesId} S${String(e.seasonId).slice(-2)}E${String(e.episodeNumber).padStart(2,"0")}`).join(" · ")}</span></div>}<div className="guideStatus"><div><small>ATLAS STATUS</small><b>{errors.length?"REVIEW REFERENCES":"REGISTRY HEALTHY"}</b><span>{errors.length?errors.slice(0,5).join(" · ")+(errors.length>5?` · +${errors.length-5} more`:""):"Core IDs and relationships pass the atlas validator."}</span></div><div><small>LIVE SYSTEMS</small><span>Browser performance · gesture telemetry · entity indexes</span></div></div><div className="sectionTitle">SOURCES &amp; METHODOLOGY <span>{atlasData.sources.length}</span></div><div className="sourceDirectory">{atlasData.sources.map((source:any)=><a key={source.id} className="sourceDirectoryItem" href={source.url} target="_blank" rel="noreferrer"><span><small>{String(source.type||"source").replaceAll("-"," ").toUpperCase()}</small><b>{source.title}</b><em>{source.note}</em></span><Icon name="arrow"/></a>)}</div><div className="sourceMethodology"><b>CERTAINTY MODEL</b><span>Confirmed facts, source-derived context, approximate geography, and unresolved placements remain explicitly distinguished.</span><span>Air dates are release metadata; in-universe chronology is modeled separately.</span><span>Unknown coordinates are left unplaced rather than fabricated.</span></div></div>}
function WatchOrderContent({episodes,watched,onToggleWatched,onResetWatched,onEpisode}:{episodes:EpisodeWatchOrderItem[];watched:Set<string>;onToggleWatched:(id:string)=>void;onResetWatched:()=>void;onEpisode:(id:string)=>void}){
 const watchedCount=episodes.reduce((n,e)=>n+(watched.has(e.id)?1:0),0);
 const nextUp=episodes.find(e=>!watched.has(e.id));
 const pct=episodes.length?Math.round((watchedCount/episodes.length)*100):0;
 return <div className="contentScroll">
  <div className="connectionHero"><span>CHRONOLOGICAL WATCH ORDER</span><h3>Watch the universe in story order</h3><p>{episodes.length} episodes ordered by in-universe time, crossing every series.</p></div>
  <div className="watchProgress"><div className="watchProgressBar"><i style={{width:pct+"%"}}/></div><div className="watchProgressStats"><b>{watchedCount} / {episodes.length} watched</b><span>{pct}%</span></div></div>
  {nextUp?<div className="journeyMapAction"><div><small>UP NEXT</small><b>{nextUp.title}</b><span>{SERIES_BY_ID[nextUp.seriesId]?.short} · S{String(nextUp.seasonId).slice(-2)}E{String(nextUp.episodeNumber).padStart(2,"0")} · {nextUp.start}</span></div><button onClick={()=>onEpisode(nextUp.id)}><Icon name="play"/><span>WATCH</span></button></div>:<p className="muted">Every tracked episode is marked watched.</p>}
  {watchedCount>0&&<button className="entityTagButton watchResetButton" onClick={onResetWatched}>RESET PROGRESS</button>}
  <div className="sectionTitle">FULL ORDER <span>{episodes.length}</span></div>
  <div className="watchOrderList">{episodes.map(e=>{
   const isWatched=watched.has(e.id);
   return <div className={"watchOrderRow"+(isWatched?" isWatched":"")} key={e.id}>
    <button className="watchOrderCheck" aria-pressed={isWatched} aria-label={isWatched?`Mark ${e.title} unwatched`:`Mark ${e.title} watched`} onClick={()=>onToggleWatched(e.id)}>{isWatched?"✓":""}</button>
    <button className="watchOrderMeta" onClick={()=>onEpisode(e.id)}>
     <span className="watchOrderSeq">{e.sequence}</span>
     <span className="watchOrderInfo"><small>{SERIES_BY_ID[e.seriesId]?.short} · S{String(e.seasonId).slice(-2)}E{String(e.episodeNumber).padStart(2,"0")} · {e.start}{e.chronologyStatus!=="anchored"?` · ${e.chronologyStatus.replaceAll("-"," ").toUpperCase()}`:""}</small><b>{e.title}</b></span>
     <Icon name="chevron"/>
    </button>
   </div>;
  })}</div>
 </div>;
}
