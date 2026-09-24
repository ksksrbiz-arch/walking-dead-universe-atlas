const paths={
 map:<><path d="M4 6 9 4l6 2 5-2v14l-5 2-6-2-5 2Z"/><path d="M9 4v14M15 6v14"/></>,
 timeline:<><path d="M4 12h16"/><circle cx="7" cy="12" r="2"/><circle cx="13" cy="12" r="2"/><path d="M17 8v8M7 5v3M13 16v3"/></>,
 clock:<><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/></>,
 people:<><circle cx="9" cy="8" r="3"/><path d="M3.5 20c.6-3.3 2.4-5 5.5-5s4.9 1.7 5.5 5"/><path d="M16 5.2a3 3 0 0 1 0 5.6M18 15c1.6.6 2.6 2.2 3 5"/></>,
 person:<><circle cx="12" cy="8" r="3.2"/><path d="M5.5 20c.7-3.6 2.8-5.4 6.5-5.4s5.8 1.8 6.5 5.4"/></>,
 watch:<><rect x="3" y="5" width="18" height="13" rx="2.5"/><path d="m10 9 5 2.5-5 2.5Z"/><path d="M8 21h8"/></>,
 plus:<path d="M12 5v14M5 12h14"/>,
 minus:<path d="M5 12h14"/>,
 locate:<><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="1.5"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></>,
 search:<><circle cx="10.5" cy="10.5" r="6"/><path d="m16 16 5 5"/></>,
 close:<path d="m6 6 12 12M18 6 6 18"/>,
 chevron:<path d="m9 6 6 6-6 6"/>,
 chevronDown:<path d="m6 9 6 6 6-6"/>,
 back:<path d="M15 5 8 12l7 7"/>,
 layers:<><path d="m12 4 8 4-8 4-8-4 8-4Z"/><path d="m4 12 8 4 8-4M4 16l8 4 8-4"/></>,
 play:<path d="M8 5.5v13l11-6.5Z" fill="currentColor"/>,
 pause:<><path d="M8 5v14M16 5v14"/></>,
 arrow:<path d="M5 12h13M13 7l5 5-5 5"/>,
 external:<><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></>,
 pin:<><path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z"/><circle cx="12" cy="10" r="2"/></>,
 check:<path d="m5 12.5 4.5 4.5L19 7.5"/>,
 link:<><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></>,
 film:<><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 4v16M16 4v16M4 9h4M4 15h4M16 9h4M16 15h4"/></>,
 info:<><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></>,
 route:<><circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7"/></>,
 spark:<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/>,
 flag:<><path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/></>,
 eye:<><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.8"/></>,
 skull:<><path d="M12 3c-4.4 0-7.5 3-7.5 7.2 0 2.4 1 4 2.5 5V19h10v-3.8c1.5-1 2.5-2.6 2.5-5C19.5 6 16.4 3 12 3Z"/><circle cx="9" cy="11" r="1.6"/><circle cx="15" cy="11" r="1.6"/><path d="M10 19v2M14 19v2"/></>,
 star:<path d="M12 3.5l2.47 5.24 5.78.62-4.28 4 1.14 5.74L12 16.9l-5.11 2.2 1.14-5.74-4.28-4 5.78-.62Z"/>
};
export type IconName=keyof typeof paths;

export default function Icon({name,className,size}:{name:IconName;className?:string;size?:number}){
 return <svg className={"icon "+(className||"")} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}
