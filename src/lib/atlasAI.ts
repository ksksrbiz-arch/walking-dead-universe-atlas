export type AtlasCitation={id:string;kind:"character"|"location"|"episode"|"community"|"faction"|"connection";title:string;sources:{title:string;url?:string}[]};
export type AtlasAnswer={ok:true;answer:string;citations:AtlasCitation[];model:string|null};
export const ATLAS_AI_ENDPOINT=(import.meta.env.VITE_ATLAS_AI_ENDPOINT||"https://walking-dead-atlas-ai.skdev-371.workers.dev").replace(/\/$/,"");
export async function askAtlas(question:string,signal:AbortSignal):Promise<AtlasAnswer>{
 const response=await fetch(ATLAS_AI_ENDPOINT+"/ask",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({question}),signal});
 const result=await response.json();
 if(!response.ok||!result.ok)throw new Error(result.error||"Atlas AI is unavailable. Ordinary search still works.");
 if(typeof result.answer!=="string"||!Array.isArray(result.citations))throw new Error("Atlas AI returned an invalid answer.");
 return result;
}


