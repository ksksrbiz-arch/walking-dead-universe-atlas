import {episodeById,characterById} from "./lookup";
export const MAX_BACKUP_BYTES=128*1024;
export type ProgressBackup={format:"twdu-atlas-progress";version:1;exportedAt:string;watched:string[];followed:string[]};
function ids(value:unknown,registry:Map<string,unknown>,label:string):string[]{
 if(!Array.isArray(value)||value.length>4096||value.some(id=>typeof id!=="string"||!registry.has(id)))throw new Error(`The backup contains invalid ${label}.`);
 return [...new Set(value)];
}
/** Validate the complete document before either progress collection changes. */
export function parseProgressBackup(text:string):ProgressBackup{
 if(new TextEncoder().encode(text).byteLength>MAX_BACKUP_BYTES)throw new Error("The backup is too large (maximum 128 KB).");
 let value;try{value=JSON.parse(text)}catch{throw new Error("Choose a valid Atlas JSON backup.")}
 if(!value||value.format!=="twdu-atlas-progress"||value.version!==1||typeof value.exportedAt!=="string"||!Number.isFinite(Date.parse(value.exportedAt)))throw new Error("This file is not a supported Atlas progress backup.");
 return {format:value.format,version:1,exportedAt:value.exportedAt,watched:ids(value.watched,episodeById,"episode IDs"),followed:ids(value.followed,characterById,"character IDs")};
}
export function createProgressBackup(watched:Set<string>,followed:Set<string>):ProgressBackup{
 return {format:"twdu-atlas-progress",version:1,exportedAt:new Date().toISOString(),watched:[...watched].filter(id=>episodeById.has(id)).sort(),followed:[...followed].filter(id=>characterById.has(id)).sort()};
}
