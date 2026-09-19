import {useEffect,useMemo,useRef,useState} from "react";
import type {CSSProperties} from "react";
import {atlasData,Location,SeriesKey} from "./data";
import {validateAtlasData} from "./lib/validateData";

type View="map"|"timeline"|"people"|"guide";
type EntityKind="location"|"character"|"community"|"faction"|"event";

const META:Record<SeriesKey,{id:string;name:string;color:string;short:string}>={
 TWD:{id:"twd",name:"The Walking Dead",color:"#e5e8e8",short:"TWD"},
 FTWD:{id:"ftwd",name:"Fear the Walking Dead",color:"#d7a84b",short:"Fear"},
 TALES:{id:"tales",name:"Tales of the Walking Dead",color:"#d88468",short:"Tales"},
 WB:{id:"wb",name:"World Beyond",color:"#75a9c7",short:"World Beyond"},
 OWL:{id:"owl",name:"The Ones Who Live",color:"#d16d68",short:"TOWL"},
 DARYL:{id:"daryl",name:"Daryl Dixon",color:"#a08ac7",short:"Daryl"},
 DEAD:{id:"dead",name:"Dead City",color:"#5eb39a",short:"Dead City"}
};
const SERIES_BY_ID=Object.fromEntries(Object.values(META).map(x=>[x.id,x])) as Record<string,typeof META.TWD>;
const SERIES_KEYS=Object.keys(META) as SeriesKey[];
const project=(lat:number,lng:number)=>({x:(lng+180)/360*100,y:(90-lat)/180*60});
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));

function Icon({name}:{name:"map"|"timeline"|"people"|"guide"|"plus"|"minus"|"locate"|"search"|"close"|"chevron"}) {
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
  chevron:<path d="m9 6 6 6-6 6"/>
 };
 return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

export default function App(){
 const [series,setSeries]=useState<SeriesKey|"ALL">("ALL");
 const [year,setYear]=useState(2010);
 const [query,setQuery]=useState("");
 const [selectedId,setSelectedId]=useState<string|null>(null);
 const [view,setView]=useState<View>("map");
 const [dataErrors,setDataErrors]=useState<string[]>([]);
 const [zoom,setZoom]=useState(1);
 const [pan,setPan]=useState({x:0,y:0});
 const [isDragging,setIsDragging]=useState(false);
 const [showFilters,setShowFilters]=useState(false);
 const [mobilePanel,setMobilePanel]=useState<"hidden"|"peek"|"open">("peek");
 const [searchOpen,setSearchOpen]=useState(false);
 const drag=useRef({x:0,y:0,px:0,py:0,moved:false});
 const pinch=useRef<{distance:number;zoom:number}|null>(null);
 const svgRef=useRef<SVGSVGElement|null>(null);

 useEffect(()=>setDataErrors(validateAtlasData()),[]);
 useEffect(()=>{ if(view!=="map") setMobilePanel("open"); else setMobilePanel("peek"); },[view]);

 const selected=atlasData.locations.find(l=>l.id===selectedId) ?? null;
 const filteredLocations=useMemo(()=>atlasData.locations.filter(l=>{
   const meta=SERIES_BY_ID[l.seriesId];
   const matchesSeries=series==="ALL"||meta?.short===META[series]?.short;
   const matchesYear=l.year<=year;
   const q=query.trim().toLowerCase();
   const matchesQuery=!q||[l.name,l.type,meta?.name].join(" ").toLowerCase().includes(q);
   return meta&&matchesSeries&&matchesYear&&matchesQuery;
 }),[series,year,query]);

 const timeline=useMemo(()=>atlasData.events.filter(e=>{
   const meta=SERIES_BY_ID[e.seriesId];
   const q=query.trim().toLowerCase();
   return meta&&e.year<=year&&(series==="ALL"||meta.short===META[series]?.short)&&(!q||e.title.toLowerCase().includes(q));
 }),[series,year,query]);

 const searchResults=useMemo(()=>{
   const q=query.trim().toLowerCase();
   if(!q) return [];
   const result:{kind:EntityKind;id:string;title:string;meta:string}[]=[];
   atlasData.locations.forEach(x=>{if([x.name,x.type].join(" ").toLowerCase().includes(q))result.push({kind:"location",id:x.id,title:x.name,meta:`${SERIES_BY_ID[x.seriesId]?.short} · ${x.year}`})});
   atlasData.characters.forEach(x=>{if(x.name.toLowerCase().includes(q))result.push({kind:"character",id:x.id,title:x.name,meta:"Character"})});
   atlasData.communities.forEach(x=>{if(x.name.toLowerCase().includes(q))result.push({kind:"community",id:x.id,title:x.name,meta:"Community"})});
   atlasData.factions.forEach(x=>{if(x.name.toLowerCase().includes(q))result.push({kind:"faction",id:x.id,title:x.name,meta:"Faction"})});
   return result.slice(0,10);
 },[query]);

 const setMapZoom=(next:number|((v:number)=>number))=>setZoom(z=>clamp(typeof next==="function"?next(z):next,1,5));
 const resetMap=()=>{setZoom(1);setPan({x:0,y:0})};
 const selectLocation=(l:Location)=>{setSelectedId(l.id);setView("map");setMobilePanel("open")};

 const pointerDown=(e:React.PointerEvent<SVGSVGElement>)=>{
   (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
   drag.current={x:e.clientX,y:e.clientY,px:pan.x,py:pan.y,moved:false};
   setIsDragging(true);
 };
 const pointerMove=(e:React.PointerEvent<SVGSVGElement>)=>{
   if(!isDragging)return;
   const dx=e.clientX-drag.current.x,dy=e.clientY-drag.current.y;
   if(Math.abs(dx)+Math.abs(dy)>3)drag.current.moved=true;
   const limit=180*(zoom-1)+30;
   setPan({x:clamp(drag.current.px+dx,-limit,limit),y:clamp(drag.current.py+dy,-limit,limit)});
 };
 const pointerUp=(e:React.PointerEvent<SVGSVGElement>)=>{
   try{(e.currentTarget as Element).releasePointerCapture?.(e.pointerId)}catch{}
   setIsDragging(false);
 };
 const wheel=(e:React.WheelEvent<SVGSVGElement>)=>{
   e.preventDefault();
   setMapZoom(z=>clamp(z*(e.deltaY<0?1.12:.89),1,5));
 };
 const touchStart=(e:React.TouchEvent<SVGSVGElement>)=>{
   if(e.touches.length===2){
     const dx=e.touches[0].clientX-e.touches[1].clientX,dy=e.touches[0].clientY-e.touches[1].clientY;
     pinch.current={distance:Math.hypot(dx,dy),zoom};
   }
 };
 const touchMove=(e:React.TouchEvent<SVGSVGElement>)=>{
   if(e.touches.length===2&&pinch.current){
     e.preventDefault();
     const dx=e.touches[0].clientX-e.touches[1].clientX,dy=e.touches[0].clientY-e.touches[1].clientY;
     setMapZoom(pinch.current.zoom*(Math.hypot(dx,dy)/pinch.current.distance));
   }
 };
 const touchEnd=()=>{pinch.current=null};

 const goView=(v:View)=>{setView(v);setSelectedId(null);setShowFilters(false)};
 const zoomButton=(delta:number)=>setMapZoom(z=>z+delta);
 const mapStyle={transform:`translate3d(${pan.x}px,${pan.y}px,0) scale(${zoom})`,transformOrigin:"50% 50%",transition:isDragging?"none":"transform 160ms ease-out"};

 return <div className="app">
  <header className="topbar">
   <div className="brand"><div className="logo">◈</div><div><b>TWDU Atlas</b><small>CHRONOLOGY · GEOGRAPHY · CONNECTIONS</small></div></div>
   <div className="searchWrap">
    <Icon name="search"/><input value={query} onFocus={()=>setSearchOpen(true)} onChange={e=>{setQuery(e.target.value);setSearchOpen(true)}} placeholder="Search locations, characters, communities…" aria-label="Search atlas"/>
    {query&&<button className="iconBtn clearSearch" onClick={()=>{setQuery("");setSearchOpen(false)}}><Icon name="close"/></button>}
    {searchOpen&&query&&<div className="searchResults">{searchResults.length?searchResults.map(r=><button key={r.kind+r.id} onClick={()=>{if(r.kind==="location"){const l=atlasData.locations.find(x=>x.id===r.id);if(l)selectLocation(l)}else{setView("people");setMobilePanel("open")}setSearchOpen(false)}}><span>{r.title}</span><small>{r.meta}</small><Icon name="chevron"/></button>):<div className="emptySearch">No matching atlas nodes.</div>}</div>}
   </div>
   <button className="mobileFilter" onClick={()=>setShowFilters(v=>!v)} aria-label="Filters">FILTER</button>
  </header>

  <main>
   <section className="map" aria-label="Interactive Walking Dead Universe map">
    <div className="mapSurface">
     <svg ref={svgRef} viewBox="0 0 100 60" preserveAspectRatio="xMidYMid meet"
       onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}
       onWheel={wheel} onTouchStart={touchStart} onTouchMove={touchMove} onTouchEnd={touchEnd}
       style={mapStyle} className={isDragging?"dragging":""}>
      <rect width="100" height="60" fill="#d8d6ce"/>
      <g className="gridlines">{[10,20,30,40,50,60,70,80,90].map(x=><line key={"x"+x} x1={x} y1="0" x2={x} y2="60"/>)}{[10,20,30,40,50].map(y=><line key={"y"+y} x1="0" y1={y} x2="100" y2={y}/>)}</g>
      <g className="landmasses">
       <path d="M5 14 13 9 21 11 27 17 24 23 27 28 22 33 16 30 12 35 7 30 4 23Z"/>
       <path d="M26 31 31 35 33 43 30 51 25 46 24 38 21 34Z"/>
       <path d="M43 12 51 8 60 10 66 15 73 14 78 19 76 25 69 27 64 24 59 28 52 25 48 27 44 22Z"/>
       <path d="M57 29 63 31 66 37 63 44 59 51 55 47 57 40 54 35Z"/>
       <path d="M76 16 83 14 88 18 92 24 88 29 82 27 78 22Z"/>
      </g>
      <g className="mapLabels"><text x="16" y="38">NORTH AMERICA</text><text x="61" y="7">EUROPE</text><text x="88" y="39">ASIA</text></g>
      <g className="routes">{filteredLocations.slice(1).map((l,i)=>{const a=project(filteredLocations[0].lat,filteredLocations[0].lng),b=project(l.lat,l.lng);return <line key={l.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} style={{animationDelay:`${i*40}ms`}}/>})}</g>
      <g className="markers">{filteredLocations.map(l=>{const p=project(l.lat,l.lng),meta=SERIES_BY_ID[l.seriesId];return <g key={l.id} className={selectedId===l.id?"marker selected":"marker"} transform={`translate(${p.x} ${p.y})`} onPointerUp={e=>{if(!drag.current.moved){e.stopPropagation();selectLocation(l)}}}>
       <circle className="pulse" r="2.6" style={{stroke:meta.color}}/><circle r="1.25" fill={meta.color}/><text x="2.1" y=".4">{l.name}</text>
      </g>})}</g>
     </svg>
    </div>

    <div className="mapHud">
      <div className="mapTitle"><strong>{series==="ALL"?"WORLD":META[series].short}</strong><span>{filteredLocations.length} locations</span></div>
      <div className="mapTools">
       <button onClick={()=>zoomButton(.5)} aria-label="Zoom in"><Icon name="plus"/></button>
       <button onClick={()=>zoomButton(-.5)} aria-label="Zoom out"><Icon name="minus"/></button>
       <button onClick={resetMap} aria-label="Reset map"><Icon name="locate"/></button>
      </div>
      <div className="zoomReadout">{Math.round(zoom*100)}%</div>
    </div>

    {view==="map"&&<div className="filtersBar">
      <button className={series==="ALL"?"active":""} onClick={()=>setSeries("ALL")}>ALL</button>
      {SERIES_KEYS.map(k=><button key={k} className={series===k?"active":""} style={series===k?{borderColor:META[k].color}:{}} onClick={()=>setSeries(k)}>{META[k].short}</button>)}
    </div>}

    <div className={`timePanel ${view!=="map"?"hiddenOnOtherViews":""}`}>
      <div className="timeHead"><span>UNIVERSE TIME</span><strong>{year}</strong></div>
      <input aria-label="Universe year" type="range" min="2010" max="2027" value={year} onChange={e=>setYear(Number(e.target.value))}/>
      <div className="ticks"><span>2010</span><span>2014</span><span>2018</span><span>2022</span><span>2027</span></div>
    </div>

    <section className={`contentPanel ${mobilePanel}`}>
      <button className="panelGrab" onClick={()=>setMobilePanel(p=>p==="open"?"peek":"open")} aria-label="Toggle panel"><span/></button>
      <div className="panelHeader"><div><small>{selected?SERIES_BY_ID[selected.seriesId]?.name:view.toUpperCase()}</small><h2>{selected?.name||view==="map"?"Explore the universe":view==="timeline"?"Universe timeline":view==="people"?"People & connections":"Atlas guide"}</h2></div>{selected&&<button className="closePanel" onClick={()=>{setSelectedId(null);setMobilePanel("peek")}}><Icon name="close"/></button>}</div>
      {selected?<LocationDetail location={selected}/>:view==="map"?<MapContent locations={filteredLocations} onSelect={selectLocation}/>:view==="timeline"?<TimelineContent events={timeline}/>:view==="people"?<PeopleContent/>:<GuideContent errors={dataErrors}/>}
    </section>

    <nav className="bottomNav">{(["map","timeline","people","guide"] as View[]).map(v=><button key={v} className={view===v?"active":""} onClick={()=>goView(v)}><Icon name={v==="map"?"map":v==="timeline"?"timeline":v==="people"?"people":"guide"}/><small>{v}</small></button>)}</nav>
   </section>
  </main>
 </div>;
}

function LocationDetail({location}:{location:Location}){
 const meta=SERIES_BY_ID[location.seriesId];
 return <div className="detailBody"><div className="entityHero" style={{"--accent":meta.color} as CSSProperties}><span className="eyebrow">{meta.short} · {location.year}</span><h3>{location.name}</h3><p>{location.type} · {location.certainty}</p></div><div className="detailGrid"><div><small>TYPE</small><b>{location.type}</b></div><div><small>ERA</small><b>{location.year}+</b></div><div><small>SERIES</small><b>{meta.short}</b></div></div><div className="sectionTitle">Atlas status</div><p className="muted">This location is connected to the canonical data layer. Episode-level source references will progressively increase its chronology precision.</p></div>
}
function MapContent({locations,onSelect}:{locations:Location[];onSelect:(l:Location)=>void}){return <div className="contentScroll"><div className="sectionTitle">Locations <span>{locations.length}</span></div><div className="cards">{locations.map(l=><button className="entityCard" key={l.id} onClick={()=>onSelect(l)}><div><small>{SERIES_BY_ID[l.seriesId]?.short} · {l.year}</small><b>{l.name}</b><span>{l.type} · {l.certainty}</span></div><Icon name="chevron"/></button>)}</div></div>}
function TimelineContent({events}:{events:typeof atlasData.events}){return <div className="contentScroll"><div className="sectionTitle">Timeline events <span>{events.length}</span></div><div className="timelineList">{events.map(e=><article key={e.id}><div className="eventYear">{e.year}</div><div><small>{SERIES_BY_ID[e.seriesId]?.short}</small><b>{e.title}</b><span>{e.certainty}</span></div></article>)}</div></div>}
function PeopleContent(){return <div className="contentScroll"><div className="sectionTitle">Characters <span>{atlasData.characters.length}</span></div><div className="cards">{atlasData.characters.map(c=><article className="entityCard static" key={c.id}><div><small>CHARACTER</small><b>{c.name}</b><span>{c.certainty} · cross-series links available in the connection graph.</span></div></article>)}</div><div className="sectionTitle">Factions <span>{atlasData.factions.length}</span></div><div className="miniTags">{atlasData.factions.map(f=><span key={f.id}>{f.name}</span>)}</div></div>}
function GuideContent({errors}:{errors:string[]}){return <div className="contentScroll"><div className="guideHero"><span>ATLAS ENGINE</span><h3>Explore the universe as a connected system.</h3><p>Map, chronology, characters, communities and factions are driven from normalized data.</p></div><div className="guideStats"><div><b>{atlasData.series.length}</b><span>Series</span></div><div><b>{atlasData.seasons.length}</b><span>Seasons</span></div><div><b>{atlasData.locations.length}</b><span>Locations</span></div><div><b>{atlasData.events.length}</b><span>Events</span></div></div><article className="statusCard"><small>DATA VALIDATION</small><b>{errors.length?"Review references":"Registry healthy"}</b><span>{errors.length?errors.join(" · "):"Initial IDs and series references pass validation."}</span></article></div>}
