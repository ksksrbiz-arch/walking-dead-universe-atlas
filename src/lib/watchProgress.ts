import {useCallback,useEffect,useState} from "react";

const STORAGE_KEY="twdu-atlas-watched-episodes";

function readStoredWatched():Set<string>{
 try{
  const raw=localStorage.getItem(STORAGE_KEY);
  if(!raw)return new Set();
  const ids=JSON.parse(raw);
  return Array.isArray(ids)?new Set(ids):new Set();
 }catch{
  return new Set();
 }
}

// Watch progress is a per-viewer convenience, not atlas data, so it lives in
// localStorage rather than anywhere near atlasData — it never needs to sync
// across devices or survive a cleared browser.
export function useWatchProgress(){
 const [watched,setWatched]=useState<Set<string>>(()=>readStoredWatched());

 useEffect(()=>{
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify([...watched]))}catch{}
 },[watched]);

 const toggleWatched=useCallback((id:string)=>{
  setWatched(prev=>{
   const next=new Set(prev);
   if(next.has(id))next.delete(id);else next.add(id);
   return next;
  });
 },[]);

 const resetWatched=useCallback(()=>setWatched(new Set()),[]);

 return {watched,toggleWatched,resetWatched};
}
