import localMedia from "../generated/media-local.json";

const IMAGE_CDN="/.netlify/images";
const LOCAL_MEDIA=localMedia as Record<string,string>;

export function atlasImageUrl(source:string|undefined|null,width=1200,quality=78){
  if(!source)return "";
  if(source.startsWith("/"))return source;
  const local=LOCAL_MEDIA[source];
  if(local)return local;
  const url=new URL(IMAGE_CDN,window.location.origin);
  url.searchParams.set("url",source);
  url.searchParams.set("w",String(Math.max(64,Math.round(width))));
  url.searchParams.set("q",String(Math.max(40,Math.min(90,Math.round(quality)))));
  return url.pathname+url.search;
}

export function atlasImageSrcSet(source:string|undefined|null,widths=[480,768,1200]){
  if(!source)return undefined;
  const local=LOCAL_MEDIA[source];
  if(local)return widths.map(w=>`${local} ${w}w`).join(", ");
  return widths.map(w=>`${atlasImageUrl(source,w)} ${w}w`).join(", ");
}
