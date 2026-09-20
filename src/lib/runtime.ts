export type RuntimeRelationship={kind:string;id:string;episodeIds:string[]};

export async function getRuntimeMeta(){
  try{
    const response=await fetch("/api/atlas/runtime?resource=meta",{cache:"no-store"});
    if(!response.ok)return null;
    return await response.json();
  }catch{return null}
}

export async function getRuntimeRelationships(kind:string,id:string):Promise<RuntimeRelationship|null>{
  try{
    const response=await fetch("/api/atlas/runtime?resource=relationships&kind="+encodeURIComponent(kind)+"&id="+encodeURIComponent(id),{cache:"no-store"});
    if(!response.ok)return null;
    return await response.json();
  }catch{return null}
}
