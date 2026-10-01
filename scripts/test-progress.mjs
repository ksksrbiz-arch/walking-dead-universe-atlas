import {build} from 'esbuild';import assert from 'node:assert/strict';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {pathToFileURL} from 'node:url';
const dir=mkdtempSync(join(tmpdir(),'atlas-progress-'));
try{const out=join(dir,'progress.mjs');await build({entryPoints:['src/lib/progressBackup.ts'],bundle:true,platform:'node',format:'esm',outfile:out});const {parseProgressBackup,createProgressBackup,MAX_BACKUP_BYTES}=await import(pathToFileURL(out).href);
 const backup=createProgressBackup(new Set(['twd-s01-e01','bad']),new Set(['rick-grimes']));assert.deepEqual(parseProgressBackup(JSON.stringify(backup)),backup);assert.deepEqual(backup.watched,['twd-s01-e01']);
 const duplicate={...backup,watched:['twd-s01-e01','twd-s01-e01']};assert.equal(parseProgressBackup(JSON.stringify(duplicate)).watched.length,1);
 for(const value of [null,{}, {...backup,version:2},{...backup,watched:['unknown']},{...backup,followed:[null]},{...backup,exportedAt:'not-a-date'},{...backup,watched:Array(4097).fill('twd-s01-e01')}])assert.throws(()=>parseProgressBackup(JSON.stringify(value)));
 assert.throws(()=>parseProgressBackup('x'.repeat(MAX_BACKUP_BYTES+1)));assert.throws(()=>parseProgressBackup('{broken'));console.log('Progress backup roundtrip, ID validation, deduplication, version and size checks passed.');
}finally{rmSync(dir,{recursive:true,force:true})}
