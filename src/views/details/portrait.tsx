import {AtlasImage} from "../../components/ui";
import {characterById} from "../../lib/lookup";
import {characterImage} from "../../lib/atlasHelpers";

// Split out of shared.tsx: this is the only piece of that module the
// always-loaded map/journey/people/search surfaces need, and shared.tsx
// pulls in the 455 KB fandom-canonical.json plus Lightbox/EntityGraphView —
// none of which those surfaces use — as soon as anything imports from it.
export function PortraitImage({id,name,size="md"}:{id:string;name:string;size?:"sm"|"md"|"lg"}){
 const image=characterImage({id,name,seriesIds:(characterById.get(id) as any)?.seriesIds});
 const initials=name.split(/\s+/).filter(Boolean).slice(0,2).map(v=>v[0]).join("").toUpperCase();
 return <span className={"portrait portrait-"+size}><span className="portraitInitials">{initials}</span><AtlasImage src={image} width={320} sizes="96px"/></span>;
}
