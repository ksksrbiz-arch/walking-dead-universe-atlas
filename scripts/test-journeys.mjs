// Unit checks for src/lib/journeys.ts (the journey model shared by the map,
// the journey panel and the share/OG function). Bundles the module with the
// esbuild that ships with Vite, then asserts invariants against the real data.
// Usage: npm run test:journeys
import {build} from "esbuild";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {pathToFileURL} from "node:url";

const dir=mkdtempSync(join(tmpdir(),"twdu-journeys-"));
const out=join(dir,"journeys.mjs");
await build({entryPoints:["scripts/fixtures/journeys-entry.ts"],bundle:true,format:"esm",platform:"node",outfile:out,logLevel:"error"});
const J=await import(pathToFileURL(out).href);
rmSync(dir,{recursive:true,force:true});

let failed=0,passed=0;
const check=(name,ok,detail="")=>{if(ok){passed++;console.log("  ok  "+name)}else{failed++;console.log("  FAIL "+name+(detail?" — "+detail:""))}};

check("dataset is 363 episodes",J.episodeCount===363,String(J.episodeCount));

const daryl=J.buildJourney("daryl-dixon");
check("Daryl has a multi-stop journey",daryl.stops.length>5,String(daryl.stops.length));
check("every stop is a placed location",daryl.stops.every(s=>J.isPlaced(s.location)));
check("no stop repeats the previous place",daryl.stops.every((s,i)=>i===0||s.location.id!==daryl.stops[i-1].location.id));
check("stops are in story order",daryl.stops.every((s,i)=>i===0||s.rank>=daryl.stops[i-1].rank));
check("every stop after the first is reached by one leg",daryl.legs.length===daryl.stops.length-1&&daryl.legs.every(l=>l.from<l.to&&daryl.stops[l.to].from===l.from));
check("chapters only move forward",daryl.stops.every((s,i)=>i===0||s.chapter>=daryl.stops[i-1].chapter)&&daryl.stops.at(-1).chapter>1);
check("the multi-place Virginia seasons don't zig-zag",daryl.stops.filter(s=>s.location.id==="alexandria").length<=2,String(daryl.stops.filter(s=>s.location.id==="alexandria").length));
const darylEps=new Set(daryl.episodeIds);
check("leg evidence is the character's own episodes",daryl.legs.every(l=>darylEps.has(l.leaveEpisodeId)&&darylEps.has(l.arriveEpisodeId)));
check("leg evidence episodes record both ends",daryl.legs.every(l=>J.episodeLocations(l.leaveEpisodeId).includes(daryl.stops[l.from].location.id)&&J.episodeLocations(l.arriveEpisodeId).includes(daryl.stops[l.to].location.id)));
check("place numbers are first-visit order",daryl.stops.every(s=>s.visit>1||s.place===new Set(daryl.stops.slice(0,s.index+1).map(x=>x.location.id)).size));
check("revisits counted",daryl.stats.revisits===daryl.stops.filter(s=>s.visit>1).length);
check("km is a sum of legs",daryl.stats.km===daryl.legs.reduce((s,l)=>s+l.km,0)&&daryl.stats.km>1000,String(daryl.stats.km));
check("crosses into Daryl Dixon series",daryl.stats.series.includes("daryl")&&daryl.legs.some(l=>l.crossesSeries));

const none=J.buildJourney("daryl-dixon",{onlyEpisodes:new Set()});
check("spoiler-safe with nothing watched hides everything",none.stops.length===0&&none.hiddenEpisodeCount===daryl.episodeIds.length);
const firstTen=new Set(daryl.episodeIds.slice(0,10));
const partial=J.buildJourney("daryl-dixon",{onlyEpisodes:firstTen});
check("spoiler-safe keeps only watched evidence",partial.stops.every(s=>s.episodeIds.every(id=>firstTen.has(id)))&&partial.hiddenEpisodeCount===daryl.episodeIds.length-10);

const carol=J.buildJourney("carol-peletier");
const crossings=J.findCrossings([daryl,carol]);
const together=crossings.filter(c=>c.together);
check("Daryl × Carol cross paths together",together.length>0,String(together.length));
check("together crossings are shared episodes at that place",together.every(c=>c.episodeIds.every(id=>darylEps.has(id)&&carol.episodeIds.includes(id)&&J.episodeLocations(id).includes(c.location.id))));
check("same-ground crossings have no shared episode",crossings.filter(c=>!c.together).every(c=>c.episodeIds.length===0));

const beats=J.buildBeats([daryl,carol]);
check("beats are in story order",beats.every((b,i)=>i===0||b.rank>beats[i-1].rank));
check("every stop appears in exactly one beat",beats.reduce((n,b)=>n+b.moves.length,0)===daryl.stops.length+carol.stops.length);
const end=J.positionsAt([daryl,carol],beats,beats.length-1);
check("last beat puts everyone at their final stop",end[0]===daryl.stops.length-1&&end[1]===carol.stops.length-1);
const start=J.positionsAt([daryl,carol],beats,0);
check("first beat starts at most one stop in",start.every(p=>p<=0));
let monotonic=true,prev=[-1,-1];
for(let i=0;i<beats.length;i++){const p=J.positionsAt([daryl,carol],beats,i);if(p.some((x,k)=>x<prev[k]))monotonic=false;prev=p}
check("positions only move forward",monotonic);
const single=J.buildBeats([daryl]);
check("single journey: one beat per stop",single.length===daryl.stops.length);
const y=daryl.stops[Math.floor(daryl.stops.length/2)].startYear;
const b=J.beatForYear([daryl],single,y);
check("beatForYear lands on a stop in that year or earlier",J.beatYear([daryl],single[b])<=y&&(b===single.length-1||(J.beatYear([daryl],single[b+1])??0)>y),`${y} → ${b}`);

check("parseJourneyIds drops unknown ids and caps at 3",JSON.stringify(J.parseJourneyIds("daryl-dixon,nobody,carol-peletier,rick-grimes,michonne"))===JSON.stringify(["daryl-dixon","carol-peletier","rick-grimes"]));
check("parseJourneyIds accepts + separators",J.parseJourneyIds("daryl-dixon+carol-peletier").length===2);
const cands=J.journeyCandidates();
check("compare candidates all have journeys",cands.length>10&&cands.every(c=>J.buildJourney(c.id).stops.length>1),String(cands.length));

let unplacedOk=true;
for(const c of cands)for(const s of J.buildJourney(c.id).stops)if(!J.isPlaced(s.location))unplacedOk=false;
check("no journey ever routes through (0,0)",unplacedOk);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed?1:0);
