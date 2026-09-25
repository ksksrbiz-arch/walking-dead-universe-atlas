import {useCallback,useEffect,useState} from "react";

const STORAGE_KEY="twdu-atlas-followed-characters";

function readStoredFollowed():Set<string>{
 try{
  const raw=localStorage.getItem(STORAGE_KEY);
  if(!raw)return new Set();
  const ids=JSON.parse(raw);
  return Array.isArray(ids)?new Set(ids):new Set();
 }catch{
  return new Set();
 }
}

// Followed characters are a per-viewer convenience, not atlas data, so this
// mirrors useWatchProgress: localStorage only, never synced or atlas-backed.
export function useFollowedCharacters(){
 const [followed,setFollowed]=useState<Set<string>>(()=>readStoredFollowed());

 useEffect(()=>{
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify([...followed]))}catch{}
 },[followed]);

 const toggleFollowed=useCallback((id:string)=>{
  setFollowed(prev=>{
   const next=new Set(prev);
   if(next.has(id))next.delete(id);else next.add(id);
   return next;
  });
 },[]);

 return {followed,toggleFollowed};
}
