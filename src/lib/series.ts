import type {SeriesKey} from "../data";

// Single source of truth for series presentation metadata. App.tsx and the
// timeline dock previously each carried their own copy of this table.
export type SeriesMeta={key:SeriesKey;id:string;name:string;color:string;short:string};

export const META:Record<SeriesKey,SeriesMeta>={
 TWD:{key:"TWD",id:"twd",name:"The Walking Dead",color:"#e9e6dc",short:"TWD"},
 FTWD:{key:"FTWD",id:"ftwd",name:"Fear the Walking Dead",color:"#e0ad4f",short:"FEAR"},
 TALES:{key:"TALES",id:"tales",name:"Tales of the Walking Dead",color:"#e0876d",short:"TALES"},
 WB:{key:"WB",id:"wb",name:"World Beyond",color:"#6fb2d4",short:"WORLD BEYOND"},
 OWL:{key:"OWL",id:"owl",name:"The Ones Who Live",color:"#e2706c",short:"TOWL"},
 DARYL:{key:"DARYL",id:"daryl",name:"Daryl Dixon",color:"#a891dc",short:"DARYL"},
 DEAD:{key:"DEAD",id:"dead",name:"Dead City",color:"#5fc2a7",short:"DEAD CITY"},
 MORE_TALES:{key:"MORE_TALES",id:"more-tales",name:"More Tales from the TWDU",color:"#d677a9",short:"MORE TALES"}
};
export const SERIES_KEYS=Object.keys(META) as SeriesKey[];
export const SERIES_BY_ID:Record<string,SeriesMeta>=Object.fromEntries(Object.values(META).map(x=>[x.id,x]));
export const FALLBACK_COLOR="#9aa6a1";
export const seriesColor=(seriesId?:string|null)=>seriesId?SERIES_BY_ID[seriesId]?.color??FALLBACK_COLOR:FALLBACK_COLOR;
export const seriesShort=(seriesId?:string|null)=>seriesId?SERIES_BY_ID[seriesId]?.short??seriesId.toUpperCase():"";
