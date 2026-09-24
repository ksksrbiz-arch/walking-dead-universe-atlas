import {useEffect,useRef,useState} from "react";
import type {PointerEvent as ReactPointerEvent} from "react";
import Icon from "./Icon";
import {atlasImageSrcSet,atlasImageUrl,atlasImagePlaceholder,mediaCredit,onAtlasImageError} from "../lib/media";

export type LightboxItem={src:string;title:string;meta?:string;page?:string};

// Fullscreen swipeable viewer for gallery images. Swipe / arrow keys move,
// Escape or the close button exits, focus returns to the opener.
export default function Lightbox({items,start,onClose}:{items:LightboxItem[];start:number;onClose:()=>void}){
 const [index,setIndex]=useState(start);
 const [loadedSrc,setLoadedSrc]=useState<string|null>(null);
 const closeRef=useRef<HTMLButtonElement|null>(null);
 const opener=useRef<HTMLElement|null>(typeof document!=="undefined"?document.activeElement as HTMLElement:null);
 const drag=useRef<{x:number;y:number}|null>(null);
 const item=items[index];
 const go=(d:number)=>setIndex(i=>(i+d+items.length)%items.length);
 useEffect(()=>{closeRef.current?.focus();const prev=opener.current;const o=document.body.style.overflow;document.body.style.overflow="hidden";return()=>{document.body.style.overflow=o;prev?.focus?.()}},[]);
 useEffect(()=>{
  // Preload neighbours so swiping feels instant.
  for(const d of [1,-1]){const n=items[(index+d+items.length)%items.length];if(n){const img=new Image();img.src=atlasImageUrl(n.src,1600)}}
 },[index,items]);
 const onKey=(e:React.KeyboardEvent)=>{
  if(e.key==="Escape"){e.stopPropagation();onClose()}
  else if(e.key==="ArrowRight"){e.preventDefault();go(1)}
  else if(e.key==="ArrowLeft"){e.preventDefault();go(-1)}
  else if(e.key==="Tab"){e.preventDefault();closeRef.current?.focus()}
 };
 const down=(e:ReactPointerEvent)=>{drag.current={x:e.clientX,y:e.clientY}};
 const up=(e:ReactPointerEvent)=>{const d=drag.current;drag.current=null;if(!d)return;const dx=e.clientX-d.x,dy=e.clientY-d.y;if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy))go(dx<0?1:-1);else if(dy>90)onClose()};
 if(!item)return null;
 const loaded=loadedSrc===item.src;
 const credit=mediaCredit(item.src,item.page);
 const lqip=atlasImagePlaceholder(item.src);
 return <div className="lightbox" role="dialog" aria-modal="true" aria-label={`Image ${index+1} of ${items.length}: ${item.title}`} onKeyDown={onKey}>
  <div className="lightboxStage" onPointerDown={down} onPointerUp={up} onPointerCancel={()=>{drag.current=null}}>
   {lqip&&!loaded&&<img className="lightboxLqip" src={lqip} alt="" aria-hidden="true"/>}
   <img key={item.src} className={"lightboxImg"+(loaded?" isLoaded":"")} src={atlasImageUrl(item.src,1600)} srcSet={atlasImageSrcSet(item.src,[800,1200,1600,2200])} sizes="100vw" alt={item.title} ref={img=>{if(img?.complete&&img.naturalWidth>0&&loadedSrc!==item.src)setLoadedSrc(item.src)}} onLoad={()=>setLoadedSrc(item.src)} onError={e=>onAtlasImageError(e,item.src)} draggable={false}/>
  </div>
  <header className="lightboxBar">
   <span className="lightboxCount">{index+1} / {items.length}</span>
   <button ref={closeRef} className="iconBtn ghost" onClick={onClose} aria-label="Close viewer"><Icon name="close"/></button>
  </header>
  {items.length>1&&<>
   <button className="lightboxNav prev" onClick={()=>go(-1)} aria-label="Previous image"><Icon name="back"/></button>
   <button className="lightboxNav next" onClick={()=>go(1)} aria-label="Next image"><Icon name="chevron"/></button>
  </>}
  <footer className="lightboxCaption">
   <b>{item.title}</b>{item.meta&&<small>{item.meta}</small>}
   {credit&&(credit.href?<a href={credit.href} target="_blank" rel="noreferrer">Image: {credit.label}<Icon name="external"/></a>:<span>Image: {credit.label}</span>)}
  </footer>
 </div>;
}
