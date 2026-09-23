type AtlasMetric={name:string;value:number;ts:number;details?:Record<string,string|number|boolean|null>};

const TELEMETRY_ENDPOINT="https://qflqfvoxdzkibpzfrwop.supabase.co/functions/v1/atlas-telemetry";
const queue:AtlasMetric[]=[];
let flushTimer:number|undefined;
const sessionId=(()=>{try{return crypto.randomUUID()}catch{return Math.random().toString(36).slice(2)}})();

function enqueue(metric:AtlasMetric){
  if(typeof window==="undefined")return;
  queue.push(metric);
  if(queue.length>=12)void flushAtlasTelemetry();
  if(flushTimer===undefined)flushTimer=window.setTimeout(()=>{flushTimer=undefined;void flushAtlasTelemetry()},15000);
}

export function trackAtlasMetric(name:string,value:number,details?:AtlasMetric["details"]){
  enqueue({name,value,ts:Date.now(),details});
}

export function markAtlas(name:string){if(typeof performance!=="undefined")performance.mark(name)}
export function measureAtlas(name:string,start:string,end?:string){
  if(typeof performance==="undefined")return 0;
  try{
    const m=performance.measure(name,start,end);
    trackAtlasMetric(name,m.duration);
    return m.duration;
  }catch{return 0}
}

export function flushAtlasTelemetry(){
  if(typeof window==="undefined"||!queue.length)return Promise.resolve();
  const batch=queue.splice(0,40);
  const payload=JSON.stringify({
    sessionId,
    viewport:{w:window.innerWidth,h:window.innerHeight,dpr:window.devicePixelRatio||1},
    reducedMotion:window.matchMedia?.("(prefers-reduced-motion: reduce)").matches??false,
    metrics:batch
  });
  try{
    if(navigator.sendBeacon){
      const ok=navigator.sendBeacon(TELEMETRY_ENDPOINT,new Blob([payload],{type:"text/plain;charset=UTF-8"}));
      if(ok)return Promise.resolve();
    }
  }catch{}
  return fetch(TELEMETRY_ENDPOINT,{method:"POST",headers:{"content-type":"application/json"},body:payload,keepalive:true}).then(()=>undefined).catch(()=>undefined);
}

let observed=false;
export function initAtlasPerformance(){
  if(typeof window==="undefined"||observed)return;
  observed=true;
  trackAtlasMetric("page-load",performance.now(),{navigation:performance.getEntriesByType("navigation")[0]?.entryType||"navigation"});
  const observeBuffered=(type:string,handler:(entry:PerformanceEntry)=>void)=>{
    try{
      const po=new PerformanceObserver(list=>list.getEntries().forEach(handler));
      po.observe({type,buffered:true} as PerformanceObserverInit);
      return po;
    }catch{return null}
  };
  observeBuffered("paint",e=>trackAtlasMetric(e.name,e.startTime));
  observeBuffered("largest-contentful-paint",e=>trackAtlasMetric("lcp",e.startTime));
  observeBuffered("layout-shift",e=>{
    const ls=e as PerformanceEntry&{value?:number;hadRecentInput?:boolean};
    if(!ls.hadRecentInput)trackAtlasMetric("cls",ls.value||0);
  });
  // Event Timing is not available in every browser; isolate it so lack of support
  // cannot disable the paint/LCP/CLS observers above.
  observeBuffered("event",e=>{
    const ev=e as PerformanceEntry&{duration?:number;name:string};
    if(ev.duration&&ev.duration>40)trackAtlasMetric("event-latency",ev.duration,{event:ev.name});
  });
  const nav=performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming|undefined;
  if(nav)trackAtlasMetric("dom-content-loaded",nav.domContentLoadedEventEnd);
  const recordLoad=()=>{
    const current=performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming|undefined;
    if(current)trackAtlasMetric("load-complete",current.loadEventEnd||performance.now());
  };
  if(document.readyState==="complete")recordLoad();
  else window.addEventListener("load",recordLoad,{once:true});
  window.addEventListener("pagehide",()=>{void flushAtlasTelemetry()},{once:true});
  document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="hidden")void flushAtlasTelemetry()});
}

export function observeImageLoad(source:string,startedAt:number){
  trackAtlasMetric("image-decode-load",performance.now()-startedAt,{source});
}
export function observeImageError(source:string){
  trackAtlasMetric("image-load-error",1,{source});
}
