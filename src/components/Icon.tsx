import type {LucideIcon} from "lucide-react";
import {ArrowRight,Check,ChevronDown,ChevronLeft,ChevronRight,ChartGantt,Clock,Copy,Expand,ExternalLink,Eye,EyeOff,Film,Flag,Footprints,GitCompareArrows,Images,Info,Layers,Link2,LocateFixed,MapPin,Map as MapIcon,Minus,MonitorPlay,Navigation,Pause,Play,Plus,Route,Search,Share2,Skull,SkipBack,SkipForward,Sparkles,Undo2,User,Users,X} from "lucide-react";

// App-wide UI icons (lucide). Names are the app's own vocabulary so call sites
// stay stable if the underlying family ever changes.
const ICONS={
 map:MapIcon,timeline:ChartGantt,clock:Clock,people:Users,person:User,watch:MonitorPlay,plus:Plus,minus:Minus,
 locate:LocateFixed,search:Search,close:X,chevron:ChevronRight,chevronDown:ChevronDown,back:ChevronLeft,
 layers:Layers,play:Play,pause:Pause,arrow:ArrowRight,external:ExternalLink,pin:MapPin,check:Check,link:Link2,
 film:Film,info:Info,route:Route,spark:Sparkles,flag:Flag,eye:Eye,eyeOff:EyeOff,expand:Expand,images:Images,
 share:Share2,skull:Skull,footprints:Footprints,compare:GitCompareArrows,undo:Undo2,copy:Copy,
 prev:SkipBack,next:SkipForward,navigate:Navigation
} satisfies Record<string,LucideIcon>;
export type IconName=keyof typeof ICONS;

export default function Icon({name,className,size}:{name:IconName;className?:string;size?:number}){
 const Glyph=ICONS[name];
 return <Glyph className={"icon "+(className||"")} width={size} height={size} strokeWidth={1.8} aria-hidden="true" focusable="false"/>;
}
