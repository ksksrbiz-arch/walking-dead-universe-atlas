import type {LucideIcon,LucideProps} from "lucide-react";
import {Building2,Castle,Factory,Fence,Film,Flag,GitCompareArrows,Globe,Hospital,House,Landmark,Link2,LockKeyhole,Map as MapIcon,MapPin,MonitorPlay,Ship,Signpost,Sparkles,TentTree,Tractor,User,Users,Waves} from "lucide-react";

// Entity + location-type glyphs, drawn from the same lucide family as the UI
// icons (src/components/Icon.tsx) so markers, rows and graph nodes match.
export type AtlasIconName=
  | "city" | "community" | "facility" | "hospital" | "farm" | "prison" | "boat"
  | "route" | "region" | "residence" | "ranch" | "dam" | "territory"
  | "country" | "landmark" | "stronghold" | "character" | "episode"
  | "faction" | "series" | "connection" | "community-link" | "cross-series"
  | "lore" | "character-link" | "location-link";

const ICONS:Record<AtlasIconName,LucideIcon>={
 city:Building2,community:Fence,facility:Factory,hospital:Hospital,farm:Tractor,prison:LockKeyhole,boat:Ship,
 route:Signpost,region:MapIcon,residence:House,ranch:TentTree,dam:Waves,territory:Flag,country:Globe,
 landmark:Landmark,stronghold:Castle,character:User,episode:Film,faction:Flag,series:MonitorPlay,
 connection:Link2,"community-link":Users,"cross-series":GitCompareArrows,lore:Sparkles,"character-link":Users,"location-link":MapPin
};

export default function AtlasIcon({name,className,...props}:{name:AtlasIconName;className?:string}&LucideProps){
 const Glyph=ICONS[name]??MapPin;
 return <Glyph className={className} aria-hidden="true" focusable="false" strokeWidth={1.8} absoluteStrokeWidth={false} {...props}/>;
}

// For drawing inside another <svg> (map markers): a nested svg positioned in
// the parent's coordinate space via x/y/width/height.
export function AtlasIconGlyph({name,size=24,x=0,y=0,strokeWidth=2}:{name:AtlasIconName;size?:number;x?:number;y?:number;strokeWidth?:number}){
 const Glyph=ICONS[name]??MapPin;
 return <Glyph x={x} y={y} width={size} height={size} strokeWidth={strokeWidth} aria-hidden="true" focusable="false"/>;
}
