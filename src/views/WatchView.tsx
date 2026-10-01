import {useMemo,useRef,useState} from "react";
import type {CSSProperties} from "react";
import Icon from "../components/Icon";
import {AtlasImage,ProgressRing,Section,WatchToggle} from "../components/ui";
import {useAtlas} from "../lib/atlasContext";
import {atlasData} from "../data";
import {buildEpisodeWatchOrder} from "../lib/chronology";
import {episodeById,episodeCode,storyRange} from "../lib/lookup";
import {episodeImage,episodeMediaRecord,seriesKeyArt} from "../lib/atlasHelpers";
import {META,SERIES_KEYS,seriesColor,seriesShort} from "../lib/series";
import {createProgressBackup,parseProgressBackup,MAX_BACKUP_BYTES} from "../lib/progressBackup";

type Filter="todo"|"all"|"done";

export default function WatchView({errors}:{errors:string[]}){
 const {watched,followed,toggleWatched,resetWatched,openEpisode,importProgress}=useAtlas();
 const [backupStatus,setBackupStatus]=useState("");
 const [importing,setImporting]=useState(false);
 const backupInput=useRef<HTMLInputElement>(null);
 const exportBackup=()=>{
  try{
   const blob=new Blob([JSON.stringify(createProgressBackup(watched,followed),null,2)],{type:"application/json"});
   const url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download=`atlas-progress-${new Date().toISOString().slice(0,10)}.json`;document.body.append(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),10000);setBackupStatus("Backup downloaded. Keep it to restore your progress in another browser.");
  }catch{setBackupStatus("The backup could not be downloaded. Please try again.")}
 };
 const readBackup=async(file:File)=>{
  setImporting(true);setBackupStatus("");
  try{
   if(file.size>MAX_BACKUP_BYTES)throw new Error("The backup is too large (maximum 128 KB).");
   const backup=parseProgressBackup(await file.text());
   const newWatched=backup.watched.filter(id=>!watched.has(id)).length,newFollowed=backup.followed.filter(id=>!followed.has(id)).length;
   importProgress(backup);setLastMarked(null);setBackupStatus(`Added ${newWatched} watched episodes and ${newFollowed} followed characters. Existing progress was kept.`);
  }catch(error){setBackupStatus(error instanceof Error?error.message:"The backup could not be imported.")}
  finally{setImporting(false);if(backupInput.current)backupInput.current.value=""}
 };
 const order=useMemo(()=>buildEpisodeWatchOrder(),[]);
 const [filter,setFilter]=useState<Filter>("todo");
 const [series,setSeries]=useState<string|null>(null);
 const [lastMarked,setLastMarked]=useState<string|null>(null);
 const listRef=useRef<HTMLDivElement|null>(null);
 const done=order.filter(e=>watched.has(e.id)).length;
 const next=order.find(e=>!watched.has(e.id)&&(!series||e.seriesId===series));
 const nextEp=next?episodeById.get(next.id) as any:null;
 const bySeries=useMemo(()=>SERIES_KEYS.map(k=>{const all=order.filter(e=>e.seriesId===META[k].id);return {meta:META[k],total:all.length,done:all.filter(e=>watched.has(e.id)).length}}).filter(x=>x.total),[order,watched]);
 const rows=order.filter(e=>(!series||e.seriesId===series)&&(filter==="all"||(filter==="done"?watched.has(e.id):!watched.has(e.id))));
 const markNext=()=>{if(!next)return;toggleWatched(next.id);setLastMarked(next.id)};
 const undo=()=>{if(lastMarked&&watched.has(lastMarked))toggleWatched(lastMarked);setLastMarked(null)};
 return <div className="page watchPage">
  <header className="pageHead"><div><small>Chronological watch order</small><h1>Watch tracker</h1></div></header>
  <div className="watchHero">
   <ProgressRing value={order.length?done/order.length:0} size={92} stroke={8}><b>{order.length?Math.round(done/order.length*100):0}%</b></ProgressRing>
   <div><b>{done} <span>of {order.length}</span></b><small>episodes watched in story order across every series</small>{lastMarked&&<button className="textBtn" onClick={undo}>Undo last<Icon name="back"/></button>}</div>
  </div>

  {nextEp?<div className="upNext" style={{"--c":seriesColor(nextEp.seriesId)} as CSSProperties}>
   <div className="upNextArt"><Icon name="film"/><AtlasImage src={episodeImage(nextEp)||seriesKeyArt(nextEp.seriesId)} width={720} sizes="(max-width: 899px) 100vw, 400px"/></div>
   <div className="upNextBody">
    <small>Up next · #{next!.sequence} · {seriesShort(nextEp.seriesId)} {episodeCode(nextEp)} · {storyRange(nextEp)}</small>
    <b>{nextEp.title}</b>
    <div className="upNextActions"><button className="btn primary" onClick={markNext}><Icon name="check"/>Mark watched</button><button className="btn" onClick={()=>openEpisode(nextEp.id)}>Details<Icon name="chevron"/></button></div>
   </div>
  </div>:<p className="empty celebrate">Every tracked episode{series?" in this series":""} is watched. Survivor status: confirmed.</p>}

  <Section level={2} title="By series">
   <div className="seriesProgress">{bySeries.map(s=><button key={s.meta.id} className={series===s.meta.id?"active":""} aria-pressed={series===s.meta.id} onClick={()=>setSeries(v=>v===s.meta.id?null:s.meta.id)} style={{"--c":s.meta.color} as CSSProperties}>
    <span className="spLabel"><i/>{s.meta.short}</span><span className="spBar"><i style={{width:(s.done/s.total*100)+"%"}}/></span><small>{s.done}/{s.total}</small>
   </button>)}</div>
  </Section>

  <Section level={2} title="Keep your progress" collapsible defaultOpen={false} id="progress-backup">
   <div className="upNextActions"><button className="btn" onClick={exportBackup}>Download backup</button><button className="btn" disabled={importing} onClick={()=>backupInput.current?.click()}>{importing?"Importing…":"Import backup"}</button></div>
   <input ref={backupInput} type="file" accept="application/json,.json" hidden aria-label="Atlas progress backup" onChange={e=>{const file=e.target.files?.[0];if(file)void readBackup(file)}}/>
   <p className="note">Backups include watched episodes and followed characters. Imports add to this browser's progress without removing anything.</p>
   <p role="status" aria-live="polite">{backupStatus}</p>
  </Section>
  <Section level={2} title={series?`${seriesShort(series)} in story order`:"Full story order"} count={rows.length} action={<div className="segmented small" role="group">{(["todo","all","done"] as Filter[]).map(f=><button key={f} className={filter===f?"active":""} aria-pressed={filter===f} onClick={()=>setFilter(f)}>{f==="todo"?"To watch":f==="all"?"All":"Watched"}</button>)}</div>}>
   <div className="stack watchList" ref={listRef}>{rows.map(e=>{const ep=episodeById.get(e.id) as any;return <div key={e.id} className={"row watchRow"+(watched.has(e.id)?" isWatched":"")} style={{"--c":seriesColor(e.seriesId)} as CSSProperties}>
    <span className="seq">{e.sequence}</span>
    <button className="rowMain" onClick={()=>openEpisode(e.id)}><span className="rowThumb small"><Icon name="film"/><AtlasImage src={episodeImage(ep)} width={160} sizes="56px"/></span><span className="rowText"><small><span className="dot"/>{seriesShort(e.seriesId)} · {episodeCode(ep)} · {storyRange(ep)}{e.chronologyStatus!=="anchored"?" · "+e.chronologyStatus.replace("-"," "):""}</small><b>{e.title}</b></span></button>
    <WatchToggle id={e.id} title={e.title} compact/>
   </div>})}
   {!rows.length&&<p className="empty">Nothing here with this filter.</p>}</div>
  </Section>
  {done>0&&<button className="textBtn danger" onClick={()=>{if(window.confirm("Reset all watch progress on this device?"))resetWatched()}}>Reset progress</button>}
  <AboutAtlas errors={errors}/>
 </div>;
}

function AboutAtlas({errors}:{errors:string[]}){
 const episodes=atlasData.episodes as any[];
 const media=useMemo(()=>{
  const rows=SERIES_KEYS.map(k=>{const eps=episodes.filter(e=>e.seriesId===META[k].id);const available=eps.filter(e=>episodeMediaRecord(e.id)?.image).length;const verified=eps.filter(e=>episodeMediaRecord(e.id)?.status==="verified").length;return {meta:META[k],total:eps.length,available,verified}}).filter(r=>r.total);
  return {rows,available:rows.reduce((n,r)=>n+r.available,0),verified:rows.reduce((n,r)=>n+r.verified,0)};
 },[episodes]);
 return <Section level={2} title="About this atlas" collapsible defaultOpen={false} id="about">
  <div className="stats">
   <div><b>{atlasData.series.length}</b><small>Series</small></div>
   <div><b>{episodes.length}</b><small>Episodes</small></div>
   <div><b>{atlasData.locations.length}</b><small>Places</small></div>
   <div><b>{atlasData.characters.length}</b><small>Characters</small></div>
  </div>
  <div className={"healthCard"+(errors.length?" warn":"")}><Icon name={errors.length?"info":"check"}/><span><b>{errors.length?"References need review":"Registry healthy"}</b><small>{errors.length?errors.slice(0,4).join(" · ")+(errors.length>4?` · +${errors.length-4} more`:""):"Every core id and relationship passes the atlas validator."}</small></span></div>
  <h3 className="subhead">How to read it</h3>
  <ul className="bullets">
   <li><b>Story year</b> is when an episode happens in-universe; air dates are tracked separately.</li>
   <li><b>Confirmed</b>, <b>source-derived</b> and <b>approximate</b> labels are kept — nothing is flattened into false precision.</li>
   <li>Places with unknown coordinates are listed but never guessed onto the map.</li>
   <li>Watch progress is stored only in this browser.</li>
  </ul>
  <details className="disclosure"><summary>Episode media coverage · {media.available}/{episodes.length}</summary>
   <div className="stack">{media.rows.map(r=><div key={r.meta.id} className="row staticRow" style={{"--c":r.meta.color} as CSSProperties}><span className="rowText"><small><span className="dot"/>{r.meta.short}</small><b>{r.available}/{r.total} with media</b><em>{r.verified} verified episode images</em></span></div>)}</div>
  </details>
  <details className="disclosure"><summary>Sources ({atlasData.sources.length})</summary>
   <div className="stack">{(atlasData.sources as any[]).map(s=><a key={s.id} className="row sourceRow" href={s.url} target="_blank" rel="noreferrer"><span className="rowText"><small>{String(s.type||"source").replaceAll("-"," ")}</small><b>{s.title}</b>{s.note&&<em>{s.note}</em>}</span><Icon name="external" className="rowChevron"/></a>)}</div>
  </details>
  <p className="note"><Icon name="info"/><span>A fan reference project. Not affiliated with AMC Networks or the creators of The Walking Dead.</span></p>
 </Section>;
}
