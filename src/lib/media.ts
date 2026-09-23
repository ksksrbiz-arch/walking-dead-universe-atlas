import localMedia from "../generated/media-local.json";

const MEDIA_PROXY="https://qflqfvoxdzkibpzfrwop.supabase.co/functions/v1/atlas-media";
const LOCAL_MEDIA=localMedia as Record<string,string>;

function isFandomImage(source:string){
  return /^https?:\/\/(?:static\.wikia\.nocookie\.net|vignette\.wikia\.nocookie\.net)\//i.test(source);
}

export function atlasImageUrl(source:string|undefined|null,width=1200,quality=78){
  if(!source)return "";
  if(source.startsWith("/"))return source;
  const local=LOCAL_MEDIA[source];
  if(local)return local;
  if(isFandomImage(source)||/^https?:\/\/(?:images|dimages)\.cds\.amcn\.com\//i.test(source)){
    const url=new URL(MEDIA_PROXY);
    url.searchParams.set("url",source);
    return url.pathname+url.search;
  }
  return source;
}

export function atlasImageSrcSet(source:string|undefined|null,widths=[480,768,1200]){
  if(!source)return undefined;
  const local=LOCAL_MEDIA[source];
  if(local)return widths.map(w=>`${local} ${w}w`).join(", ");
  return undefined;
}
