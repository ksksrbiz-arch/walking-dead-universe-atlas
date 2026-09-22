import {useCallback, useMemo, useReducer} from "react";

export type AtlasFocusKind="location"|"episode"|"character"|"connection"|"community"|"faction";

export type AtlasFocus={
  kind:AtlasFocusKind;
  id:string;
};

type FocusAction=
  | {type:"SET";focus:AtlasFocus}
  | {type:"CLEAR"}
  | {type:"CLEAR_KIND";kind:AtlasFocusKind};

function focusReducer(state:AtlasFocus|null,action:FocusAction):AtlasFocus|null{
  switch(action.type){
    case "SET": return action.focus;
    case "CLEAR": return null;
    case "CLEAR_KIND": return state?.kind===action.kind?null:state;
    default: return state;
  }
}

export function useAtlasFocusController(){
  const [focus,dispatch]=useReducer(focusReducer,null);

  const setFocus=useCallback((kind:AtlasFocusKind,id:string|null)=>{
    if(id)dispatch({type:"SET",focus:{kind,id}});
    else dispatch({type:"CLEAR_KIND",kind});
  },[]);

  const clearFocus=useCallback(()=>dispatch({type:"CLEAR"}),[]);
  const setSelectedLocation=useCallback((id:string|null)=>setFocus("location",id),[setFocus]);
  const setSelectedEpisode=useCallback((id:string|null)=>setFocus("episode",id),[setFocus]);
  const setSelectedCharacter=useCallback((id:string|null)=>setFocus("character",id),[setFocus]);
  const setSelectedConnection=useCallback((id:string|null)=>setFocus("connection",id),[setFocus]);

  return useMemo(()=>({
    focus,
    clearFocus,
    setFocus,
    setSelectedLocation,
    setSelectedEpisode,
    setSelectedCharacter,
    setSelectedConnection,
    selectedLocation:focus?.kind==="location"?focus.id:null,
    selectedEpisode:focus?.kind==="episode"?focus.id:null,
    selectedCharacter:focus?.kind==="character"?focus.id:null,
    selectedConnection:focus?.kind==="connection"?focus.id:null,
    selectedCommunity:focus?.kind==="community"?focus.id:null,
    selectedFaction:focus?.kind==="faction"?focus.id:null
  }),[focus,clearFocus,setFocus,setSelectedLocation,setSelectedEpisode,setSelectedCharacter,setSelectedConnection]);
}
