import {createContext,useContext} from "react";

// Navigation + watch-tracking actions shared by every view. Detail panels used
// to receive seven identical callback props each; views now read them here.
export type AtlasActions={
 openEpisode:(id:string)=>void;
 openLocation:(id:string)=>void;
 openCharacter:(id:string)=>void;
 openConnection:(id:string)=>void;
 openCommunity:(id:string)=>void;
 openFaction:(id:string)=>void;
 showEpisodeOnMap:(id:string)=>void;
 showLocationOnMap:(id:string)=>void;
 showCharacterJourney:(id:string)=>void;
 startJourney:(ids:string[])=>void;
 showConnectionOnMap:(id:string)=>void;
 setYear:(year:number)=>void;
 year:number;
 watched:Set<string>;
 toggleWatched:(id:string)=>void;
 resetWatched:()=>void;
};

export const AtlasContext=createContext<AtlasActions|null>(null);
export function useAtlas(){
 const value=useContext(AtlasContext);
 if(!value)throw new Error("useAtlas must be used inside AtlasContext");
 return value;
}
