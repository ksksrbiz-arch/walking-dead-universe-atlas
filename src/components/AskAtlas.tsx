import {useEffect,useRef,useState} from "react";
import {askAtlas} from "../lib/atlasAI";
import type {AtlasAnswer,AtlasCitation} from "../lib/atlasAI";

export default function AskAtlas({question,onPick}:{question:string;onPick:(kind:AtlasCitation["kind"],id:string)=>void}){
 const [answer,setAnswer]=useState<AtlasAnswer|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const active=useRef<AbortController|null>(null);
 const generation=useRef(0);
 useEffect(()=>{
  generation.current++;
  active.current?.abort();setAnswer(null);setError("");setBusy(false);
  return()=>{generation.current++;active.current?.abort()};
 },[question]);
 async function ask(){
  active.current?.abort();
  const controller=new AbortController();active.current=controller;
  const current=++generation.current;
  setBusy(true);setError("");setAnswer(null);
  const timeout=window.setTimeout(()=>controller.abort("timeout"),25000);
  try{
   const result=await askAtlas(question.trim(),controller.signal);
   if(generation.current===current)setAnswer(result);
  }catch(error){
   if(generation.current===current)setError(controller.signal.aborted?"Atlas AI took too long. Try again; ordinary search still works.":error instanceof Error?error.message:"Atlas AI is unavailable.");
  }finally{
   window.clearTimeout(timeout);
   if(generation.current===current)setBusy(false);
  }
 }
 return <section className="atlasAI" aria-labelledby="atlas-ai-title" aria-busy={busy}>
  <div className="atlasAIHead">
   <h2 className="subhead" id="atlas-ai-title">Ask Atlas</h2>
   <button className="btn primary" type="button" disabled={busy||question.trim().length<3} onClick={ask}>{busy?"Looking it up…":"Ask Atlas"}</button>
  </div>
  {error&&<p className="atlasAIError" role="alert">{error}</p>}
  <div aria-live="polite">
   {answer&&<>
    <p className="atlasAIAnswer">{answer.answer}</p>
    {answer.citations.length>0&&<>
     <h3 className="subhead">Supporting records</h3>
     <div className="chipList">{answer.citations.map(c=><button className="linkChip" key={c.kind+c.id} onClick={()=>onPick(c.kind,c.id)}>{c.title}</button>)}</div>
    </>}
   </>}
  </div>
  <p className="note">AI answers use Atlas records and may include spoilers. Check the supporting records for sources and uncertainty.</p>
 </section>;
}


