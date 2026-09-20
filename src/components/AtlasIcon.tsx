import type {ReactNode,SVGProps} from "react";

export type AtlasIconName =
  | "city" | "community" | "facility" | "hospital" | "farm" | "prison"
  | "route" | "region" | "residence" | "ranch" | "dam" | "territory"
  | "country" | "landmark" | "stronghold" | "character" | "episode"
  | "faction" | "series" | "connection" | "community-link" | "cross-series"
  | "lore" | "character-link" | "location-link";

const paths:Record<AtlasIconName,ReactNode>={
 city:<><path d="M4 20V9l4-2v13M8 20V5l4-2v17M12 20V8l4-2v14M16 20V11l4-2v11"/><path d="M6 12h.01M6 16h.01M10 9h.01M10 13h.01M14 12h.01M18 15h.01"/></>,
 community:<><path d="M5 20v-7l7-5 7 5v7H5Z"/><path d="M9 20v-4h6v4M3 12l9-8 9 8"/><path d="M12 8v4M10 10h4"/></>,
 facility:<><path d="M4 20V7h16v13M8 7V4h8v3M8 11h2M14 11h2M8 15h2M14 15h2"/></>,\n boat:<><path d="M4 14h16l-2 5H6l-2-5Z"/><path d="M8 14V7h6l3 7M8 18c-1.5 1-3 1-4.5 0M16 18c1.5 1 3 1 4.5 0"/></>,
 hospital:<><path d="M5 20V6h14v14H5Z"/><path d="M10 9h4M12 7v4M9 14h6M9 17h6"/></>,
 farm:<><path d="M4 20h16M6 20v-7l6-4 6 4v7M3 13l9-7 9 7M9 20v-4h6v4"/></>,
 prison:<><path d="M5 20V5h14v15M8 5v15M12 5v15M16 5v15"/><path d="M5 9h14M5 15h14"/></>,
 route:<><path d="M4 19c4-7 5-11 16-14"/><path d="M7 19h-3v-3M17 5h3v3"/></>,
 region:<><path d="m4 7 4-2 4 2 4-2 4 2v10l-4-2-4 2-4-2-4 2Z"/><path d="M8 5v10M12 7v10M16 5v10"/></>,
 residence:<><path d="m3 11 9-7 9 7v9H3v-9Z"/><path d="M9 20v-5h6v5"/></>,
 ranch:<><path d="M4 20V9l8-5 8 5v11"/><path d="M4 13h16M8 20v-5M16 20v-5"/></>,
 dam:<><path d="M4 20h16M6 20V8h12v12M3 12h18"/><path d="M9 8v12M15 8v12"/></>,
 territory:<><path d="m12 3 8 4v10l-8 4-8-4V7l8-4Z"/><path d="m4 7 8 4 8-4M12 11v10"/></>,
 country:<><path d="m4 5 5-2 6 2 5-2v16l-5 2-6-2-5 2V5Z"/><path d="M9 3v16M15 5v16"/></>,
 landmark:<><path d="M4 20h16M6 17h12M8 17V9h8v8M5 9h14l-7-5-7 5Z"/><path d="M10 12h4"/></>,
 stronghold:<><path d="M4 20V9l8-5 8 5v11H4Z"/><path d="M8 20v-6h8v6M6 10h12"/></>,
 character:<><circle cx="12" cy="8" r="3"/><path d="M6 20c.6-3.6 2.6-5.5 6-5.5s5.4 1.9 6 5.5"/></>,
 episode:<><rect x="4" y="5" width="16" height="14" rx="2"/><path d="m10 9 5 3-5 3V9Z"/></>,
 faction:<><path d="m12 3 7 4v5c0 4.5-3 7-7 9-4-2-7-4.5-7-9V7l7-4Z"/><path d="M9 12h6M12 9v6"/></>,
 series:<><path d="M4 5h16v14H4z"/><path d="M8 5v14M16 5v14M4 10h4M16 10h4"/></>,
 connection:<><circle cx="7" cy="12" r="3"/><circle cx="17" cy="12" r="3"/><path d="M10 12h4"/></>,
 "community-link":<><path d="M4 8h16v9H4z"/><path d="M8 8V5h8v3M9 12h6M12 10v4"/></>,
 "cross-series":<><path d="M5 7h14M5 17h14M8 4l-3 3 3 3M16 14l3 3-3 3"/></>,
 lore:<><path d="M6 4h12v16H6z"/><path d="M9 8h6M9 12h6M9 16h4"/></>,
 "character-link":<><circle cx="7" cy="8" r="2.5"/><circle cx="17" cy="16" r="2.5"/><path d="m9 9.5 6 5"/></>,
 "location-link":<><path d="M7 20s-4-3.5-4-8a4 4 0 0 1 8 0c0 4.5-4 8-4 8Z"/><circle cx="7" cy="12" r="1.2"/><path d="m17 20-3-3.5a4 4 0 1 1 6 0L17 20Z"/><path d="M7 12h6"/></>
};

export default function AtlasIcon({name,className,...props}:{name:AtlasIconName;className?:string}&SVGProps<SVGSVGElement>){
 return <svg className={className} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...props}>{paths[name]}</svg>;
}

// For embedding an icon's glyph directly inside another <svg> (e.g. a map marker). A nested
// <svg viewBox> establishes its own ambiguous, browser-inconsistent sizing context there, so
// callers that need one glyph inside an existing SVG coordinate system should wrap this in a
// <g transform="scale(...)"> themselves instead of using the <svg>-wrapped AtlasIcon above.
export function AtlasIconGlyph({name}:{name:AtlasIconName}){
 return <>{paths[name]}</>;
}
