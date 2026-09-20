import {Component} from "react";
import type {ReactNode} from "react";

type Props={children:ReactNode;onReset?:()=>void};
type State={error:Error|null};

// A render error anywhere below this boundary used to unmount the whole app to a
// blank screen (e.g. a missing import in a detail view). Contain it to the panel
// instead so the rest of the atlas (map, nav, search) stays usable.
export default class ErrorBoundary extends Component<Props,State>{
 state:State={error:null};
 static getDerivedStateFromError(error:Error){return {error}}
 componentDidCatch(error:Error,info:{componentStack?:string|null}){
  console.error("Atlas view crashed:",error,info.componentStack);
 }
 render(){
  if(this.state.error){
   return <div className="contentScroll">
    <div className="errorFallback">
     <small>SOMETHING WENT WRONG</small>
     <b>This view hit an unexpected error.</b>
     <p>{this.state.error.message}</p>
     <button onClick={()=>{this.setState({error:null});this.props.onReset?.()}}>Go back</button>
    </div>
   </div>;
  }
  return this.props.children;
 }
}
