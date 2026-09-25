// Invariants for the story order (src/lib/chronology.ts) against the real 363-episode dataset.
// Regression guard for the non-transitive comparator that listed 2021 episodes after 2023 ones
// (44 reversed pairs, caused by a few wide-window / unanchored episodes acting as bridges).
// Usage: npm run test:chronology
import { build } from "esbuild";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const dir = mkdtempSync(join(tmpdir(), "twdu-chronology-"));
const out = join(dir, "chronology.mjs");
await build({ entryPoints: ["scripts/fixtures/chronology-entry.ts"], bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "error" });
const C = await import(pathToFileURL(out).href);
rmSync(dir, { recursive: true, force: true });

let failed = 0,
  passed = 0;
const check = (name, ok, detail = "") => {
  if (ok) {
    passed++;
    console.log("  ok  " + name);
  } else {
    failed++;
    console.log("  FAIL " + name + (detail ? " - " + detail : ""));
  }
};

const order = C.buildEpisodeWatchOrder();
const index = new Map(order.map((e, i) => [e.id, i]));
const anchor = (e) => C.normalizeTemporalAnchor(e);
const known = (e) => anchor(e).start != null && anchor(e).end != null;

check("watch order covers all 363 episodes exactly once", order.length === 363 && index.size === 363, String(order.length));

// 1. No pair with disjoint known dates may be listed in the wrong order.
let reversed = 0;
const examples = [];
for (let i = 0; i < order.length; i++)
  for (let j = i + 1; j < order.length; j++)
    if (known(order[i]) && known(order[j]) && C.compareTemporalAnchors(anchor(order[i]), anchor(order[j])) === "after") {
      reversed++;
      if (examples.length < 3) examples.push(`${order[i].id} listed before ${order[j].id}`);
    }
check("no episode is listed before one that happened earlier", reversed === 0, `${reversed} reversed pair(s): ${examples.join("; ")}`);

// 2. The comparator is a valid total order: antisymmetric and transitive over every triple in a sample.
const cmp = C.compareEpisodesChronologically;
const sample = order.filter((_, i) => i % 7 === 0);
let asym = 0,
  trans = 0;
for (const a of sample)
  for (const b of sample) {
    if (Math.sign(cmp(a, b)) !== -Math.sign(cmp(b, a))) asym++;
    for (const c of sample) if (cmp(a, b) <= 0 && cmp(b, c) <= 0 && cmp(a, c) > 0) trans++;
  }
check("comparator is antisymmetric", asym === 0, String(asym));
check("comparator is transitive (no bridge episodes)", trans === 0, String(trans));

// 3. Sorting is deterministic: any input order yields the same result.
const shuffled = [...order].sort((a, b) => (a.id < b.id ? 1 : -1));
const resorted = shuffled.sort(cmp).map((e) => e.id).join(",");
check("result does not depend on input order", resorted === order.map((e) => e.id).join(","));

// 4. Same-year seasons keep episode order, series start in order.
// Anthology series (Tales) tell unrelated stories in different years, so episode-number order does not apply.
const anthologySeries = new Set(JSON.parse(readFileSync(new URL("../data/series.json", import.meta.url), "utf8")).filter((s) => s.type === "anthology").map((s) => s.id));
const ofSeason = (season) => order.filter((e) => e.seasonId === season).map((e) => e.episodeNumber);
const seasonIds = [...new Set(order.filter((e) => !anthologySeries.has(e.seriesId)).map((e) => e.seasonId))];
const scrambled = seasonIds.filter((s) => {
  const nums = ofSeason(s);
  return !nums.every((n, i) => i === 0 || n > nums[i - 1]);
});
check("every non-anthology season lists its episodes in episode-number order", scrambled.length === 0, scrambled.slice(0, 4).join(", "));

// 5. Known regressions from the audit.
const before = (a, b) => index.get(a) < index.get(b);
check("TWD S9E16 comes before Daryl Dixon S1E1 (2021 vs 2023)", before("twd-s09-e16", "daryl-s01-e01"));
check("TWD S10 and S11 come before Daryl Dixon S1E1", before("twd-s10-e05", "daryl-s01-e01") && before("twd-s11-e10", "daryl-s01-e01"));
check("TWD S1E1 is first-year, before Fear S1E1", before("twd-s01-e01", "ftwd-s01-e01") || anchor(order.find((e) => e.id === "twd-s01-e01")).start <= anchor(order.find((e) => e.id === "ftwd-s01-e01")).start);

// 6. Unanchored episodes never invent a position: they sort after all dated ones.
const unanchored = order.filter((e) => !known(e));
const firstUnanchored = order.findIndex((e) => !known(e));
check("unanchored episodes are last", unanchored.length === 0 || order.slice(firstUnanchored).every((e) => !known(e)), unanchored.map((e) => e.id).join(","));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
