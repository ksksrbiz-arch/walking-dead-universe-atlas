import {useEffect,useMemo,useState} from "react";
import {atlasData,Location,SeriesKey} from "./data";
import {validateAtlasData} from "./lib/validateData";

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
const project=(lat:number,lng:number)=>({x:(lng+180)/360*100,y:(90-lat)/180*100});

export default function App(){
 const [series,setSeries]=useState<SeriesKey|"ALL">("ALL");
 const [year,setYear]=useState(2010);
 const [query,setQuery]=useState("");
 const [selectedId,setSelectedId]=useState<string|null>(null);
 const [view,setView]=useState<"map"|"timeline"|"people"|"guide">("map");
 const [dataErrors,setDataErrors]=useState<string[]>([]);

 useEffect(()=>setDataErrors(validateAtlasData()),[]);
 const selected=atlasData.locations.find(l=>l.id===selectedId) ?? null;
 const visible=useMemo(()=>atlasData.locations.filter(l=>{
   const meta=SERIES_BY_ID[l.seriesId];
   return meta && (series==="ALL"||meta.short===META[series]?.short) && l.year<=year &&
     (!query||`${l.name} ${l.type}`.toLowerCase().includes(query.toLowerCase()));
 }),[series,year,query]);

 const timeline=useMemo(()=>atlasData.events.filter(e=>{
   const meta=SERIES_BY_ID[e.seriesId];
   return meta && e.year<=year && (series==="ALL"||meta.short===META[series]?.short);
 }),[series,year]);

 const select=(l:Location)=>{setSelectedId(l.id);setView("map");};

 return <div className="app">
  <header>
   <div className="brand"><div className="logo">◈</div><div><b>TWDU Atlas</b><small>CHRONOLOGY · GEOGRAPHY · CONNECTIONS</small></div></div>
   <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search locations, characters, communities…" aria-label="Search atlas"/>
  </header>
  <main><section className="map">
   <div className="maptitle"><b>{series==="ALL"?"WORLD":META[series].short}</b><span>{visible.length} nodes</span></div>
   <svg viewBox="0 0 100 60" aria-label="Walking Dead Universe map">
    <rect width="100" height="60" fill="#d8d6ce"/>
    <path className="land" d="M7 13 14 9 22 11 27 17 24 23 27 27 22 31 17 28 13 32 8 27 5 22Z"/>
    <path className="land" d="M27 29 31 33 33 41 30 50 26 46 25 38 22 34Z"/>
    <path className="land" d="M45 12 52 8 61 10 67 15 73 14 78 19 76 25 69 27 64 24 59 28 52 25 48 27 44 22Z"/>
    <path className="land" d="M58 28 64 31 66 37 63 44 59 51 55 47 57 40 54 35Z"/>
    <path className="land" d="M75 16 82 14 87 17 91 23 87 28 81 26 78 22Z"/>
    <text x="16" y="36">NORTH AMERICA</text><text x="60" y="6">EUROPE</text><text x="87" y="39">ASIA</text>
    {visible.map(l=>{const p=project(l.lat,l.lng),meta=SERIES_BY_ID[l.seriesId];return <g key={l.id} className={selectedId===l.id?"marker selected":"marker"} transform={`translate(${p.x} ${p.y})`} onClick={()=>select(l)}>
      <circle r="1" fill={meta.color}/><circle className="halo" r="2.2"/><text x="1.6" y=".4">{l.name}</text>
    </g>})}
   </svg>
   <div className="controls"><button onClick={()=>setYear(Math.min(2027,year+1))}>+</button><button onClick={()=>setYear(Math.max(2010,year-1))}>−</button><button onClick={()=>{setYear(2010);setSelectedId(null)}}>⌖</button></div>
   <div className="time"><div><span>UNIVERSE TIME</span><b>{year}</b></div><input type="range" min="2010" max="2027" value={year} onChange={e=>setYear(+e.target.value)}/><div className="ticks"><span>2010</span><span>2014</span><span>2018</span><span>2022</span><span>2027</span></div></div>

   <aside className={selected?"sheet open":"sheet"}>
    <div className="grab"/>
    <small>{selected?SERIES_BY_ID[selected.seriesId].name:view.toUpperCase()}</small>
    <h2>{selected?selected.name:view==="map"?"Explore the universe":view==="timeline"?"Universe timeline":view==="people"?"People & connections":"Watch guide"}</h2>
    {selected?<><div className="pills"><i>{selected.type}</i><i>{selected.year}+</i><i>{SERIES_BY_ID[selected.seriesId].short}</i><i>{selected.certainty}</i></div><p>Atlas node. Canon precision will increase as episode-level source metadata is added.</p><button className="primary" onClick={()=>setSelectedId(null)}>Close location</button></>:
    <>
      {view==="map"&&<><div className="chips"><button className={series==="ALL"?"active":""} onClick={()=>setSeries("ALL")}>All</button>{Object.entries(META).map(([k,v])=><button key={k} className={series===k?"active":""} onClick={()=>setSeries(k as SeriesKey)}>{v.name}</button>)}</div><div className="cards">{visible.map(l=><article key={l.id} onClick={()=>select(l)}><small>{SERIES_BY_ID[l.seriesId].short} · {l.year}</small><b>{l.name}</b><span>{l.type} · {l.certainty}</span></article>)}</div></>}
      {view==="timeline"&&<div className="cards">{timeline.map(e=><article key={e.id}><small>{e.year} · {SERIES_BY_ID[e.seriesId].short}</small><b>{e.title}</b><span>{e.certainty}</span></article>)}</div>}
      {view==="people"&&<div className="cards">{atlasData.characters.map(c=><article key={c.id}><small>CHARACTER NODE</small><b>{c.name}</b><span>Cross-series appearances and relationships will connect here.</span></article>)}</div>}
      {view==="guide"&&<div className="cards"><article><small>WATCH ORDER</small><b>Episode-level chronology</b><span>The next major data pass will add the full episode registry and anthology placement.</span></article><article><small>DATA ENGINE</small><b>{atlasData.series.length} series · {atlasData.seasons.length} seasons</b><span>Normalized registries now drive the application foundation.</span></article><article><small>VALIDATION</small><b>{dataErrors.length?"Review data references":"No registry errors detected"}</b><span>{dataErrors.length?dataErrors.join(" · "):"IDs and series references currently pass the initial validator."}</span></article></div>}
    </>}
   </aside>

   <nav>{(["map","timeline","people","guide"] as const).map(v=><button className={view===v?"active":""} key={v} onClick={()=>{setView(v);setSelectedId(null)}}>{v==="map"?"⌘":v==="timeline"?"◷":v==="people"?"♙":"▤"}<small>{v}</small></button>)}</nav>
  </section></main>
 </div>;
}