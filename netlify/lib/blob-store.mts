import {getDeployStore,getStore} from "@netlify/blobs";

export function getAtlasStore(name:string){
  return Netlify.context?.deploy?.context==="production" ? getStore(name) : getDeployStore(name);
}
