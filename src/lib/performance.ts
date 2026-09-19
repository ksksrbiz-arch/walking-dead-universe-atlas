type AtlasMetric={name:string;value:number;ts:number;details?:Record<string,string|number|boolean|null>};

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
      const ok=navigator.sendBeacon("/api/atlas/telemetry",new Blob([payload],{type:"application/json"}));
      if(ok)return Promise.resolve();
    }
  }catch{}
  return fetch("/api/atlas/telemetry",{method:"POST",headers:{"content-type":"application/json"},body:payload,keepalive:true}).then(()=>undefined).catch(()=>undefined);
}

let observed=false;
export function initAtlasPerformance(){
  if(typeof window==="undefined"||observed)return;
  observed=true;
  trackAtlasMetric("page-load",performance.now(),{navigation:performance.getEntriesByType("navigation")[0]?.entryType||"navigation"});
  try{
    const po=new PerformanceObserver(list=>{
      for(const e of list.getEntries()){
        if(e.entryType==="paint")trackAtlasMetric(e.name,e.startTime);
        else if(e.entryType==="largest-contentful-paint")trackAtlasMetric("lcp",e.startTime);
        else if(e.entryType==="layout-shift"){
          const ls=e as PerformanceEntry&{value?:number;hadRecentInput?:boolean};
          if(!ls.hadRecentInput)trackAtlasMetric("cls",ls.value||0);
        }else if(e.entryType==="event"){
          const ev=e as PerformanceEntry&{duration?:number;name:string};
          if(ev.duration&&ev.duration>40)trackAtlasMetric("event-latency",ev.duration,{event:ev.name});
        }
      }
    });
    po.observe({entryTypes:["paint","largest-contentful-paint","layout-shift","event"] as PerformanceObserverInit["entryTypes"]});
  }catch{}
  const nav=performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming|undefined;
  if(nav){
    trackAtlasMetric("dom-content-loaded",nav.domContentLoadedEventEnd);
    trackAtlasMetric("load-complete",nav.loadEventEnd);
  }
  window.addEventListener("pagehide",()=>{void flushAtlasTelemetry()},{once:true});
  document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="hidden")void flushAtlasTelemetry()});
}

export function observeImageLoad(source:string,startedAt:number){
  trackAtlasMetric("image-decode-load",performance.now()-startedAt,{source});
}
export function observeImageError(source:string){
  trackAtlasMetric("image-load-error",1,{source});
}
