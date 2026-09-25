#!/usr/bin/env node
// Guards against the bug that took /api/og and /api/share down in production
// (PR #52 → hotfix): Vercel's per-function file tracer for api/*.ts does not
// follow a relative import that leaves the api/ directory (e.g. "../lib/x"),
// even though it typechecks and bundles fine locally (tsc and esbuild both
// resolve across directories). Every api/**/*.ts file's relative imports must
// therefore resolve to a path still under api/ — shared code goes in
// api/_lib/ (files/dirs starting with "_" are excluded from routing but still
// traced alongside their siblings). Run: npm run check:api-imports
import {readFile, readdir} from "node:fs/promises";
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

const IMPORT_RE = /(?:import|export)\s[^;]*?\bfrom\s+["']([^"']+)["']|import\(["']([^"']+)["']\)/g;

let failed = 0, checked = 0;
for await (const file of walk(API_DIR)) {
 const src = await readFile(file, "utf8");
 for (const m of src.matchAll(IMPORT_RE)) {
  const spec = m[1] ?? m[2];
  if (!spec.startsWith(".")) continue; // package import — fine, node_modules is traced normally
  checked++;
  const resolved = resolve(dirname(file), spec);
  const rel = relative(API_DIR, resolved);
  if (rel.startsWith("..")) {
   failed++;
   console.error(`FAIL  ${relative(ROOT, file)} imports "${spec}" → escapes api/ (resolves to ${relative(ROOT, resolved)}). Move the shared module into api/_lib/ instead.`);
  }
 }
}
console.log(`${checked} relative import(s) checked in api/, ${failed} escape api/.`);
process.exit(failed ? 1 : 0);
