import {useEffect,useState} from "react";

// Per-entity Fandom galleries (scripts/ingest-fandom-entity-galleries.mjs).
// Served from /data as one JSON per entity kind and fetched on first use, so
// thousands of image references never enter the JS bundle.
export type GalleryKind="characters"|"locations"|"episodes";
export type GalleryImage={src:string;title:string;width:number;height:number};

const FANDOM_IMAGES="https://static.wikia.nocookie.net/walkingdead/images/";
const cache=new Map<GalleryKind,Promise<Record<string,{p:string;w:number;h:number;t:string}[]>>>();

function load(kind:GalleryKind){
 if(!cache.has(kind))cache.set(kind,fetch(`/data/fandom-galleries/${kind}.json`).then(r=>r.ok?r.json():{}).catch(()=>({})));
 return cache.get(kind)!;
}

export async function getFandomGallery(kind:GalleryKind,id:string):Promise<GalleryImage[]>{
 const data=await load(kind);
 return (data[id]||[]).map(x=>({src:FANDOM_IMAGES+x.p.split("/").map(encodeURIComponent).join("/")+"/revision/latest",title:x.t,width:x.w,height:x.h}));
}

export function useFandomGallery(kind:GalleryKind,id:string){
 const [images,setImages]=useState<GalleryImage[]|null>(null);
 useEffect(()=>{
  let active=true;setImages(null);
  void getFandomGallery(kind,id).then(list=>{if(active)setImages(list)});
  return()=>{active=false};
 },[kind,id]);
 return images;
}
