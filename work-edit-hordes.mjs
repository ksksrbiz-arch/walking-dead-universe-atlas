import fs from 'node:fs';
const p='src/App.tsx';let s=fs.readFileSync(p,'utf8');
s=s.replace('import HordeLayer from "./components/HordeLayer";','import HordeLayer from "./components/HordeLayer";\nimport {hordes,availablePhases,hordeLocation,phaseYear} from "./lib/hordes";');
s=s.replace('const [hordeSelected,setHordeSelected]=useState(false);','const [hordeSelected,setHordeSelected]=useState(false);\n const [hordeId,setHordeId]=useState(hordes[0].id);\n const [hordePhase,setHordePhase]=useState(0);');
s=s.replace('const {watched,toggleWatched,resetWatched}=useWatchProgress();','const {watched,toggleWatched,resetWatched}=useWatchProgress();\n const activeHorde=hordes.find(h=>h.id===hordeId)!;\n const hordeAvailable=availablePhases(activeHorde,year,series==="ALL"?undefined:META[series].id,spoilerSafe?watched:undefined);\n const hordeVisible=new Set(hordeAvailable.map(p=>p.index));\n const effectiveHordePhase=hordeVisible.has(hordePhase)?hordePhase:(hordeAvailable[0]?.index??-1);');
s=s.replace('kind:"location"|"cluster"','kind:"location"|"cluster"|"horde"');
s=s.replace('[data-location-id],[data-cluster-ids]','[data-horde-id],[data-location-id],[data-cluster-ids]');
s=s.replace('tapTarget.current=hit?(hit.getAttribute','tapTarget.current=hit?.hasAttribute("data-horde-id")?{kind:"horde",value:hit.getAttribute("data-horde-id")!}:hit?(hit.getAttribute');
s=s.replace('if(tap.kind==="location")openLocation(tap.value);','if(tap.kind==="horde")setHordeSelected(true);\n    else if(tap.kind==="location")openLocation(tap.value);');
s=s.replace('<defs>','<defs>\n      <clipPath id="horde-land"><path d={worldLandD}/></clipPath>');
s=s.replace('      <HordeLayer enabled={hordeEnabled} year={year} zoom={zoom} project={project} onSelect={()=>setHordeSelected(true)}/>','');
s=s.replace('{journeyActive&&<JourneyAvatars journeys={journeys} positions={journeyPositions} project={project} zoom={zoom}/>}','{journeyActive&&<JourneyAvatars journeys={journeys} positions={journeyPositions} project={project} zoom={zoom}/>}\n      <HordeLayer horde={hordeEnabled?activeHorde:null} phaseIndex={effectiveHordePhase} visible={hordeVisible} zoom={zoom} project={project} onSelect={()=>setHordeSelected(true)}/>');
s=s.replace('if(hordeEnabled)setHordeSelected(false)','setHordeSelected(!hordeEnabled)');s=s.replace('Living World · simulated horde','Walker herds');
const start=s.indexOf('    {hordeSelected&&hordeEnabled&&');const end=s.indexOf('\n   </div>',start);
s=s.slice(0,start)+s.slice(end);
const panel=`
   {hordeEnabled&&<button className="hordeReopen" onClick={()=>setHordeSelected(v=>!v)}>Walker herds</button>}
   {hordeSelected&&hordeEnabled&&<section className="popover hordeDossier" data-map-chrome={isPanel?"right":"bottom"} aria-label="Walker herd events">
    <header><b>Walker herds</b><button className="iconBtn ghost" onClick={()=>setHordeSelected(false)} aria-label="Close herd events"><Icon name="close"/></button></header>
    <div className="stack">
     <label>Herd<select value={hordeId} onChange={e=>{setHordeId(e.target.value);setHordePhase(0)}}>{hordes.map(h=><option key={h.id} value={h.id}>{h.name}</option>)}</select></label>
     <p>{activeHorde.summary}</p>
     {hordeAvailable.length===0?<><p>No recorded events for this year, series, or watched episodes.</p><button onClick={()=>{setSeries("TWD");setYear(phaseYear(activeHorde.phases[0])??year)}}>Go to recorded year</button></>:<>
      <div className="hordeSteps">{hordeAvailable.map(({phase,index})=><button key={phase.id} aria-pressed={effectiveHordePhase===index} onClick={()=>{setHordePhase(index);const loc=hordeLocation(phase);if(loc)focusMapOn([loc.id],"fit")}}>{phase.label}</button>)}</div>
      <b>{activeHorde.phases[effectiveHordePhase].label}</b><p>{activeHorde.phases[effectiveHordePhase].description}</p>
      <small>Drawn by: {activeHorde.phases[effectiveHordePhase].driver} · {activeHorde.phases[effectiveHordePhase].status}</small>
      {!hordeLocation(activeHorde.phases[effectiveHordePhase])&&<p>Exact location unknown — no map pin.</p>}
      <a href={activeHorde.sources[activeHorde.phases[effectiveHordePhase].sourceIndex].url} target="_blank" rel="noreferrer">Read event evidence on Fandom ↗</a>
     </>}
     <small>Episode order, not continuous tracking. Existing map locations are approximate. Dashed lines connect recorded places; the precise route is unknown. Walker symbols do not represent population.</small>
    </div>
   </section>}
`;
s=s.replace('   {isPanel&&<div className={"dock"',panel+'   {isPanel&&<div className={"dock"');fs.writeFileSync(p,s);
