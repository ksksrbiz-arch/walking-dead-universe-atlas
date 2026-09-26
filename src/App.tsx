import {memo,useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState} from "react";
import type {CSSProperties} from "react";
import {geoEqualEarth,geoPath} from "d3-geo";
import {feature} from "topojson-client";
// @ts-ignore world-atlas ships JSON topology
import world from "@cublya/world-atlas/countries-50m.json";
import {atlasData} from "./data";
import type {Location,SeriesKey} from "./data";
import {validateAtlasData} from "./lib/validateData";
import {buildChronology,compareEpisodesChronologically,describeEra,UNIVERSE_MIN_YEAR,UNIVERSE_MAX_YEAR} from "./lib/chronology";
import {useAtlasFocusController} from "./lib/entityFocus";
import type {AtlasFocus,AtlasFocusKind} from "./lib/entityFocus";
import {getCharacterEpisodeIds,getLocationEpisodeIds} from "./lib/entityGraph";
import {useWatchProgress} from "./lib/watchProgress";
import {useFollowedCharacters} from "./lib/followedCharacters";
import {initAtlasPerformance,trackAtlasMetric} from "./lib/performance";
import {getRuntimeMeta,getRuntimeRelationships} from "./lib/runtime";
import {AtlasContext} from "./lib/atlasContext";
import type {AtlasActions} from "./lib/atlasContext";
import {META,SERIES_KEYS,SERIES_BY_ID,seriesColor} from "./lib/series";
import {characterById,connectionById,communityById,episodeById,factionById,locationById,entityName} from "./lib/lookup";
import {JOURNEY_COLORS,beatForYear,beatYear,buildBeats,buildJourney,parseJourneyIds,positionsAt} from "./lib/journeys";
import {JourneyAvatars,JourneyRoutes} from "./components/JourneyLayer";
import HordeLayer from "./components/HordeLayer";
import JourneyPanel,{JourneyPlayer} from "./views/JourneyPanel";
import type {JourneyControls} from "./views/JourneyPanel";
import {MAP_LAYERS,MAP_LAYER_LABELS,clamp,hasMapCoordinates,locationIconName,locationMapLayer,prettyType} from "./lib/atlasHelpers";
import type {MapLayer} from "./lib/atlasHelpers";
import AtlasIcon,{AtlasIconGlyph} from "./components/AtlasIcon";
import AtlasTimelineDock from "./components/AtlasTimelineDock";
import ErrorBoundary from "./components/ErrorBoundary";
import Icon from "./components/Icon";
import type {IconName} from "./components/Icon";
import SearchOverlay from "./components/SearchOverlay";
import type {SearchKind} from "./components/SearchOverlay";
import TimeScrubber from "./components/TimeScrubber";
import MapOverview from "./views/MapOverview";
import TimelineView from "./views/TimelineView";
import PeopleView from "./views/PeopleView";
import WatchView from "./views/WatchView";
import EpisodeDetail from "./views/details/EpisodeDetail";
import LocationDetail from "./views/details/LocationDetail";
import CharacterDetail from "./views/details/CharacterDetail";
import GroupDetail from "./views/details/GroupDetail";
import ConnectionDetail from "./views/details/ConnectionDetail";

type View="map"|"timeline"|"people"|"watch";
type Snap="peek"|"half"|"full";
type NavEntry={view:View;focus:AtlasFocus|null;scroll:number};

const TABS:{view:View;label:string;icon:IconName}[]=[
 {view:"map",label:"Map",icon:"map"},
 {view:"timeline",label:"Timeline",icon:"timeline"},
 {view:"people",label:"People",icon:"people"},
 {view:"watch",label:"Watch",icon:"watch"}
];
const FOCUS_LABEL:Record<AtlasFocusKind,string>={location:"Place",episode:"Episode",character:"Character",connection:"Link",community:"Community",faction:"Faction"};

// ---- Static geography -------------------------------------------------------
// Projection, topology and per-country paths never change after load, so the
// expensive d3-geo work happens once at module load instead of per render.
const projection=geoEqualEarth().fitExtent([[24,22],[976,578]],{type:"Sphere"});
const pathGenerator=geoPath(projection);
const worldCountries:any=feature(world as any,(world as any).objects.countries) as any;
const worldLand:any=feature(world as any,(world as any).objects.land) as any;
const project=(lat:number,lng:number)=>{const p=projection([lng,lat]);return {x:p?.[0]??0,y:p?.[1]??0}};
const countryPalette=["#2a312d","#2d342f","#29302b","#303731","#2c332f","#2f3530","#2b322c","#313832"];
const sphereD=pathGenerator({type:"Sphere"}) as string;
const worldLandD=pathGenerator(worldLand) as string;
const worldCountryPaths=worldCountries.features.map((c:any,i:number)=>({key:(c.id||c.properties?.name||"country")+"-"+i,d:pathGenerator(c) as string,fill:countryPalette[i%countryPalette.length],name:c.properties?.name||"Country"}));
// No props, output never changes: React skips re-diffing ~250 country paths on every state change.
const MapBackground=memo(function MapBackground(){
 return <><rect width="1000" height="600" fill="url(#ocean)"/><rect width="1000" height="600" fill="url(#oceanGlow)"/></>;
});
const MapGeography=memo(function MapGeography(){
 return <>
  <g className="graticule"><path d={sphereD}/></g>
  <path className="landShadow" d={worldLandD}/>
  <g className="countries">{worldCountryPaths.map((c:any)=><path key={c.key} d={c.d} fill={c.fill}><title>{c.name}</title></path>)}</g>
 </>;
});
const KEY_PLACES=new Set(["Alexandria","Hilltop","King County","Woodbury","Oceanside","Commonwealth","Terminus","Atlanta","Los Angeles","Paris","Manhattan"]);

const readLayout=()=>{
 if(typeof window==="undefined")return {panel:false,touch:true};
 const w=window.innerWidth,h=window.innerHeight;
 return {panel:w>=900||(w>h&&h<560&&w>=640),touch:w<700||(w<=900&&h<=600)||window.matchMedia?.("(pointer: coarse)").matches};
};
// Shareable state lives in the URL: ?j=<ids>&at=<beat> for journeys,
// ?place= / ?ep= / ?who= for a focused record. /j/…, /p/…, /e/…, /c/… are the
// short share paths (served with preview cards by api/share.ts on Vercel; any
// other host falls back to index.html and they are read here).
type DeepLink={journey?:string[];at?:number;kind?:AtlasFocusKind;id?:string};
const SHARE_PATHS:Record<string,AtlasFocusKind>={p:"location",e:"episode",c:"character"};
const QUERY_KEYS:Partial<Record<AtlasFocusKind,string>>={location:"place",episode:"ep",character:"who",connection:"link",community:"community",faction:"faction"};
const decodePathPart=(value:string)=>{try{return decodeURIComponent(value)}catch{return value}};
// Map (/) has no path of its own — Timeline/People/Watch each get a real,
// bookmarkable/shareable path so browser reload and direct navigation work,
// with vercel.json rewriting each one to index.html for the SPA.
const VIEW_TO_PATH:Record<View,string>={map:"/",timeline:"/timeline",people:"/people",watch:"/watch"};
const PATH_TO_VIEW:Record<string,View>={"/timeline":"timeline","/people":"people","/watch":"watch"};
const readInitialView=():View=>typeof window==="undefined"?"map":PATH_TO_VIEW[window.location.pathname]??"map";
const VIEW_TITLE:Record<View,string>={map:"TWDU Atlas — Walking Dead Universe map & timeline",timeline:"Chronology · TWDU Atlas",people:"People index · TWDU Atlas",watch:"Watch progress · TWDU Atlas"};
function readDeepLink():DeepLink{
 if(typeof window==="undefined")return {};
 const u=new URL(window.location.href);
 const m=u.pathname.match(/^\/(j|p|e|c)\/([^/]+)\/?$/);
 const at=Number(u.searchParams.get("at"));
 const journey=parseJourneyIds(m?.[1]==="j"?decodePathPart(m[2]):u.searchParams.get("j"));
 if(journey.length)return {journey,at:Number.isFinite(at)&&u.searchParams.has("at")?at/100:undefined};
 if(m&&SHARE_PATHS[m[1]])return {kind:SHARE_PATHS[m[1]],id:decodePathPart(m[2])};
 for(const [kind,key] of Object.entries(QUERY_KEYS))if(u.searchParams.get(key!))return {kind:kind as AtlasFocusKind,id:u.searchParams.get(key!)!};
 return {};
}
const SPOILER_KEY="twdu-atlas-spoiler-safe";
const readSpoilerSafe=()=>{try{return localStorage.getItem(SPOILER_KEY)==="1"}catch{return false}};
const prefersReducedMotion=()=>typeof window!=="undefined"&&!!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export default function App(){
 // ---- Core atlas state ------------------------------------------------------
 const [series,setSeries]=useState<SeriesKey|"ALL">("ALL");
 const [mapLayer,setMapLayer]=useState<MapLayer>("ALL");
 const [hordeEnabled,setHordeEnabled]=useState(false);
 const [hordeSelected,setHordeSelected]=useState(false);
 const [year,setYearState]=useState(2010);
 const [playing,setPlaying]=useState(false);
 const focusCtl=useAtlasFocusController();
 const {focus,selectedLocation,selectedEpisode,selectedConnection,setFocus,clearFocus}=focusCtl;
 const [view,setView]=useState<View>(readInitialView);
 const [navStack,setNavStack]=useState<NavEntry[]>([]);
 const [journeyIds,setJourneyIds]=useState<string[]>([]);
 // Playback position as a story rank (not a beat index) so it survives adding a
 // character to compare or toggling spoiler-safe. Infinity = end of the journey.
 const [journeyRank,setJourneyRank]=useState(Infinity);
 const [journeyPlaying,setJourneyPlaying]=useState(false);
 const [spoilerSafe,setSpoilerSafeState]=useState(readSpoilerSafe);
 const [toast,setToast]=useState<string|null>(null);
 const deepLink=useRef<DeepLink|null>(readDeepLink());
 const journeyFrame=useRef<"all"|"step"|null>(null);
 const {watched,toggleWatched,resetWatched}=useWatchProgress();
 const {followed,toggleFollowed}=useFollowedCharacters();
 const [dataErrors,setDataErrors]=useState<string[]>([]);
 const [layout,setLayout]=useState(readLayout);
 const isPanel=layout.panel,isMobileMap=layout.touch;
 const [snap,setSnap]=useState<Snap>("peek");
 const [searchOpen,setSearchOpen]=useState(false);
 const [layersOpen,setLayersOpen]=useState(false);
 const [clusterIds,setClusterIds]=useState<string[]|null>(null);
 const [focusRequest,setFocusRequest]=useState<{ids:string[];mode:"point"|"fit";token:number;maxZ?:number}|null>(null);
 const [viewport,setViewport]=useState(()=>({w:typeof window!=="undefined"?window.innerWidth:1000,h:typeof window!=="undefined"?window.innerHeight:800}));
 // Measured heights of the fixed top bar and bottom tab bar (safe areas included).
 const [chrome,setChrome]=useState({top:64,tab:64});
 const topbarRef=useRef<HTMLElement|null>(null);
 const tabbarRef=useRef<HTMLElement|null>(null);

 // ---- Map transform state (contract: docs/MOBILE_MAP_GESTURE_ARCHITECTURE.md)
 const [zoom,setZoom]=useState(1);
 const [pan,setPan]=useState({x:0,y:0});
 const [isDragging,setIsDragging]=useState(false);
 const drag=useRef({x:0,y:0,px:0,py:0,moved:false});
 const gestureStart=useRef<number|null>(null);
 const gestureDistance=useRef(0);
 const pointers=useRef(new Map<number,{x:number;y:number}>());
 const pinch=useRef<{distance:number;zoom:number;x:number;y:number;midX:number;midY:number}|null>(null);
 const tapTarget=useRef<{kind:"location"|"cluster";value:string}|null>(null);
 const mapSvgRef=useRef<SVGSVGElement|null>(null);
 const mapWorldRef=useRef<SVGGElement|null>(null);
 const raf=useRef<number|null>(null);
 const flight=useRef<number|null>(null);
 const visual=useRef({x:0,y:0,zoom:1});
 const didAutoHome=useRef(false);
 const sheetRef=useRef<HTMLElement|null>(null);
 const historyArmed=useRef(false);
 const sheetBodyRef=useRef<HTMLDivElement|null>(null);
 const restoreScroll=useRef<number|null>(null);

 const setYear=useCallback((y:number)=>setYearState(clamp(Math.round(y),UNIVERSE_MIN_YEAR,UNIVERSE_MAX_YEAR)),[]);

 useEffect(()=>{
  const reveal=()=>document.body.classList.remove("atlas-booting");
  const frame=window.requestAnimationFrame(reveal);
  initAtlasPerformance();
  void getRuntimeMeta().then(meta=>{if(meta)trackAtlasMetric("runtime-ready",1,{version:String(meta.version??"unknown"),episodes:Number(meta.counts?.episodes??0),characters:Number(meta.counts?.characters??0),locations:Number(meta.counts?.locations??0)})});
  return()=>window.cancelAnimationFrame(frame);
 },[]);
 useEffect(()=>{
  const validate=()=>setDataErrors(validateAtlasData());
  if("requestIdleCallback" in window){const id=window.requestIdleCallback(validate,{timeout:1200});return()=>window.cancelIdleCallback(id)}
  const id=globalThis.setTimeout(validate,0);return()=>globalThis.clearTimeout(id);
 },[]);
 useEffect(()=>{
  const onResize=()=>{setLayout(prev=>{const next=readLayout();return prev.panel===next.panel&&prev.touch===next.touch?prev:next});setViewport({w:window.innerWidth,h:window.innerHeight})};
  window.addEventListener("resize",onResize);return()=>window.removeEventListener("resize",onResize);
 },[]);
 useEffect(()=>{
  if(!playing)return;
  const id=window.setInterval(()=>setYearState(y=>y>=UNIVERSE_MAX_YEAR?UNIVERSE_MIN_YEAR:y+1),1100);
  return()=>window.clearInterval(id);
 },[playing]);

 // ---- Derived data -----------------------------------------------------------
 const seriesId=series==="ALL"?undefined:META[series].id;
 const journeyActive=journeyIds.length>0;
 const journeys=useMemo(()=>journeyIds.map(id=>buildJourney(id,{onlyEpisodes:spoilerSafe?watched:null})),[journeyIds,spoilerSafe,spoilerSafe?watched:null]);
 const beats=useMemo(()=>buildBeats(journeys),[journeys]);
 const journeyCursor=useMemo(()=>{if(!beats.length)return 0;let i=0;beats.forEach((b,k)=>{if(b.rank<=journeyRank)i=k});return i},[beats,journeyRank]);
 const journeyPositions=useMemo(()=>positionsAt(journeys,beats,journeyCursor),[journeys,beats,journeyCursor]);
 const journeyLocationIds=useMemo(()=>new Set(journeys.flatMap(j=>j.stops.map(s=>s.location.id))),[journeys]);
 // Places already reached by someone at the current step, and where each character is now.
 const journeyReached=useMemo(()=>new Set(journeys.flatMap((j,ji)=>j.stops.slice(0,journeyPositions[ji]+1).map(s=>s.location.id))),[journeys,journeyPositions]);
 const journeyCurrent=useMemo(()=>new Set(journeys.map((j,ji)=>j.stops[journeyPositions[ji]]?.location.id).filter(Boolean) as string[]),[journeys,journeyPositions]);
 // Single journey: numbered badges in first-visit order.
 const journeyStops=useMemo(()=>{const m=new Map<string,number>();if(journeys.length===1)for(const st of journeys[0].stops)if(!m.has(st.location.id))m.set(st.location.id,st.place);return m},[journeys]);
 const yearLocations=useMemo(()=>(atlasData.locations as Location[]).filter(l=>!!SERIES_BY_ID[l.seriesId]&&(!seriesId||l.seriesId===seriesId)&&l.year<=year),[seriesId,year]);
 const mapLocations=useMemo(()=>{
  const source=journeyActive?(atlasData.locations as Location[]).filter(l=>journeyLocationIds.has(l.id)):yearLocations;
  return source.filter(l=>mapLayer==="ALL"||locationMapLayer(l.type)===mapLayer);
 },[journeyActive,journeyLocationIds,yearLocations,mapLayer]);
 const activeEpisodeCount=useMemo(()=>buildChronology().filter(x=>x.kind==="episode"&&x.start<=year&&x.end>=year&&(!seriesId||x.seriesId===seriesId)).length,[year,seriesId]);
 const layerCounts=useMemo(()=>{const c:Record<string,number>={ALL:0};for(const l of yearLocations){if(!hasMapCoordinates(l))continue;c.ALL++;const k=locationMapLayer(l.type);c[k]=(c[k]??0)+1}return c},[yearLocations]);
 const contextLocationIds=useMemo(()=>{
  const ids=new Set<string>();
  if(selectedEpisode)for(const id of (episodeById.get(selectedEpisode) as any)?.locationIds??[])ids.add(id);
  if(selectedConnection){
   const c=connectionById.get(selectedConnection) as any;
   for(const id of [c?.fromId,c?.toId])if(id&&locationById.has(id))ids.add(id);
   for(const eid of (atlasData as any).connectionEpisodes?.connections?.[selectedConnection]?.episodeIds??[])for(const id of (episodeById.get(eid) as any)?.locationIds??[])ids.add(id);
  }
  return ids;
 },[selectedEpisode,selectedConnection]);
 const mappedCount=mapLocations.filter(hasMapCoordinates).length;

 // ---- Map geometry -------------------------------------------------------------
 const applyMapTransform=(x:number,y:number,z:number)=>{
  const svg=mapSvgRef.current,worldGroup=mapWorldRef.current;
  if(!svg||!worldGroup)return;
  const baseScale=Math.max(svg.clientWidth/1000,svg.clientHeight/600);
  if(!Number.isFinite(baseScale)||baseScale<=0)return;
  const cx=500,cy=300,px=x/baseScale,py=y/baseScale;
  worldGroup.setAttribute("transform","translate("+(cx+px)+" "+(cy+py)+") scale("+z+") translate("+(-cx)+" "+(-cy)+")");
 };
 // Limits come from the projected geographic content (952×556 of the 1000×600
 // viewBox) at the rendered scale — never from arbitrary caps.
 const getMapPanLimits=(z=visual.current.zoom)=>{const el=mapSvgRef.current;if(!el)return {x:0,y:0};const w=el.clientWidth,h=el.clientHeight,baseScale=Math.max(w/1000,h/600);const worldW=952*baseScale*z,worldH=556*baseScale*z;return {x:Math.max(0,(worldW-w)/2),y:Math.max(0,(worldH-h)/2)}};
 // The part of the map surface not covered by floating chrome (top bar, series
 // row, controls, sheet or side panel), in surface-relative pixels. Each chrome
 // element declares which edge it obstructs with data-map-chrome, and is
 // measured where it actually is — no hard-coded layout constants.
 const getVisibleRect=(sheetTopOverride?:number)=>{
  const el=mapSvgRef.current;
  if(!el)return {x0:0,y0:0,x1:0,y1:0,w:0,h:0};
  const s=el.getBoundingClientRect();
  let x0=0,y0=0,x1=s.width,y1=s.height;
  document.querySelectorAll<HTMLElement>("[data-map-chrome]").forEach(node=>{
   const r=node.getBoundingClientRect();if(!r.width||!r.height)return;
   const edge=node.dataset.mapChrome;
   if(edge==="top")y0=Math.max(y0,r.bottom-s.top);
   else if(edge==="bottom")y1=Math.min(y1,r.top-s.top);
   else if(edge==="left")x0=Math.max(x0,r.right-s.left);
   else if(edge==="right")x1=Math.min(x1,r.left-s.left);
  });
  if(sheetTopOverride!=null)y1=Math.min(y1,sheetTopOverride-s.top);
  y0=clamp(y0+8,0,s.height-80);y1=Math.max(y0+80,y1-8);x0=clamp(x0+8,0,s.width-80);x1=Math.max(x0+80,x1-8);
  return {x0,y0,x1,y1,w:s.width,h:s.height};
 };
 // Pan that puts viewBox point (px,py) at surface pixel (tx,ty) for zoom z.
 const panFor=(p:{x:number;y:number},tx:number,ty:number,z:number)=>{
  const el=mapSvgRef.current!;const w=el.clientWidth,h=el.clientHeight,bs=Math.max(w/1000,h/600);
  return {x:tx-w/2-bs*z*(p.x-500),y:ty-h/2-bs*z*(p.y-300)};
 };
 const cancelFlight=()=>{if(flight.current!==null){cancelAnimationFrame(flight.current);flight.current=null}};
 const flyTo=(x:number,y:number,z:number)=>{
  cancelFlight();
  const from={...visual.current};
  const commit=()=>{visual.current={x,y,zoom:z};applyMapTransform(x,y,z);setPan({x,y});setZoom(z)};
  if(prefersReducedMotion()||(Math.abs(from.x-x)<1&&Math.abs(from.y-y)<1&&Math.abs(from.zoom-z)<.01)){commit();return}
  const start=performance.now(),dur=520;
  const step=(now:number)=>{
   const t=Math.min(1,(now-start)/dur),k=t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
   const cz=from.zoom*Math.pow(z/from.zoom,k);
   const cx=from.x+(x-from.x)*k,cy=from.y+(y-from.y)*k;
   visual.current={x:cx,y:cy,zoom:cz};applyMapTransform(cx,cy,cz);
   if(t<1)flight.current=requestAnimationFrame(step);else{flight.current=null;commit()}
  };
  flight.current=requestAnimationFrame(step);
 };
 // Frame a set of locations inside the unobstructed part of the map.
 const focusMapOn=(ids:string[],mode:"point"|"fit",sheetTop?:number,maxZ=4.5)=>{
  const el=mapSvgRef.current;if(!el||!el.clientWidth)return;
  const pts=ids.map(id=>locationById.get(id)).filter((l):l is Location=>!!l&&hasMapCoordinates(l)).map(l=>project(l.lat,l.lng));
  if(!pts.length)return;
  const vis=getVisibleRect(sheetTop);
  const bs=Math.max(el.clientWidth/1000,el.clientHeight/600);
  const minX=Math.min(...pts.map(p=>p.x)),maxX=Math.max(...pts.map(p=>p.x)),minY=Math.min(...pts.map(p=>p.y)),maxY=Math.max(...pts.map(p=>p.y));
  const c={x:(minX+maxX)/2,y:(minY+maxY)/2};
  const spanW=Math.max(maxX-minX,1)*bs,spanH=Math.max(maxY-minY,1)*bs;
  const fitZ=Math.min((vis.x1-vis.x0)*.72/spanW,(vis.y1-vis.y0)*.72/spanH);
  const pointZ=isMobileMap?2.6:2.2;
  let z=mode==="point"||pts.length===1?Math.max(visual.current.zoom,pointZ):clamp(fitZ,1,maxZ);
  if(pts.length>1&&mode==="point")z=clamp(Math.min(fitZ,Math.max(visual.current.zoom,pointZ)),1,5);
  z=clamp(z,1,Math.min(5,Math.max(maxZ,mode==="point"?pointZ:1)));
  const target=panFor(c,(vis.x0+vis.x1)/2,(vis.y0+vis.y1)/2,z);
  const lim=getMapPanLimits(z);
  flyTo(clamp(target.x,-lim.x,lim.x),clamp(target.y,-lim.y,lim.y),z);
 };
 // Home: the story's opening cluster (2010 places) centred in the unobstructed
 // area, at the smallest zoom that gives enough slack to actually get it there.
 const computeHomePan=()=>{
  const el=mapSvgRef.current;
  if(!el||!el.clientWidth||!el.clientHeight)return {x:0,y:0,zoom:1};
  const pts=(atlasData.locations as Location[]).filter(l=>l.year<=2010&&hasMapCoordinates(l)).map(l=>project(l.lat,l.lng));
  if(!pts.length)return {x:0,y:0,zoom:1};
  const c={x:pts.reduce((s,p)=>s+p.x,0)/pts.length,y:pts.reduce((s,p)=>s+p.y,0)/pts.length};
  const vis=getVisibleRect(isPanel?undefined:sheetTopFor("peek"));
  const tx=(vis.x0+vis.x1)/2,ty=(vis.y0+vis.y1)/2;
  const maxZ=isPanel?1.6:1.9;
  let z=1;
  for(let cand=1;cand<=maxZ+1e-6;cand+=.05){
   const p=panFor(c,tx,ty,cand),lim=getMapPanLimits(cand);
   z=cand;
   if(Math.abs(p.x)<=lim.x+2&&Math.abs(p.y)<=lim.y+2)break;
  }
  if(isMobileMap&&!isPanel)z=Math.max(z,1.15);
  const p=panFor(c,tx,ty,z),lim=getMapPanLimits(z);
  return {x:clamp(p.x,-lim.x,lim.x),y:clamp(p.y,-lim.y,lim.y),zoom:z};
 };
 const resetMap=()=>{const home=computeHomePan();flyTo(home.x,home.y,home.zoom);trackAtlasMetric("map-reset",1,{mobile:isMobileMap});};
 const setZoomValue=(v:number)=>{
  const el=mapSvgRef.current;const z=clamp(v,1,5);if(!el)return;
  // Zoom around the centre of the unobstructed area so buttons feel anchored.
  const vis=getVisibleRect();const cx=(vis.x0+vis.x1)/2-el.clientWidth/2,cy=(vis.y0+vis.y1)/2-el.clientHeight/2;
  const r=z/visual.current.zoom;const lim=getMapPanLimits(z);
  flyTo(clamp(cx*(1-r)+r*visual.current.x,-lim.x,lim.x),clamp(cy*(1-r)+r*visual.current.y,-lim.y,lim.y),z);
 };

 useEffect(()=>{visual.current={x:pan.x,y:pan.y,zoom};applyMapTransform(pan.x,pan.y,zoom)},[pan.x,pan.y,zoom]);
 useEffect(()=>{
  const frame=window.requestAnimationFrame(()=>{
   if(!mapSvgRef.current?.clientWidth)return;
   if(!didAutoHome.current){didAutoHome.current=true;const home=computeHomePan();visual.current={x:home.x,y:home.y,zoom:home.zoom};setPan({x:home.x,y:home.y});setZoom(home.zoom);applyMapTransform(home.x,home.y,home.zoom);applyDeepLink();return}
   const lim=getMapPanLimits();const nx=clamp(visual.current.x,-lim.x,lim.x),ny=clamp(visual.current.y,-lim.y,lim.y);
   visual.current={...visual.current,x:nx,y:ny};setPan(p=>p.x===nx&&p.y===ny?p:{x:nx,y:ny});applyMapTransform(nx,ny,visual.current.zoom);
  });
  return()=>window.cancelAnimationFrame(frame);
 },[view,isPanel,viewport.w,viewport.h]);

 // ---- Sheet geometry (sheet layout only) ------------------------------------
 // Heights are computed here (not left to CSS) so map framing knows exactly
 // where the sheet will settle before its height transition finishes.
 useLayoutEffect(()=>{
  const top=topbarRef.current?.getBoundingClientRect().bottom??64,tab=tabbarRef.current?.offsetHeight??0;
  setChrome(c=>c.top===top&&c.tab===tab?c:{top,tab});
 },[viewport.w,viewport.h,isPanel]);
 const hasDetail=!!focus;
 const sheetAvailable=()=>Math.max(220,viewport.h-chrome.tab-chrome.top-6);
 const sheetHeightFor=(s:Snap,detail=hasDetail)=>{const avail=sheetAvailable();return s==="full"?avail:s==="half"?Math.round(Math.min(avail,Math.max(300,(viewport.h-chrome.tab)*.52))):Math.min(avail,detail?112:204)};
 const sheetTopFor=(s:Snap,detail=hasDetail)=>viewport.h-chrome.tab-sheetHeightFor(s,detail);
 const effectiveSnap:Snap=view==="map"?snap:"full";

 // ---- Focus requests -> map flights (after the DOM reflects new filters) ----
 useEffect(()=>{
  if(!focusRequest)return;
  const id=requestAnimationFrame(()=>focusMapOn(focusRequest.ids,focusRequest.mode,isPanel?undefined:sheetTopFor(snap),focusRequest.maxZ));
  return()=>cancelAnimationFrame(id);
 },[focusRequest]);
 const requestFocus=(ids:string[],mode:"point"|"fit",maxZ?:number)=>setFocusRequest({ids,mode,token:Date.now(),maxZ});

 // ---- Navigation -------------------------------------------------------------
 const navigate=(kind:AtlasFocusKind,id:string,targetView:View=view)=>{
  setNavStack(stack=>{
   const top:NavEntry={view,focus,scroll:sheetBodyRef.current?.scrollTop??0};
   if(focus?.kind===kind&&focus.id===id&&view===targetView)return stack;
   return focus||targetView!==view?[...stack,top].slice(-30):stack;
  });
  setFocus(kind,id);setView(targetView);setSearchOpen(false);setClusterIds(null);setLayersOpen(false);
  if(targetView==="map")setSnap(s=>s==="full"&&isPanel?s:"half");
 };
 const goBack=()=>{
  const prev=navStack[navStack.length-1];
  if(!prev){closeDetail();return}
  setNavStack(navStack.slice(0,-1));
  restoreScroll.current=prev.scroll;
  setView(prev.view);
  if(prev.focus)setFocus(prev.focus.kind,prev.focus.id);else clearFocus();
  if(prev.view==="map")setSnap(prev.focus?"half":"peek");
 };
 // Each screen opens at its top; Back returns to where you were scrolled.
 useLayoutEffect(()=>{
  const el=sheetBodyRef.current;if(!el)return;
  el.scrollTop=restoreScroll.current??0;restoreScroll.current=null;
 },[view,focus?.kind,focus?.id]);
 const closeDetail=()=>{clearFocus();setNavStack([]);if(view==="map")setSnap("peek")};
 const goView=(v:View)=>{setView(v);clearFocus();setNavStack([]);setSearchOpen(false);setClusterIds(null);setLayersOpen(false);if(v==="map")setSnap("peek")};
 const jumpToTimelineYear=(y:number)=>{setYear(y);goView("timeline")};
 const ensureVisible=(l:Location)=>{
  if(seriesId&&l.seriesId!==seriesId)setSeries("ALL");
  if(mapLayer!=="ALL"&&locationMapLayer(l.type)!==mapLayer)setMapLayer("ALL");
  if(journeyActive&&!journeyLocationIds.has(l.id))exitJourney(false);

 };
 const episodeYear=(id:string)=>{const e=episodeById.get(id) as any;const y=Number(e?.timelineStart??e?.timelineEnd??e?.airDate?.slice(0,4));return Number.isFinite(y)&&y>0?y:null};

 const openLocation=(id:string)=>{
  const l=locationById.get(id);if(!l)return;
  const started=performance.now();
  // Per the atlas contract, tapping a place moves time to that place's history.
  ensureVisible(l);if(!(journeyActive&&journeyLocationIds.has(id))&&Number(l.year)>0)setYear(Number(l.year));
  navigate("location",id,"map");
  if(hasMapCoordinates(l))requestFocus([id],"point");
  void getRuntimeRelationships("location",id).then(remote=>{if(remote)trackAtlasMetric("runtime-location-relationships",remote.episodeIds.length,{location:id,remoteIndexed:true})});
  trackAtlasMetric("location-focus",performance.now()-started,{location:id,linkedEpisodes:getLocationEpisodeIds(id).length});
 };
 const openEpisode=(id:string)=>{
  const y=episodeYear(id);if(y)setYear(y);
  navigate("episode",id);
  if(view==="map"){
   const ids=((episodeById.get(id) as any)?.locationIds??[]) as string[];
   // Episodes along the journey keep it on screen; anything else leaves it.
   if(journeyActive&&!ids.every(x=>journeyLocationIds.has(x)||!hasMapCoordinates(locationById.get(x)!)))exitJourney(false);
   if(ids.length)requestFocus(ids,"point");
  }
 };
 const showEpisodeOnMap=(id:string)=>{
  const y=episodeYear(id);if(y)setYear(y);setSeries("ALL");setMapLayer("ALL");exitJourney(false);
  navigate("episode",id,"map");
  const ids=((episodeById.get(id) as any)?.locationIds??[]) as string[];
  if(ids.length){requestFocus(ids,"point");trackAtlasMetric("episode-geography-focus",1,{episode:id,locations:ids.length})}
 };
 const openCharacter=(id:string)=>{
  const eps=getCharacterEpisodeIds(id).map(e=>episodeById.get(e)).filter(Boolean).sort(compareEpisodesChronologically) as any[];
  const first=Number(eps[0]?.timelineStart??eps[0]?.timelineEnd);if(Number.isFinite(first)&&first>0)setYear(first);
  navigate("character",id);
  trackAtlasMetric("character-select",eps.length,{character:id});
  void getRuntimeRelationships("character",id).then(remote=>{if(remote)trackAtlasMetric("runtime-character-relationships",remote.episodeIds.length,{character:id,remoteIndexed:true})});
 };
 // ---- Journeys -------------------------------------------------------------------
 const startJourney=(ids:string[],opts:{rank?:number}={})=>{
  const list=parseJourneyIds(ids.join(","));if(!list.length)return;
  setNavStack(stack=>focus||view!=="map"?[...stack,{view,focus,scroll:sheetBodyRef.current?.scrollTop??0}].slice(-30):stack);
  clearFocus();setView("map");setSearchOpen(false);setClusterIds(null);setLayersOpen(false);
  setSeries("ALL");setMapLayer("ALL");setPlaying(false);setJourneyPlaying(false);
  setJourneyIds(list);setJourneyRank(opts.rank??Infinity);setSnap("peek");
  journeyFrame.current=opts.rank==null?"all":"step";
  trackAtlasMetric("character-journey-geography-focus",1,{character:list.join("+"),compare:list.length});
 };
 const showCharacterJourney=(id:string)=>startJourney([id]);
 function exitJourney(restore=true){
  if(!journeyIds.length)return;
  setJourneyIds([]);setJourneyPlaying(false);setJourneyRank(Infinity);
  if(restore&&!focus){if(navStack.length)goBack();else setSnap("peek")}
 }
 const setSpoilerSafe=(on:boolean)=>{setSpoilerSafeState(on);try{localStorage.setItem(SPOILER_KEY,on?"1":"0")}catch{}};
 // Frame the whole journey on start, or the current leg after a deep link.
 useEffect(()=>{
  const mode=journeyFrame.current;if(!mode||!journeys.length)return;
  journeyFrame.current=null;
  if(mode==="all"){const ids=[...journeyLocationIds];if(ids.length)requestFocus(ids,"fit")}
  else frameBeat(journeyCursor);
 },[journeys]);
 const frameBeat=(i:number)=>{
  const beat=beats[i];if(!beat)return;
  const ids=new Set<string>();
  for(const m of beat.moves){const j=journeys[m.journey],st=j?.stops[m.stop];if(!st)continue;ids.add(st.location.id);if(st.from!=null)ids.add(j.stops[st.from].location.id)}
  if(ids.size)requestFocus([...ids],"fit",3.2);
 };
 const stepJourney=(i:number,fly=true)=>{
  const beat=beats[clamp(i,0,Math.max(0,beats.length-1))];if(!beat)return;
  setJourneyRank(i>=beats.length-1?Infinity:beat.rank);
  if(fly)frameBeat(clamp(i,0,beats.length-1));
 };
 // Story time follows the journey.
 const cursorYear=journeyActive?beatYear(journeys,beats[journeyCursor]):null;
 useEffect(()=>{if(cursorYear)setYear(cursorYear)},[cursorYear]);
 const stepRef=useRef(stepJourney);stepRef.current=stepJourney;
 const cursorRef=useRef(0);cursorRef.current=journeyCursor;
 useEffect(()=>{
  if(!journeyPlaying)return;
  const id=window.setInterval(()=>{
   const next=cursorRef.current+1;
   if(next>=beats.length){setJourneyPlaying(false);return}
   stepRef.current(next);
  },prefersReducedMotion()?2600:1700);
  return()=>window.clearInterval(id);
 },[journeyPlaying,beats.length]);
 const toggleJourneyPlay=()=>{
  if(journeyPlaying){setJourneyPlaying(false);return}
  setPlaying(false);
  // Play from the top when parked at the end.
  if(journeyCursor>=beats.length-1)stepJourney(0);
  setJourneyPlaying(true);
 };
 const onYearScrub=(y:number)=>{
  setPlaying(false);setYear(y);
  if(journeyActive){setJourneyPlaying(false);stepJourney(beatForYear(journeys,beats,y))}
 };
 const showToast=(msg:string)=>{setToast(msg);window.setTimeout(()=>setToast(t=>t===msg?null:t),2600)};
 const shareCurrent=async()=>{
  let path=window.location.pathname+window.location.search,title="TWDU Atlas";
  if(journeyActive&&!focus){
   path="/j/"+journeyIds.join("+")+(journeyCursor<beats.length-1&&beats[journeyCursor]?"?at="+Math.round(beats[journeyCursor].rank*100):"");
   title=journeys.map(j=>j.name).join(" & ")+" — journey · TWDU Atlas";
  }else if(focus){
   const short=Object.entries(SHARE_PATHS).find(([,k])=>k===focus.kind)?.[0];
   if(short)path=`/${short}/${encodeURIComponent(focus.id)}`;
   title=focusTitle+" · TWDU Atlas";
  }
  const url=window.location.origin+path;
  try{if(navigator.share){await navigator.share({title,url});return}}catch(err){if((err as Error)?.name==="AbortError")return}
  try{await navigator.clipboard.writeText(url);showToast("Link copied")}catch{showToast(url)}
 };
 const connectionContext=(id:string)=>{
  const c=connectionById.get(id) as any;
  const eids=((atlasData as any).connectionEpisodes?.connections?.[id]?.episodeIds??[]) as string[];
  const ids=[c?.fromId,c?.toId,...eids.flatMap(e=>(episodeById.get(e) as any)?.locationIds??[])].filter(x=>x&&locationById.has(x)) as string[];
  const years=eids.map(episodeYear).filter((n):n is number=>n!=null);
  return {ids:[...new Set(ids)],year:years.length?Math.min(...years):null};
 };
 const openConnection=(id:string)=>{
  const ctx=connectionContext(id);if(ctx.year)setYear(ctx.year);
  navigate("connection",id);
  if(view==="map"){setSeries("ALL");exitJourney(false);if(ctx.ids.length)requestFocus(ctx.ids,"fit")}
 };
 const showConnectionOnMap=(id:string)=>{
  const ctx=connectionContext(id);if(ctx.year)setYear(ctx.year);
  setSeries("ALL");setMapLayer("ALL");exitJourney(false);
  navigate("connection",id,"map");
  if(ctx.ids.length){requestFocus(ctx.ids,"fit");trackAtlasMetric("connection-geography-focus",1,{locations:ctx.ids.length})}
 };
 const openCommunity=(id:string)=>navigate("community",id);
 const openFaction=(id:string)=>navigate("faction",id);
 const onSearchPick=(kind:SearchKind,id:string)=>{
  if(kind==="location")openLocation(id);else if(kind==="episode")openEpisode(id);else if(kind==="character")openCharacter(id);else if(kind==="community")openCommunity(id);else openFaction(id);
  // Hand keyboard/screen-reader focus to the panel that now shows the result.
  requestAnimationFrame(()=>sheetRef.current?.focus({preventScroll:true}));
 };

 const actions:AtlasActions={openEpisode,openLocation,openCharacter,openConnection,openCommunity,openFaction,showEpisodeOnMap,showLocationOnMap:openLocation,showCharacterJourney,startJourney,showConnectionOnMap,setYear,jumpToTimelineYear,year,watched,toggleWatched,resetWatched,followed,toggleFollowed};

 // Per-view tab title. Independent of the deep-link gate below on purpose: a
 // direct load of /people (no map involved) must still get the right title,
 // not wait on the map's own home-framing sequence to release deepLink.current.
 useEffect(()=>{
  const title=VIEW_TITLE[view];
  if(title&&document.title!==title)document.title=title;
 },[view]);
 // ---- URL state (deep links in, shareable state out) --------------------------
 useEffect(()=>{
  if(deepLink.current)return; // not applied yet — don't clobber the incoming link
  const u=new URL(window.location.href);
  for(const k of ["j","at","place","ep","who"])u.searchParams.delete(k);
  u.pathname=VIEW_TO_PATH[view]??"/";
  if(journeyActive){
   u.searchParams.set("j",journeyIds.join(","));
   if(journeyCursor<beats.length-1&&beats[journeyCursor])u.searchParams.set("at",String(Math.round(beats[journeyCursor].rank*100)));
  }else if(focus&&QUERY_KEYS[focus.kind])u.searchParams.set(QUERY_KEYS[focus.kind]!,focus.id);
  const next=u.pathname+u.search+u.hash;
  if(next!==window.location.pathname+window.location.search+window.location.hash){try{window.history.replaceState(window.history.state,"",next)}catch{}}
 },[view,journeyActive,journeyIds,journeyCursor,beats,focus]);
 const applyDeepLink=()=>{
  const link=deepLink.current;deepLink.current=null;if(!link)return;
  if(link.journey?.length){startJourney(link.journey,{rank:link.at});return}
  if(!link.kind||!link.id)return;
  if(link.kind==="location"&&locationById.has(link.id))openLocation(link.id);
  else if(link.kind==="episode"&&episodeById.has(link.id))showEpisodeOnMap(link.id);
  else if(link.kind==="character"&&characterById.has(link.id))openCharacter(link.id);
  else if(link.kind==="connection"&&connectionById.has(link.id))openConnection(link.id);
  else if(link.kind==="community"&&communityById.has(link.id))openCommunity(link.id);
  else if(link.kind==="faction"&&factionById.has(link.id))openFaction(link.id);
 };

 // ---- Browser back closes overlays / walks the detail stack -------------------
 const somethingOpen=searchOpen||!!focus||!!clusterIds||journeyActive;
 useEffect(()=>{
  if(somethingOpen&&!historyArmed.current){try{window.history.pushState({atlasOverlay:true},"",window.location.href);historyArmed.current=true}catch{}}
 },[somethingOpen,focus,searchOpen,clusterIds]);
 const backHandler=useRef<()=>void>(()=>{});
 backHandler.current=()=>{
  historyArmed.current=false;
  setView(PATH_TO_VIEW[window.location.pathname]??"map");
  if(searchOpen)setSearchOpen(false);
  else if(clusterIds)setClusterIds(null);
  else if(focus)goBack();
  else if(journeyActive)exitJourney();
 };
 useEffect(()=>{
  const onPop=()=>backHandler.current();
  window.addEventListener("popstate",onPop);return()=>window.removeEventListener("popstate",onPop);
 },[]);

 // ---- Keyboard ---------------------------------------------------------------
 const keyHandler=useRef<(e:KeyboardEvent)=>void>(()=>{});
 keyHandler.current=(e:KeyboardEvent)=>{
  const tag=(e.target as HTMLElement)?.tagName;
  if(e.key==="Escape"){
   if(searchOpen){e.preventDefault();setSearchOpen(false);return}
   if(layersOpen){setLayersOpen(false);return}
   if(clusterIds){e.preventDefault();setClusterIds(null);return}
   if(focus){e.preventDefault();closeDetail();return}
   if(journeyActive){exitJourney();return}
  }
  if(tag==="INPUT"||tag==="TEXTAREA"||(e.target as HTMLElement)?.isContentEditable)return;
  if(e.key==="/"){e.preventDefault();setSearchOpen(true);return}
  if(view!=="map")return;
  if(e.key==="+"||e.key==="=")setZoomValue(visual.current.zoom+.5);
  if(e.key==="-"||e.key==="_")setZoomValue(visual.current.zoom-.5);
  if(e.key==="0")resetMap();
  if(e.key===" "&&tag!=="BUTTON"){e.preventDefault();if(journeyActive)toggleJourneyPlay();else setPlaying(v=>!v)}
  if(journeyActive&&!focus&&(e.target as HTMLElement)?.getAttribute?.("role")!=="slider"){
   if(e.key==="ArrowRight"||e.key==="]"){e.preventDefault();setJourneyPlaying(false);stepJourney(journeyCursor+1)}
   if(e.key==="ArrowLeft"||e.key==="["){e.preventDefault();setJourneyPlaying(false);stepJourney(journeyCursor-1)}
  }
 };
 useEffect(()=>{const on=(e:KeyboardEvent)=>keyHandler.current(e);window.addEventListener("keydown",on);return()=>window.removeEventListener("keydown",on)},[]);

 // ---- Markers ------------------------------------------------------------------
 const markerGroups=useMemo(()=>{
  // Merge radius is in screen-ish units: points closer than ~24px at the
  // current zoom become one cluster, so clusters split as you zoom in.
  const threshold=20/zoom;
  const groups:Array<{locations:Location[];x:number;y:number}>=[];
  for(const location of mapLocations.filter(hasMapCoordinates)){
   const p=project(location.lat,location.lng);
   let target=groups.find(g=>Math.hypot(g.x-p.x,g.y-p.y)<=threshold);
   if(!target){target={locations:[],x:p.x,y:p.y};groups.push(target)}
   target.locations.push(location);
   const n=target.locations.length;
   target.x=(target.x*(n-1)+p.x)/n;target.y=(target.y*(n-1)+p.y)/n;
  }
  // The selected place (and a small set of highlighted episode/link places)
  // always render as their own markers so they never hide inside a cluster.
  const pinned=new Set<string>(selectedLocation?[selectedLocation]:[]);
  if(contextLocationIds.size<=8)contextLocationIds.forEach(id=>pinned.add(id));
  journeyCurrent.forEach(id=>pinned.add(id));
  if(pinned.size){
   for(const g of groups){
    if(g.locations.length<2)continue;
    const out=g.locations.filter(l=>pinned.has(l.id));
    if(!out.length)continue;
    g.locations=g.locations.filter(l=>!pinned.has(l.id));
    for(const l of out){const p=project(l.lat,l.lng);groups.push({locations:[l],x:p.x,y:p.y})}
   }
  }
  return groups.filter(g=>g.locations.length);
 },[mapLocations,zoom,selectedLocation,contextLocationIds,journeyCurrent]);
 const openCluster=(ids:string[])=>{
  const pts=ids.map(id=>locationById.get(id)!).filter(Boolean).map(l=>project(l.lat,l.lng));
  const spread=Math.max(Math.max(...pts.map(p=>p.x))-Math.min(...pts.map(p=>p.x)),Math.max(...pts.map(p=>p.y))-Math.min(...pts.map(p=>p.y)));
  // Co-located places (or already fully zoomed): list them instead of zooming.
  if(spread<1.2||visual.current.zoom>=4.8){setClusterIds(ids);return}
  focusMapOn(ids,"fit",isPanel?undefined:sheetTopFor(snap));
 };

 // ---- Pointer gestures (one-finger pan at any zoom, pinch 1×–5×) --------------
 const pointerDown=(e:React.PointerEvent<SVGSVGElement>)=>{
  e.preventDefault();cancelFlight();
  // Pointer capture retargets later events to the SVG, so resolve what was
  // touched now and act on it at release if the gesture did not move.
  if(pointers.current.size===0){
   const hit=(e.target as Element).closest?.("[data-location-id],[data-cluster-ids]");
   tapTarget.current=hit?(hit.getAttribute("data-location-id")?{kind:"location",value:hit.getAttribute("data-location-id")!}:{kind:"cluster",value:hit.getAttribute("data-cluster-ids")!}):null;
  }else tapTarget.current=null;
  e.currentTarget.setPointerCapture?.(e.pointerId);
  pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(gestureStart.current===null)gestureStart.current=performance.now();
  if(pointers.current.size===2){
   const p=[...pointers.current.values()];
   pinch.current={distance:Math.max(1,Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y)),zoom:visual.current.zoom,x:visual.current.x,y:visual.current.y,midX:(p[0].x+p[1].x)/2,midY:(p[0].y+p[1].y)/2};
   drag.current.moved=true;setIsDragging(true);return;
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
    const limits=getMapPanLimits(nextZoom);
    nextX=clamp(nextX,-limits.x,limits.x);nextY=clamp(nextY,-limits.y,limits.y);
   }
   gestureDistance.current+=d;drag.current.moved=true;
  }else{
   const dx=e.clientX-drag.current.x,dy=e.clientY-drag.current.y;
   if(Math.abs(dx)+Math.abs(dy)>6)drag.current.moved=true;
   const limits=getMapPanLimits();
   nextX=clamp(drag.current.px+dx,-limits.x,limits.x);
   nextY=clamp(drag.current.py+dy,-limits.y,limits.y);
  }
  visual.current={x:nextX,y:nextY,zoom:nextZoom};
  if(raf.current!==null)cancelAnimationFrame(raf.current);
  raf.current=requestAnimationFrame(()=>{raf.current=null;applyMapTransform(nextX,nextY,nextZoom)});
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
   gestureStart.current=null;gestureDistance.current=0;pinch.current=null;
   const final=visual.current;
   setPan({x:final.x,y:final.y});setZoom(final.zoom);setIsDragging(false);
   const tap=tapTarget.current;tapTarget.current=null;
   if(!drag.current.moved&&tap){
    if(tap.kind==="location")openLocation(tap.value);
    else openCluster(tap.value.split(","));
   }else if(!drag.current.moved&&!tap&&!isPanel&&view==="map"&&snap!=="peek")setSnap("peek");
  }
 };
 const wheel=(e:React.WheelEvent<SVGSVGElement>)=>{
  e.preventDefault();cancelFlight();
  const rect=mapSvgRef.current!.getBoundingClientRect();
  const next=clamp(visual.current.zoom*(e.deltaY<0?1.12:.89),1,5),r=next/visual.current.zoom;
  const cx=e.clientX-rect.left-rect.width/2,cy=e.clientY-rect.top-rect.height/2;
  const lim=getMapPanLimits(next);
  const nx=clamp(cx*(1-r)+r*visual.current.x,-lim.x,lim.x),ny=clamp(cy*(1-r)+r*visual.current.y,-lim.y,lim.y);
  visual.current={x:nx,y:ny,zoom:next};applyMapTransform(nx,ny,next);setPan({x:nx,y:ny});setZoom(next);
 };

 // ---- Sheet drag (sheet layout) ----------------------------------------------
 const sheetDrag=useRef<{y:number;h:number;moved:boolean}|null>(null);
 const sheetDown=(e:React.PointerEvent<HTMLElement>)=>{
  if(isPanel||view!=="map")return;
  // The grab handle is itself a button (for keyboard users); any other control
  // inside the header keeps its own tap behaviour.
  const control=(e.target as HTMLElement).closest("button,input,[role=slider],a");
  if(control&&!control.classList.contains("grabber"))return;
  sheetDrag.current={y:e.clientY,h:sheetHeightFor(snap),moved:false};
  e.currentTarget.setPointerCapture?.(e.pointerId);
 };
 const sheetMove=(e:React.PointerEvent<HTMLElement>)=>{
  const d=sheetDrag.current;if(!d||!sheetRef.current)return;
  const dy=e.clientY-d.y;if(Math.abs(dy)>6)d.moved=true;
  if(d.moved){sheetRef.current.style.transition="none";sheetRef.current.style.height=clamp(d.h-dy,90,sheetAvailable())+"px"}
 };
 const sheetUp=(e:React.PointerEvent<HTMLElement>)=>{
  const d=sheetDrag.current;sheetDrag.current=null;if(!d||!sheetRef.current)return;
  sheetRef.current.style.transition="";sheetRef.current.style.height="";
  const order:Snap[]=["peek","half","full"];const i=order.indexOf(snap);const dy=e.clientY-d.y;
  if(!d.moved){setSnap(snap==="peek"?"half":"peek");return}
  if(dy<-50)setSnap(order[Math.min(2,i+(dy<-260?2:1))]);else if(dy>50)setSnap(order[Math.max(0,i-(dy>260?2:1))]);
 };

 // ---- Render -----------------------------------------------------------------
 const era=describeEra(year);
 const focusTitle=focus?(focus.kind==="episode"?(episodeById.get(focus.id) as any)?.title:focus.kind==="connection"?(connectionById.get(focus.id) as any)?.label:focus.kind==="community"?communityById.get(focus.id)?.name:focus.kind==="faction"?factionById.get(focus.id)?.name:entityName(focus.id,focus.kind)):"";
 const sheetStyle=!isPanel&&view==="map"?{height:sheetHeightFor(snap)+"px"} as CSSProperties:undefined;
 const detail=focus&&(focus.kind==="location"?<LocationDetail id={focus.id}/>:focus.kind==="episode"?<EpisodeDetail id={focus.id}/>:focus.kind==="character"?<CharacterDetail id={focus.id}/>:focus.kind==="connection"?<ConnectionDetail id={focus.id}/>:<GroupDetail kind={focus.kind} id={focus.id}/>);
 const journeyControls:JourneyControls={
  journeys,beats,cursor:journeyCursor,positions:journeyPositions,playing:journeyPlaying,
  onTogglePlay:toggleJourneyPlay,
  onStep:i=>{setJourneyPlaying(false);stepJourney(i)},
  onStop:(ji,si)=>{const st=journeys[ji]?.stops[si];if(!st)return;const i=beats.findIndex(b=>b.rank===st.rank);if(i>=0){setJourneyPlaying(false);stepJourney(i)}},
  onAdd:id=>{setJourneyIds(ids=>parseJourneyIds([...ids,id].join(",")));journeyFrame.current="all"},
  onRemove:id=>setJourneyIds(ids=>ids.filter(x=>x!==id)),
  spoilerSafe,onSpoilerSafe:setSpoilerSafe,
  onShare:()=>void shareCurrent(),
  onExit:()=>exitJourney()
 };
 const page=view==="map"&&journeyActive?<JourneyPanel c={journeyControls} showPlayer={isPanel}/>:view==="timeline"?<TimelineView/>:view==="people"?<PeopleView/>:view==="watch"?<WatchView errors={dataErrors}/>:<MapOverview year={year} seriesId={seriesId} locations={mapLocations} onOpenTimeline={()=>goView("timeline")}/>;
 const scrubber=<TimeScrubber year={year} onYear={onYearScrub} playing={playing} onTogglePlay={()=>setPlaying(v=>!v)} seriesId={seriesId} activeCount={activeEpisodeCount} placeCount={mappedCount}/>;
 const bigDock=viewport.w>=1180&&viewport.h>=760;
 const watchedPct=Math.round(watched.size/Math.max(1,atlasData.episodes.length)*100);

 return <AtlasContext.Provider value={actions}>
 <div className={"app "+(isPanel?"layout-panel":"layout-sheet")+" view-"+view+(hasDetail?" has-detail":"")+(contextLocationIds.size?" has-context":"")+" snap-"+effectiveSnap} style={{"--top-h":chrome.top+"px","--tab-h":chrome.tab+"px"} as CSSProperties}>
  <main className="stage" aria-labelledby="atlas-map-heading">
   <h1 id="atlas-map-heading" className="srOnly">Walking Dead Universe Atlas map</h1>
   <div className="mapSurface" aria-hidden={view!=="map"&&!isPanel}>
    <svg ref={mapSvgRef} viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid slice" className={isDragging?"dragging":""} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} onWheel={wheel}>
     <defs>
      <linearGradient id="ocean" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#15211f"/><stop offset=".55" stopColor="#101a19"/><stop offset="1" stopColor="#0b1212"/></linearGradient>
      <radialGradient id="oceanGlow" cx=".35" cy=".4" r=".75"><stop offset="0" stopColor="#2a3f3b" stopOpacity=".55"/><stop offset="1" stopColor="#0b1212" stopOpacity="0"/></radialGradient>
     </defs>
     <MapBackground/>
     <g ref={mapWorldRef} className="mapWorld">
      <MapGeography/>
      <HordeLayer enabled={hordeEnabled} year={year} zoom={zoom} project={project} onSelect={()=>setHordeSelected(true)}/>
      {zoom>1.12&&<g className="mapLabels"><text x="184" y="350">NORTH AMERICA</text><text x="557" y="150">EUROPE</text><text x="782" y="360">ASIA</text></g>}
      {journeyActive&&<JourneyRoutes journeys={journeys} positions={journeyPositions} project={project} cursorKey={journeyCursor}/>}
      <g className="markers">{markerGroups.map(group=>{
       if(group.locations.length>1){
        const ids=group.locations.map(l=>l.id);
        const counts=new Map<string,number>();for(const l of group.locations)counts.set(l.seriesId,(counts.get(l.seriesId)??0)+1);
        const lead=[...counts.entries()].sort((a,b)=>b[1]-a[1])[0][0];
        const fresh=group.locations.some(l=>l.year===year&&!journeyActive);
        const ahead=journeyActive&&group.locations.every(l=>!journeyReached.has(l.id));
        const ctx=group.locations.some(l=>contextLocationIds.has(l.id));
        return <g key={"cluster-"+ids.join("-")} data-cluster-ids={ids.join(",")} className={"markerCluster"+(fresh?" fresh":"")+(ctx?" context":"")+(ahead?" ahead":"")} transform={"translate("+group.x+" "+group.y+")"} role="button" tabIndex={0} aria-label={`${ids.length} places here — zoom in`} style={{color:seriesColor(lead)} as CSSProperties} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();openCluster(ids)}}}>
         <g transform={"scale("+(1/zoom)+")"}>
          <circle className="markerHit" r={isMobileMap?24:18}/>
          {fresh&&<circle className="markerPulse" r="16"/>}
          <circle className="clusterRing" r={ids.length>9?16:14}/>
          <text className="clusterCount" textAnchor="middle" dominantBaseline="central">{ids.length}</text>
         </g>
        </g>;
       }
       const l=group.locations[0],p=project(l.lat,l.lng);
       const isSelected=selectedLocation===l.id,isContext=contextLocationIds.has(l.id),isJourney=journeyActive&&journeyLocationIds.has(l.id),isFresh=l.year===year&&!journeyActive;
       const isAhead=isJourney&&!journeyReached.has(l.id),isHere=isJourney&&journeyCurrent.has(l.id);
       const showLabel=isSelected||isContext||isHere||zoom>(isMobileMap?2.3:1.5)||(!isMobileMap&&KEY_PLACES.has(l.name)&&zoom>1.2);
       return <g key={l.id} data-location-id={l.id} className={"marker"+(isSelected?" selected":"")+(isContext?" context":"")+(isJourney?" journey":"")+(isAhead?" ahead":"")+(isHere?" here":"")+(isFresh?" fresh":"")} transform={"translate("+p.x+" "+p.y+")"} style={{color:seriesColor(l.seriesId)} as CSSProperties} role="button" tabIndex={0} aria-label={`${l.name}, ${prettyType(l.type)}, ${SERIES_BY_ID[l.seriesId]?.short}, from ${l.year}`} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();openLocation(l.id)}}}>
        <title>{l.name} · {prettyType(l.type)} · {SERIES_BY_ID[l.seriesId]?.short} · {l.year}+ · {l.certainty}</title>
        <g transform={"scale("+(1/zoom)+")"}>
         <circle className="markerHit" r={isMobileMap?20:13}/>
         {(isFresh||isSelected)&&<circle className="markerPulse" r="11"/>}
         <circle className="markerBody" r={isSelected?13:10}/>
         <g className="markerGlyph"><AtlasIconGlyph name={locationIconName(l.type)} size={isSelected?16:13} x={isSelected?-8:-6.5} y={isSelected?-8:-6.5} strokeWidth={2.2}/></g>
         {showLabel&&<text className="markerLabel" x={isSelected?17:14} y="4">{l.name}</text>}
         {isJourney&&!isAhead&&journeyStops.has(l.id)&&<g className="journeyStop" transform="translate(10 -10)"><circle r="7.5"/><text textAnchor="middle" dominantBaseline="central">{journeyStops.get(l.id)}</text></g>}
        </g>
       </g>;
      })}</g>
      {journeyActive&&<JourneyAvatars journeys={journeys} positions={journeyPositions} project={project} zoom={zoom}/>}
     </g>
    </svg>
   </div>

   {/* Floating map chrome */}
   <div className="mapTop" data-map-chrome="top">
    {journeyActive?<div className="journeyBanner">
     <Icon name="route"/>
     <span><small>{journeys.length>1?"Comparing journeys":"Journey"}{spoilerSafe?" · spoiler-safe":""}</small><b>{journeys.map((j,ji)=><i key={j.characterId} className="jname" style={{"--jc":JOURNEY_COLORS[ji]} as CSSProperties}>{j.name}</i>)}</b></span>
     <em>{journeyReached.size}/{journeyLocationIds.size}</em>
     <button className="iconBtn ghost" onClick={()=>exitJourney()} aria-label="Exit journey view"><Icon name="close"/></button>
    </div>
    :<div className="seriesRow" role="group" aria-label="Filter map by series">
     <button className={series==="ALL"?"active":""} aria-pressed={series==="ALL"} onClick={()=>setSeries("ALL")}>All series</button>
     {SERIES_KEYS.map(k=><button key={k} className={series===k?"active":""} aria-pressed={series===k} style={{"--c":META[k].color} as CSSProperties} onClick={()=>setSeries(s=>s===k?"ALL":k)}><i/>{META[k].short}</button>)}
    </div>}
   </div>
   <div className="mapControls" data-map-chrome="right">
    <button className={"iconBtn"+(mapLayer!=="ALL"?" on":"")} onClick={()=>setLayersOpen(v=>!v)} aria-expanded={layersOpen} aria-label="Map layers"><Icon name="layers"/></button>
    <div className="controlGroup"><button className="iconBtn" onClick={()=>setZoomValue(visual.current.zoom*1.5)} aria-label="Zoom in"><Icon name="plus"/></button><button className="iconBtn" onClick={()=>setZoomValue(visual.current.zoom/1.5)} aria-label="Zoom out"><Icon name="minus"/></button></div>
    <button className="iconBtn" onClick={resetMap} aria-label="Reset map to home"><Icon name="locate"/></button>
    {layersOpen&&<div className="popover layersPopover" role="dialog" aria-label="Map layers">
     <small>Show on map</small>
     <button className={hordeEnabled?"active":""} aria-pressed={hordeEnabled} onClick={()=>{setHordeEnabled(v=>!v);setLayersOpen(false);if(hordeEnabled)setHordeSelected(false)}}><span>Living World · simulated horde</span><b>{hordeEnabled?"On":"Off"}</b>{hordeEnabled&&<Icon name="check"/>}</button>
     {MAP_LAYERS.map(layer=><button key={layer} className={mapLayer===layer?"active":""} aria-pressed={mapLayer===layer} onClick={()=>{setMapLayer(layer);setLayersOpen(false)}}><span>{MAP_LAYER_LABELS[layer]}</span><b>{layerCounts[layer]??0}</b>{mapLayer===layer&&<Icon name="check"/>}</button>)}
    </div>}
    {hordeSelected&&hordeEnabled&&<div className="popover hordeDossier" role="dialog" aria-label="Simulated horde dossier">
     <header><b>Simulated Horde · M1</b><button className="iconBtn ghost" onClick={()=>setHordeSelected(false)} aria-label="Close horde dossier"><Icon name="close"/></button></header>
     <div className="stack">
      <p><strong>Illustrative regional movement</strong></p>
      <p>This moving group is a visual simulation for testing the Living World layer. Its route, location, and walker count are not canonical Walking Dead data.</p>
      <small>Timeline year: {year} · Status: simulated</small>
      <button className="row" onClick={()=>{setHordeEnabled(false);setHordeSelected(false)}}>Turn off Living World layer</button>
     </div>
    </div>}
   </div>
   {isPanel&&<div className={"dock"+(bigDock?"":" dockMini")} data-map-chrome="bottom">
    {bigDock?<AtlasTimelineDock year={year} onYearChange={onYearScrub} series={series} onEpisode={id=>showEpisodeOnMap(id)} selectedEpisode={selectedEpisode} playing={playing} onTogglePlaying={()=>setPlaying(v=>!v)} onConnections={()=>goView("people")}/>:scrubber}
   </div>}

   {clusterIds&&<div className="popover clusterSheet" role="dialog" aria-labelledby="cluster-title">
    <header><b id="cluster-title">{clusterIds.length} places here</b><button className="iconBtn ghost" onClick={()=>setClusterIds(null)} aria-label="Close"><Icon name="close"/></button></header>
    <div className="stack">{clusterIds.map(id=>{const l=locationById.get(id);if(!l)return null;return <button key={id} className="row placeRow" style={{"--c":seriesColor(l.seriesId)} as CSSProperties} onClick={()=>{setClusterIds(null);openLocation(id)}}><span className="placeGlyph"><AtlasIcon name={locationIconName(l.type)}/></span><span className="rowText"><small>{SERIES_BY_ID[l.seriesId]?.short} · {prettyType(l.type)} · {l.year}</small><b>{l.name}</b></span><Icon name="chevron" className="rowChevron"/></button>})}</div>
   </div>}

   {/* Sheet (phones/portrait tablets) or side panel (wide screens) */}
   <section ref={sheetRef} tabIndex={-1} className={"sheet snap-"+effectiveSnap+(view==="map"?" onMap":" asPage")} style={sheetStyle} data-map-chrome={isPanel?"right":"bottom"} {...(hasDetail?{"data-detail-open":""}:{})} aria-label={hasDetail?FOCUS_LABEL[focus!.kind]+" details":TABS.find(t=>t.view===view)?.label}>
    <header className="sheetHead" onPointerDown={sheetDown} onPointerMove={sheetMove} onPointerUp={sheetUp} onPointerCancel={sheetUp}>
     {!isPanel&&view==="map"&&<button className="grabber" onClick={e=>{if(e.detail===0)setSnap(s=>s==="peek"?"half":s==="half"?"full":"peek")}} aria-label={snap==="full"?"Collapse panel":"Expand panel"}><span/></button>}
     {hasDetail?<div className="detailBar">
      {navStack.length>0?<button className="iconBtn ghost" onClick={goBack} aria-label="Back"><Icon name="back"/></button>:<span className="detailBarSpacer"/>}
      <div className="detailBarTitle"><small>{FOCUS_LABEL[focus!.kind]}</small><b>{focusTitle}</b></div>
      {QUERY_KEYS[focus!.kind]&&<button className="iconBtn ghost" onClick={()=>void shareCurrent()} aria-label="Share"><Icon name="share"/></button>}
      <button className="iconBtn ghost" onClick={closeDetail} aria-label="Close details"><Icon name="close"/></button>
     </div>:view==="map"&&!isPanel?(journeyActive?<JourneyPlayer c={journeyControls}/>:scrubber):null}
    </header>
    <div className="sheetBody" ref={sheetBodyRef}>
     <ErrorBoundary key={focus?focus.kind+focus.id:view} onReset={()=>{closeDetail();goView("map")}}>
      {detail||page}
     </ErrorBoundary>
    </div>
   </section>

   {/* Top bar */}
   <header className="topbar" ref={topbarRef} data-map-chrome="top">
    <button className="brand" onClick={()=>{goView("map")}} aria-label="TWDU Atlas home"><span className="brandMark" aria-hidden="true"><Icon name="skull"/></span><span className="brandText"><b>TWDU Atlas</b><small>Walking Dead Universe</small></span></button>
    <button className="searchTrigger" onClick={()=>setSearchOpen(true)} aria-label="Search the atlas"><Icon name="search"/><span className="long">Search people, places, episodes</span><span className="short">Search the atlas</span><kbd>/</kbd></button>
    {isPanel&&<nav className="tabs tabsTop" aria-label="Atlas sections">{TABS.map(t=><button key={t.view} className={view===t.view?"active":""} aria-current={view===t.view?"page":undefined} onClick={()=>goView(t.view)}><Icon name={t.icon}/><span className="tabLabel">{t.label}</span></button>)}</nav>}
    <button className="yearChip" onClick={()=>goView("timeline")} aria-label={`Universe year ${year}, ${era.title}. Open timeline`}><b>{year}</b><span>{era.short}</span></button>
   </header>
  </main>

  {!isPanel&&<nav className="tabbar" ref={tabbarRef} aria-label="Atlas sections">{TABS.map(t=><button key={t.view} className={view===t.view?"active":""} aria-current={view===t.view?"page":undefined} onClick={()=>goView(t.view)}><Icon name={t.icon}/><span>{t.label}</span>{t.view==="watch"&&watched.size>0&&<em>{watchedPct}%</em>}</button>)}</nav>}

  {toast&&<div className="toast" role="status">{toast}</div>}
  {searchOpen&&<SearchOverlay onClose={()=>setSearchOpen(false)} onPick={onSearchPick}/>}
 </div>
 </AtlasContext.Provider>;
}
