#!/usr/bin/env node
// Guards against the bug that took down every api/*.ts endpoint in production
// (found while investigating /api/og and /api/share): Vercel runs these files
// unbundled through Node's own ESM loader (no esbuild/webpack step resolving
// them), which — unlike tsc or a bundler — requires an explicit file
// extension on every relative import. `from "./_lib/atlas-share"` throws
// ERR_MODULE_NOT_FOUND at request time in production even though it
// typechecks and bundles fine locally; it must be
// `from "./_lib/atlas-share.ts"`. This script statically checks both rules:
// every relative import in api/**/*.ts must (a) carry an explicit extension
// and (b) resolve to a real file still under api/ (shared code goes in
// api/_lib/ — an underscore-prefixed path is excluded from routing).
// Run: npm run check:api-imports
import {access, readFile, readdir} from "node:fs/promises";
import {pathToFileURL} from "node:url";
import {dirname, join, relative, resolve} from "node:path";

const ROOT = resolve(new URL("../", import.meta.url).pathname);
const API_DIR = join(ROOT, "api");

async function* walk(dir) {
 for (const entry of await readdir(dir, {withFileTypes: true})) {
  const p = join(dir, entry.name);
  if (entry.isDirectory()) yield* walk(p);
  else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) yield p;
 }
}
const exists = async p => { try { await access(p); return true } catch { return false } };

const IMPORT_RE = /(?:import|export)\s[^;]*?\bfrom\s+["']([^"']+)["']|import\(["']([^"']+)["']\)/g;

let failed = 0, checked = 0;
for await (const file of walk(API_DIR)) {
 const src = await readFile(file, "utf8");
 for (const m of src.matchAll(IMPORT_RE)) {
  const spec = m[1] ?? m[2];
  if (!spec.startsWith(".")) continue; // package import — node_modules, resolved normally
  checked++;
  const rel = relative(ROOT, file);
  if (!/\.(ts|tsx|js|mjs|json)$/.test(spec)) {
   failed++;
   console.error(`FAIL  ${rel} imports "${spec}" with no file extension — Node's native ESM loader (what Vercel actually runs these files with) needs one, e.g. "${spec}.ts".`);
   continue;
  }
  const resolvedPath = resolve(dirname(file), spec);
  if (!(await exists(resolvedPath))) {
   failed++;
   console.error(`FAIL  ${rel} imports "${spec}" → ${relative(ROOT, resolvedPath)} does not exist.`);
   continue;
  }
  const relToApi = relative(API_DIR, resolvedPath);
  if (relToApi.startsWith("..")) {
   failed++;
   console.error(`FAIL  ${rel} imports "${spec}" → escapes api/ (resolves to ${relative(ROOT, resolvedPath)}). Move the shared module into api/_lib/ instead.`);
  }
 }
}
console.log(`${checked} relative import(s) checked in api/, ${failed} broken.`);
if (failed) process.exit(1);

// Load-bearing check: actually import every api/*.ts file the same way Vercel
// runs it (Node's native loader, no bundler). This catches everything the
// static check above can't — a syntax construct Node's lightweight TS
// stripper can't parse, a bad regex, anything — the exact class of bug that
// took down /api/health (a stray backslash in a regex literal) alongside the
// missing-extension bug above.
let loadFailed = 0, loaded = 0;
for await (const file of walk(API_DIR)) {
 loaded++;
 try { await import(pathToFileURL(file).href) }
 catch (e) { loadFailed++; console.error(`FAIL  ${relative(ROOT, file)} does not load: ${e.constructor.name}: ${String(e.message).split("\n")[0]}`) }
}
console.log(`${loaded} api file(s) imported directly, ${loadFailed} failed to load.`);
process.exit(loadFailed ? 1 : 0);
