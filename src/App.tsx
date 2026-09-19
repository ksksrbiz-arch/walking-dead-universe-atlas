import {useEffect,useMemo,useRef,useState} from "react";
import {geoEqualEarth,geoPath} from "d3-geo";
import {feature} from "topojson-client";
import type {CSSProperties} from "react";
// @ts-ignore world-atlas ships JSON topology
import world from "@cublya/world-atlas/countries-50m.json";
import {atlasData,Location,SeriesKey} from "./data";
import {validateAtlasData} from "./lib/validateData";
import {buildChronology} from "./lib/chronology";

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
 const [view,setView]=useState<View>("map");
 const [dataErrors,setDataErrors]=useState<string[]>([]);
 const [zoom,setZoom]=useState(1);
 const [pan,setPan]=useState({x:0,y:0});
 const [isDragging,setIsDragging]=useState(false);
 const [sheet,setSheet]=useState<"peek"|"open">("peek");
 const [searchOpen,setSearchOpen]=useState(false);
 const [playing,setPlaying]=useState(false);
 const drag=useRef({x:0,y:0,px:0,py:0,moved:false});
 const pointers=useRef(new Map<number,{x:number;y:number}>());
 const pinch=useRef<{distance:number;zoom:number}|null>(null);

 useEffect(()=>setDataErrors(validateAtlasData()),[]);
 useEffect(()=>{if(view!=="map")setSheet("open");},[view]);
 useEffect(()=>{
   if(!playing)return;
   const id=window.setInterval(()=>setYear(y=>y>=2027?2010:y+1),900);
   return()=>window.clearInterval(id);
 },[playing]);
 useEffect(()=>{
   const onKey=(e:KeyboardEvent)=>{
     if((e.target as HTMLElement)?.tagName==="INPUT")return;
     if(e.key==="Escape"){setSearchOpen(false);setSelectedLocation(null);setSelectedEpisode(null)}
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
 const resetMap=()=>{setZoom(1);setPan({x:0,y:0})};
 const selectLocation=(l:Location)=>{setSelectedLocation(l.id);setSelectedEpisode(null);setView("map");setSheet("open")};
 const selectEpisode=(id:string)=>{const raw=atlasData.episodes.find((e:any)=>e.id===id) as any;if(raw?.timelineStart)setYear(Number(raw.timelineStart));setSelectedEpisode(id);setSelectedLocation(null);setView("timeline");setSheet("open")};

 const pointerDown=(e:React.PointerEvent<SVGSVGElement>)=>{
   e.currentTarget.setPointerCapture?.(e.pointerId);
   pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});
   if(pointers.current.size===2){
     const p=[...pointers.current.values()];
     pinch.current={distance:Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y),zoom};
     setIsDragging(false);return;
   }
   drag.current={x:e.clientX,y:e.clientY,px:pan.x,py:pan.y,moved:false};
   setIsDragging(true);
 };
 const pointerMove=(e:React.PointerEvent<SVGSVGElement>)=>{
   if(!pointers.current.has(e.pointerId))return;
   pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});
   if(pointers.current.size>=2){
     const p=[...pointers.current.values()].slice(0,2);
     const d=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);
     if(pinch.current)setZoomValue(pinch.current.zoom*d/pinch.current.distance);
     return;
   }
   if(!isDragging)return;
   const dx=e.clientX-drag.current.x,dy=e.clientY-drag.current.y;
   if(Math.abs(dx)+Math.abs(dy)>4)drag.current.moved=true;
   const limit=220*(zoom-1)+35;
   setPan({x:clamp(drag.current.px+dx,-limit,limit),y:clamp(drag.current.py+dy,-limit,limit)});
 };
 const pointerUp=(e:React.PointerEvent<SVGSVGElement>)=>{
   pointers.current.delete(e.pointerId);pinch.current=null;
   try{e.currentTarget.releasePointerCapture?.(e.pointerId)}catch{}
   if(pointers.current.size===0)setIsDragging(false);
 };
 const wheel=(e:React.WheelEvent<SVGSVGElement>)=>{e.preventDefault();setZoomValue(zoom*(e.deltaY<0?1.12:.89))};
 const mapStyle={transform:`translate3d(${pan.x}px,${pan.y}px,0) scale(${zoom})`,transformOrigin:"50% 50%",transition:isDragging?"none":"transform 180ms ease-out"};

 const goView=(v:View)=>{setView(v);setSelectedLocation(null);setSelectedEpisode(null);setSheet("open")};
 const mapYearCount=locations.length;
 const visibleSeries=series==="ALL"?"THE WORLD":"${META[series].short}";

 return <div className="app">
  <header className="topbar">
   <button className="brand" onClick={()=>{setView("map");setSelectedLocation(null);setSelectedEpisode(null)}} aria-label="Return to atlas map">
    <span className="logoMark">◈</span><span><b>TWDU ATLAS</b><small>THE WALKING DEAD UNIVERSE · FIELD GUIDE</small></span>
   </button>
   <div className="searchWrap">
    <Icon name="search"/>
    <input value={query} onFocus={()=>setSearchOpen(true)} onChange={e=>{setQuery(e.target.value);setSearchOpen(true)}} placeholder="Search a place, person, episode…" aria-label="Search atlas"/>
    {query&&<button className="clearSearch" onClick={()=>{setQuery("");setSearchOpen(false)}}><Icon name="close"/></button>}
    {searchOpen&&query&&<div className="searchResults">{searchResults.length?searchResults.map(r=><button key={r.kind+r.id} onClick={()=>{if(r.kind==="location"){const l=atlasData.locations.find(x=>x.id===r.id);if(l)selectLocation(l)}else if(r.kind==="episode")selectEpisode(r.id);else{setView("people");setSheet("open")}setQuery("");setSearchOpen(false)}}><span className="resultIcon">{r.kind==="episode"?"EP":r.kind.slice(0,2).toUpperCase()}</span><span className="resultText"><b>{r.title}</b><small>{r.meta}</small></span><Icon name="chevron"/></button>):<div className="emptySearch">No matching atlas records.</div>}</div>}
   </div>
   <div className="headerMeta"><span>LIVE ATLAS</span><b>{year}</b></div>
  </header>

  <main className="atlasMain">
   <section className="map" aria-label="Interactive Walking Dead Universe map">
    <div className="mapAtmosphere"/>
    <div className="mapSurface">
     <svg viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid meet" style={mapStyle} className={isDragging?"dragging":""} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} onWheel={wheel}>
      <defs>
       <linearGradient id="ocean" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#9fb2b4"/><stop offset=".48" stopColor="#82999d"/><stop offset="1" stopColor="#60777b"/></linearGradient>
       <linearGradient id="land" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#d8d3c5"/><stop offset=".55" stopColor="#b9b7aa"/><stop offset="1" stopColor="#96988e"/></linearGradient>
       <radialGradient id="oceanGlow" cx=".5" cy=".38" r=".72"><stop offset="0" stopColor="#c7d4d4" stopOpacity=".55"/><stop offset="1" stopColor="#51696e" stopOpacity=".08"/></radialGradient>
       <filter id="landShadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="5" stdDeviation="5" floodColor="#26383a" floodOpacity=".28"/></filter>
       <filter id="paperNoise"><feTurbulence type="fractalNoise" baseFrequency=".65" numOctaves="2" stitchTiles="stitch" result="noise"/><feColorMatrix in="noise" type="saturate" values="0" result="gray"/><feComponentTransfer><feFuncA type="table" tableValues="0 .055"/></feComponentTransfer><feBlend in="SourceGraphic" in2="gray" mode="multiply"/></filter>
      </defs>
      <rect width="1000" height="600" fill="url(#ocean)"/>
      <rect width="1000" height="600" fill="url(#oceanGlow)"/>
      <g className="graticule"><path d={pathGenerator({type:"Sphere"}) as string}/></g>
      <path className="landShadow" d={pathGenerator(worldLand) as string} fill="#26383a" opacity=".38" filter="url(#landShadow)"/>
      <g className="countries" filter="url(#paperNoise)">{worldCountries.features.map((c:any,i:number)=><path key={c.id||c.properties?.name} d={pathGenerator(c) as string} fill={countryTone(i)}><title>{c.properties?.name||"Country"}</title></path>)}</g>
      <g className="mapLabels"><text x="184" y="350">NORTH AMERICA</text><text x="557" y="150">EUROPE</text><text x="782" y="360">ASIA</text></g>
      <g className="markers">{locations.map(l=>{const p=project(l.lat,l.lng),meta=SERIES_BY_ID[l.seriesId];return <g key={l.id} className={selectedLocation===l.id?"marker selected":"marker"} transform={`translate(${p.x} ${p.y})`} onPointerUp={e=>{if(!drag.current.moved){e.stopPropagation();selectLocation(l)}}}>
       <circle className="pulse" r="2.5" style={{stroke:meta.color}}/><circle className="dot" r="1.5" fill={meta.color}/><text x="4" y=".5">{l.name}</text>
      </g>})}</g>
     </svg>
    </div>

    <div className="mapChrome mapTopLeft">
      <div className="locationKicker"><span className="liveDot"/>{visibleSeries}</div>
      <strong>{mapYearCount} LOCATIONS</strong>
      <small>DRAG · PINCH · SCROLL TO EXPLORE</small>
    </div>

    <div className="mapChrome mapTopRight">
      <button onClick={()=>setZoomValue(zoom+.5)} aria-label="Zoom in"><Icon name="plus"/></button>
      <button onClick={()=>setZoomValue(zoom-.5)} aria-label="Zoom out"><Icon name="minus"/></button>
      <button onClick={resetMap} aria-label="Reset map"><Icon name="locate"/></button>
      <div className="zoomBadge">{Math.round(zoom*100)}%</div>
    </div>

    <div className="mapCompass" aria-hidden="true"><span>N</span><i></i><small>1:50m</small></div>

    <div className="seriesRail" aria-label="Series filter">
      <button className={series==="ALL"?"active":""} onClick={()=>setSeries("ALL")}>ALL</button>
      {SERIES_KEYS.map(k=><button key={k} className={series===k?"active":""} style={series===k?{"--series":META[k].color} as CSSProperties:{}} onClick={()=>setSeries(k)}>{META[k].short}</button>)}
    </div>

    <div className="timeMachine">
      <div className="timeMachineHead"><div><small>UNIVERSE TIME</small><b>{year}</b></div><button onClick={()=>setPlaying(v=>!v)} aria-label={playing?"Pause chronology":"Play chronology"}><Icon name={playing?"pause":"play"}/></button></div>
      <input aria-label="Universe year" type="range" min="2010" max="2027" value={year} onChange={e=>{setPlaying(false);setYear(Number(e.target.value))}}/>
      <div className="timeScale"><span>2010 · OUTBREAK</span><span>2014</span><span>2018</span><span>2022</span><span>2027</span></div>
    </div>

    <section className={`contentPanel ${sheet}`}>
      <button className="panelGrab" onClick={()=>setSheet(v=>v==="open"?"peek":"open")} aria-label="Toggle information panel"><span/></button>
      <div className="panelHeader">
       <div><small>{selectedLoc?SERIES_BY_ID[selectedLoc.seriesId]?.name:selectedEp?SERIES_BY_ID[selectedEp.seriesId]?.name:view==="map"?"ATLAS":"TWDU ATLAS"}</small><h2>{selectedLoc?.name||selectedEp?.title||(view==="map"?"Explore the universe":view==="timeline"?"Chronology":"Field guide")}</h2></div>
       {(selectedLoc||selectedEp)&&<button className="closePanel" onClick={()=>{setSelectedLocation(null);setSelectedEpisode(null)}}><Icon name="close"/></button>}
      </div>
      {selectedLoc?<LocationDetail location={selectedLoc} onEpisode={selectEpisode}/>:selectedEp?<EpisodeDetail episode={selectedEp} onLocation={selectLocation} onEpisode={selectEpisode}/>:view==="map"?<MapContent locations={locations} onSelect={selectLocation}/>:view==="timeline"?<TimelineContent episodes={episodes} onEpisode={selectEpisode}/>:view==="people"?<PeopleContent/>:<GuideContent errors={dataErrors}/>}
    </section>

    <nav className="bottomNav" aria-label="Atlas sections">
      {(["map","timeline","people","guide"] as View[]).map(v=><button key={v} className={view===v?"active":""} onClick={()=>goView(v)}><Icon name={v==="map"?"map":v==="timeline"?"timeline":v==="people"?"people":"guide"}/><small>{v==="map"?"MAP":v==="timeline"?"TIME":v==="people"?"PEOPLE":"GUIDE"}</small></button>)}
    </nav>
   </section>
  </main>
 </div>;
}

function LocationDetail({location,onEpisode}:{location:Location;onEpisode:(id:string)=>void}){
 const meta=SERIES_BY_ID[location.seriesId];
 const placeMedia=(atlasData as any).media?.places?.[location.id];
 const episodes=atlasData.episodes.filter((e:any)=>e.locationIds?.includes(location.id));
 const events=atlasData.events.filter((e:any)=>e.locationIds?.includes(location.id));
 return <div className="contentScroll">
  <div className="entityHero" style={{"--accent":meta.color} as CSSProperties}>{placeMedia?.image&&<img src={placeMedia.image} alt="" className="entityArt"/>}<div className="entityHeroCopy"><span>{meta.short} · {location.year}</span><h3>{location.name}</h3><p>{location.type} · {location.certainty}</p></div></div>
  <div className="detailGrid"><div><small>TYPE</small><b>{location.type}</b></div><div><small>ERA</small><b>{location.year}+</b></div><div><small>EPISODES</small><b>{episodes.length}</b></div><div><small>STATUS</small><b>{location.certainty}</b></div></div>
  <div className="sectionTitle">EPISODE PRESENCE <span>{episodes.length}</span></div>
  {episodes.length?<div className="cards">{episodes.map((e:any)=><button className="entityCard episodeCard" key={e.id} onClick={()=>onEpisode(e.id)}><span className="episodeYear">{e.timelineStart||"?"}</span><span><small>{meta.short} · S{String(e.seasonId).slice(-2)}E{String(e.episodeNumber).padStart(2,"0")}</small><b>{e.title}</b><em>{e.certainty} · {e.timelinePrecision}</em></span><Icon name="chevron"/></button>)}</div>:<p className="muted">No episode-level location link has been recorded yet.</p>}
  {events.length>0&&<><div className="sectionTitle">MAJOR EVENTS <span>{events.length}</span></div><div className="timelineList">{events.map((e:any)=><article key={e.id}><strong>{e.year}</strong><div><small>EVENT · {meta.short}</small><b>{e.title}</b><span>{e.certainty}</span></div></article>)}</div></>}
  <div className="sourceNote"><Icon name="pin"/><span>Geographic coordinates and chronology certainty are tracked separately. Approximate placements remain explicitly labeled.</span></div>
 </div>;
}

function EpisodeDetail({episode,onLocation,onEpisode}:{episode:any;onLocation:(l:Location)=>void;onEpisode:(id:string)=>void}){
 const raw=atlasData.episodes.find((e:any)=>e.id===episode.id) as any;
 const meta=SERIES_BY_ID[episode.seriesId];
 const locations=atlasData.locations.filter(l=>raw?.locationIds?.includes(l.id));
 const ordered=buildChronology().filter(x=>x.kind==="episode");
 const index=ordered.findIndex(x=>x.id===episode.id);
 const prev=ordered[index-1],next=ordered[index+1];
 return <div className="contentScroll">
  <div className="episodeHero" style={{"--accent":meta.color} as CSSProperties}>{media?.image&&<img src={media.image} alt="" className="episodeArt"/>}<div className="episodeHeroCopy"><span>{meta.name} · {episode.seasonId?.toUpperCase()}E{String(episode.episodeNumber).padStart(2,"0")}</span><h3>{episode.title}</h3><div className="episodeMeta"><b>{episode.start===episode.end?episode.start:`${episode.start}–${episode.end}`}</b><em>{episode.certainty}</em><em>{episode.precision}</em></div></div></div>
  {locations.length>0&&<><div className="sectionTitle">LOCATIONS <span>{locations.length}</span></div><div className="miniTags locationLinks">{locations.map(l=><button key={l.id} onClick={()=>onLocation(l)}><Icon name="pin"/>{l.name}</button>)}</div></>}
  <div className="sectionTitle">CHRONOLOGY NAVIGATION</div>
  <div className="episodeNav">{prev&&<button onClick={()=>onEpisode(prev.id)}><small>PREVIOUS</small><b>{prev.title}</b><span>{prev.start}</span></button>}<div className="chronologyMarker"><span>IN UNIVERSE</span><strong>{episode.start}</strong></div>{next&&<button onClick={()=>onEpisode(next.id)}><small>NEXT</small><b>{next.title}</b><span>{next.start}</span></button>}</div>
  <div className="sourceNote"><Icon name="layers"/><span>Air date and in-universe chronology are separate fields. Ranges and uncertain placements stay labeled rather than flattened.</span></div>
 </div>;
}

function MapContent({locations,onSelect}:{locations:Location[];onSelect:(l:Location)=>void}){return <div className="contentScroll"><div className="sectionTitle">MAPPED LOCATIONS <span>{locations.length}</span></div><div className="cards">{locations.map(l=><button className="entityCard" key={l.id} onClick={()=>onSelect(l)}><span><small>{SERIES_BY_ID[l.seriesId]?.short} · {l.year}</small><b>{l.name}</b><em>{l.type} · {l.certainty}</em></span><Icon name="chevron"/></button>)}</div></div>}

function TimelineContent({episodes,onEpisode}:{episodes:any[];onEpisode:(id:string)=>void}){return <div className="contentScroll"><div className="timelineIntro"><span>EPISODE EXPLORER</span><p>Move through the universe by in-world chronology. Select any episode to jump into its locations and adjacent timeline entries.</p></div><div className="timelineList episodeList">{episodes.map((e:any)=><button className="episodeRow" key={e.id} onClick={()=>onEpisode(e.id)}><strong>{e.start||"?"}</strong><span><small>{SERIES_BY_ID[e.seriesId]?.short} · S{String(e.seasonId).slice(-2)}E{String(e.episodeNumber).padStart(2,"0")}</small><b>{e.title}</b><em>{e.certainty} · {e.precision}</em></span><Icon name="chevron"/></button>)}</div></div>}

function PeopleContent(){return <div className="contentScroll"><div className="sectionTitle">CHARACTERS <span>{atlasData.characters.length}</span></div><div className="cards">{atlasData.characters.map(c=><article className="entityCard static" key={c.id}><span><small>CHARACTER</small><b>{c.name}</b><em>{c.certainty}</em></span></article>)}</div><div className="sectionTitle">FACTIONS <span>{atlasData.factions.length}</span></div><div className="miniTags">{atlasData.factions.map(f=><span key={f.id}>{f.name}</span>)}</div><div className="sectionTitle">CROSS-SERIES CONNECTIONS <span>{atlasData.connections.length}</span></div><div className="timelineList">{atlasData.connections.map((c:any)=><article key={c.id}><strong>↔</strong><div><small>{c.type}</small><b>{c.label}</b><span>{c.fromId} → {c.toId} · {c.certainty}</span></div></article>)}</div></div>}

function GuideContent({errors}:{errors:string[]}){const episodeCount=atlasData.seasonMeta.reduce((n:any,x:any)=>n+x.episodeCount,0);const art=(atlasData as any).media?.series?.twd?.keyArt;return <div className="contentScroll"><div className="guideHero">{art&&<img src={art} alt="" className="guideArt"/>}<div className="guideHeroCopy"><span>ATLAS ENGINE</span><h3>A living field guide to the entire TV universe.</h3><p>Geography, chronology, people and connections are rendered from the same normalized data layer.</p></div></div><div className="guideStats"><div><b>{atlasData.series.length}</b><span>SERIES</span></div><div><b>{atlasData.seasons.length}</b><span>SEASONS</span></div><div><b>{atlasData.locations.length}</b><span>LOCATIONS</span></div><div><b>{episodeCount}</b><span>EPISODES</span></div></div><div className="sectionTitle">WATCH ORDER <span>{atlasData.watchOrder.filter((x:any)=>x.type!=="note").length} segments</span></div><div className="watchOrder">{atlasData.watchOrder.filter((x:any)=>x.type!=="note").map((x:any,i)=><article key={x.id}><strong>{String(i+1).padStart(2,"0")}</strong><div><small>{SERIES_BY_ID[x.seriesId]?.name}</small><b>{x.startSeason===x.endSeason?"Season "+x.startSeason:"Seasons "+x.startSeason+"–"+x.endSeason}</b><span>{x.certainty} · series-level scaffold</span></div></article>)}</div><article className="statusCard"><small>DATA VALIDATION</small><b>{errors.length?"REVIEW REFERENCES":"REGISTRY HEALTHY"}</b><span>{errors.length?errors.join(" · "):"Core IDs and references pass the atlas validator."}</span></article></div>}

