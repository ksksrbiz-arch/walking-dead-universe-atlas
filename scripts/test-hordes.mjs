import {build} from 'esbuild';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const dir=mkdtempSync(join(tmpdir(),'atlas-herds-'));
try{
 const out=join(dir,'herds.mjs');
 await build({entryPoints:['src/lib/hordes.ts'],bundle:true,platform:'node',format:'esm',outfile:out});
 const {hordes,availablePhases,phaseYear,hordeLocation,hordeTrace}=await import(pathToFileURL(out).href);
 for(const herd of hordes){
  assert.equal(new Set(herd.phases.map(p=>p.id)).size,herd.phases.length);
  for(const phase of herd.phases){assert.notEqual(phaseYear(phase),null);assert.ok(herd.sources[phase.sourceIndex].url.startsWith('https://walkingdead.fandom.com/'));if(phase.locationId)assert.ok(hordeLocation(phase));}
  assert.equal(availablePhases(herd,2030).length,0,'No perpetual migration after recorded events');
  assert.equal(availablePhases(herd,phaseYear(herd.phases[0]),'ftwd').length,0);
  assert.equal(availablePhases(herd,phaseYear(herd.phases[0]),undefined,new Set()).length,0,'Unwatched herd events stay hidden');
 }
 const farm=hordes[0];assert.equal(hordeTrace(farm,1,new Set([0,1])).length,1);assert.equal(hordeTrace(farm,1,new Set([1])).length,0,'No trace through hidden events');
 const quarry=hordes[1];assert.equal(hordeLocation(quarry.phases[0]),null);assert.equal(hordeTrace(quarry,3,new Set([0,1,2,3])).length,0,'No invented quarry route or movement between identical coordinates');
 assert.equal(hordeLocation(hordes[2].phases[2]),null,'Unmapped cliff never inherits hospital pin');
 console.log('Herd registry, chronology, spoiler filters and unknown-route checks passed.');
}finally{rmSync(dir,{recursive:true,force:true})}
