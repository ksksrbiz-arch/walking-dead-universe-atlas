import type {CSSProperties} from "react";
import {atlasImageUrl} from "../lib/media";

type CharacterPortraitProps={
  character:{id:string;name:string};
  image?:string|null;
  gallery?:string[];
  size?:number;
  className?:string;
};

function initials(name:string){
  return name.split(/\s+/).filter(Boolean).slice(0,2).map(v=>v[0]).join("").toUpperCase();
}

export default function CharacterPortrait({character,image,gallery,size=64,className}:CharacterPortraitProps){
  const safe=character.id.replace(/[^a-z0-9_-]/gi,"-");
  const clip=`character-portrait-${safe}`;
  const primary=image || gallery?.[0] || "";
  const src=primary ? atlasImageUrl(primary, Math.max(320,size*4), 82) : "";
  const style={"--portrait-size":`${size}px`} as CSSProperties;

  return (
    <span className={`characterPortrait ${className||""}`} style={style} aria-hidden="true">
      <svg viewBox="0 0 100 100" role="img" focusable="false">
        <defs>
          <clipPath id={clip}><circle cx="50" cy="50" r="47"/></clipPath>
          <linearGradient id={`${clip}-bg`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity=".32"/>
            <stop offset="1" stopColor="currentColor" stopOpacity=".08"/>
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r="48" fill={`url(#${clip}-bg)`} stroke="currentColor" strokeOpacity=".32" strokeWidth="2"/>
        {src ? (
          <image href={src} x="3" y="3" width="94" height="94" preserveAspectRatio="xMidYMid slice" clipPath={`url(#${clip})`} />
        ) : (
          <>
            <circle cx="50" cy="38" r="18" fill="currentColor" opacity=".72"/>
            <path d="M20 88c3-20 15-30 30-30s27 10 30 30" fill="currentColor" opacity=".5"/>
            <text x="50" y="94" textAnchor="middle" fontSize="10" fontWeight="700" fill="currentColor">{initials(character.name)}</text>
          </>
        )}
        <circle cx="50" cy="50" r="47" fill="none" stroke="currentColor" strokeOpacity=".18" strokeWidth="2"/>
      </svg>
    </span>
  );
}
