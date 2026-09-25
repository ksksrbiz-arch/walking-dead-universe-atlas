#!/usr/bin/env node
// Guards against the bug that took down every api/*.ts endpoint in production
// (found while investigating /api/og and /api/share, see PR #57 and
// context/references/journeys-and-sharing.md). Vercel runs api/*.ts files
// individually, and empirically its build does not reliably make a module
// imported from elsewhere under api/ available to the function at runtime —
// confirmed for a plain sibling re-export (api/atlas/telemetry.ts →
// "../telemetry.ts"), a same-directory helper (api/_lib/...), and a top-level
// lib/ directory, all of which threw ERR_MODULE_NOT_FOUND in production while
// working fine locally (tsc and esbuild both resolve/bundle across files,
// which is exactly why this shipped unnoticed). The only fix that has held up
// against a real deployment is: every api/*.ts file is fully self-contained —
// it may import npm packages, but never another local file. Shared logic
// between two endpoints (api/og.ts + api/share.ts; api/entity + api/search)
// is duplicated, not imported.
//
// This script enforces that rule statically, then — since a syntax construct
// can still be invalid even with no imports at all (api/health.ts once had a
// stray backslash in a regex literal that Node's lightweight TypeScript-
// stripping parser, which is what Vercel actually executes these files with,
// could not parse, even though `tsc` was perfectly happy with it) — actually
// imports every api/*.ts file with plain Node, the same way Vercel runs them.
// Run: npm run check:api-imports
import {readFile, readdir} from "node:fs/promises";
import {join, relative, resolve} from "node:path";
import {pathToFileURL} from "node:url";

const ROOT = resolve(new URL("../", import.meta.url).pathname);
const API_DIR = join(ROOT, "api");

async function* walk(dir) {
 for (const entry of await readdir(dir, {withFileTypes: true})) {
  const p = join(dir, entry.name);
  if (entry.isDirectory()) yield* walk(p);
  else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) yield p;
 }
}

const IMPORT_RE = /(?:import|export)\s[^;]*?\bfrom\s+["']([^"']+)["']|import\(["']([^"']+)["']\)/g;

let failed = 0, checked = 0, files = 0;
for await (const file of walk(API_DIR)) {
 files++;
 const src = await readFile(file, "utf8");
 for (const m of src.matchAll(IMPORT_RE)) {
  const spec = m[1] ?? m[2];
  if (!spec.startsWith(".")) continue; // package import — node_modules, always fine
  checked++; failed++;
  console.error(`FAIL  ${relative(ROOT, file)} imports local module "${spec}" — every api/*.ts file must be self-contained (see this script's header). Duplicate the code into this file instead.`);
 }
}
console.log(`${files} api file(s) scanned, ${checked} local import(s) found, ${failed} not allowed.`);
if (failed) process.exit(1);

// Load-bearing check: actually import every api/*.ts file the same way Vercel
// runs it (Node's native loader, no bundler) — catches anything the static
// scan above can't, like a syntax construct Node's lightweight TypeScript
// stripper can't handle.
let loadFailed = 0, loaded = 0;
for await (const file of walk(API_DIR)) {
 loaded++;
 try { await import(pathToFileURL(file).href) }
 catch (e) { loadFailed++; console.error(`FAIL  ${relative(ROOT, file)} does not load: ${e.constructor.name}: ${String(e.message).split("\n")[0]}`) }
}
console.log(`${loaded} api file(s) imported directly, ${loadFailed} failed to load.`);
process.exit(loadFailed ? 1 : 0);
