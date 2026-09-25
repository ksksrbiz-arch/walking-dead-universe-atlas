#!/usr/bin/env node
/**
 * Targeted gap-fill for locations whose Fandom canonical record has no usable
 * image (data/enrichment/fandom-canonical.json's slow multi-stage pipeline
 * either never resolved a confident page match for these, or resolved a page
 * whose only image was unrelated to the location's canonical name — e.g.
 * "prison" -> West Georgia Correctional Facility resolved fine but its own
 * image filename ("Litprison.jpg") shares no tokens with that formal name,
 * so the client-side fandomEntityImage() heuristic never picks it up).
 *
 * Rather than re-running the full ingest/reconcile/publish pipeline (slow,
 * touches every entity, and this repo's checked-in fandom-canonical.json
 * doesn't match the shape scripts/ingest-fandom-atlas.mjs currently
 * produces, so a full re-run risks regressing entities that already work),
 * this asks the Fandom MediaWiki API directly for each gap location's own
 * "page image" (the infobox/lead image MediaWiki already associates with a
 * title) via a short list of title guesses, verifies the result actually
 * loads through the live delivery path, and writes it straight into
 * data/media.json as curated data (which now wins over the Fandom heuristic
 * everywhere per the priority fix).
 *
 * Usage: node scripts/fill-location-fandom-images.mjs [--dry-run]
 */
import { readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";

const ROOT = new URL("../", import.meta.url);
const DATA = new URL("data/", ROOT);
const API = "https://walkingdead.fandom.com/api.php";
const MEDIA_PROXY = "https://qflqfvoxdzkibpzfrwop.supabase.co/functions/v1/atlas-media";
const DRY_RUN = process.argv.includes("--dry-run");

const readJson = async (url) => JSON.parse(await readFile(url, "utf8"));

// Known-bad matches, found by manually checking search-fallback results: real Fandom
// pages that share a location's name but are the wrong canon (this atlas is TV-canon
// only) or the wrong kind of page (a faction/personnel page, not the place itself).
// Not detectable by the name-substring filter alone, so they're excluded explicitly.
const EXCLUDE_TITLES = new Set([
  "Civic Republic Military", // the faction, not the "Civic Republic" place entity
]);

// Known cases where the plain canonical name isn't the actual Fandom page
// title. Mirrors (and extends) the CURATED_ALIASES map in
// scripts/reconcile-fandom-matches.mjs for locations specifically.
const TITLE_HINTS = {
  atlanta: ["Atlanta, Georgia (TV Universe)"],
  "king-county": ["King County, Georgia (TV Universe)"],
  "los-angeles": ["Los Angeles, California"],
  "cdc-atlanta": ["Center for Disease Control (TV Universe)"],
  kingdom: ["The Kingdom (TV Series)"],
  prison: ["West Georgia Correctional Facility (TV Series)"],
  woodbury: ["Woodbury (TV Series)"],
  oceanside: ["Oceanside (TV Series)"],
  commonwealth: ["Commonwealth (TV Series)"],
  manhattan: ["Manhattan"],
  "manhattan-island": ["Manhattan"],
  "hospitals-atlanta": ["Harrison Memorial Hospital (TV Series)"],
  "new-york-city": ["New York City"],
  london: ["London"],
  paris: ["Paris"],
  madrid: ["Madrid"],
  barcelona: ["Barcelona"],
};

function titleCandidates(id, name) {
  const hints = TITLE_HINTS[id] || [];
  return [...new Set([...hints, name, `${name} (TV Series)`, `${name} (TV Universe)`])];
}

function normalize(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

// Fandom's own full-text search, used only as a fallback once direct title guesses fail.
// Search can return anything vaguely related (a character page, a random article that
// mentions the location once) so a hit is only trusted when the location's own name
// actually appears in the candidate title - "Madrid" search returning a Daryl Dixon
// character page is exactly the false-positive this guards against.
async function searchCandidateTitles(name) {
  const url = new URL(API);
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("list", "search");
  url.searchParams.set("srlimit", "5");
  url.searchParams.set("srsearch", name);
  const data = await fetchJson(url.toString());
  const nameNorm = normalize(name);
  return (data?.query?.search || [])
    .map((r) => r.title)
    .filter((title) => normalize(title).includes(nameNorm))
    // This atlas is TV-canon only (see AGENTS.md / docs/DATA_ENRICHMENT_ARCHITECTURE.md) -
    // a comic-only page is never a valid image source for a TV-universe location.
    .filter((title) => !/\(comic/i.test(title))
    .filter((title) => !EXCLUDE_TITLES.has(title));
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    execFile("curl", ["-s", "--max-time", "20", url], { maxBuffer: 1024 * 1024 * 20 }, (error, stdout) => {
      if (error) return reject(error);
      try { resolve(JSON.parse(stdout)); } catch (e) { reject(e); }
    });
  });
}

function curlStatus(url) {
  return new Promise((resolve) => {
    execFile("curl", ["-s", "-o", "/dev/null", "-w", "%{http_code} %{content_type}", "--max-time", "20", url], (error, stdout) => {
      if (error) return resolve({ ok: false });
      const [code, ...rest] = String(stdout).trim().split(" ");
      const status = Number(code) || null;
      return resolve({ ok: Boolean(status && status >= 200 && status < 400), status, contentType: rest.join(" ") });
    });
  });
}

async function findPageImage(title) {
  const url = new URL(API);
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("redirects", "1");
  url.searchParams.set("prop", "pageimages");
  url.searchParams.set("piprop", "original");
  url.searchParams.set("titles", title);
  const data = await fetchJson(url.toString());
  const pages = Object.values(data?.query?.pages || {});
  const page = pages.find((p) => !p.missing && p.original?.source);
  if (!page) return null;
  return { title: page.title, imageUrl: page.original.source };
}

async function main() {
  const [locations, media, manifest] = await Promise.all([
    readJson(new URL("locations.json", DATA)),
    readJson(new URL("media.json", DATA)),
    readJson(new URL("enrichment/media-manifest.json", DATA)),
  ]);

  const gapIds = new Set(
    manifest.entities
      .filter((e) => e.entityType === "locations" && e.resolutionMethod === "series-keyart-fallback")
      .map((e) => e.id),
  );

  const results = [];
  for (const loc of locations) {
    if (!gapIds.has(loc.id)) continue;
    const candidates = titleCandidates(loc.id, loc.name);
    let found = null;
    let allTried = [...candidates];
    for (const title of candidates) {
      try {
        const hit = await findPageImage(title);
        if (hit) { found = hit; break; }
      } catch {
        // try next candidate
      }
    }
    if (!found) {
      try {
        const searchTitles = await searchCandidateTitles(loc.name);
        allTried = [...allTried, ...searchTitles];
        for (const title of searchTitles) {
          const hit = await findPageImage(title);
          if (hit) { found = hit; break; }
        }
      } catch {
        // fall through to no-page-image below
      }
    }
    if (!found) {
      results.push({ id: loc.id, name: loc.name, status: "no-page-image", triedTitles: allTried });
      continue;
    }
    const proxyUrl = new URL(MEDIA_PROXY);
    proxyUrl.searchParams.set("url", found.imageUrl);
    const check = await curlStatus(proxyUrl.toString());
    if (!check.ok) {
      results.push({ id: loc.id, name: loc.name, status: "image-unreachable", pageTitle: found.title, imageUrl: found.imageUrl, httpStatus: check.status });
      continue;
    }
    results.push({ id: loc.id, name: loc.name, status: "resolved", pageTitle: found.title, imageUrl: found.imageUrl, contentType: check.contentType });
  }

  const resolved = results.filter((r) => r.status === "resolved");
  console.log(`Resolved ${resolved.length}/${results.length} gap locations.`);
  for (const r of results) {
    console.log(`  [${r.status}] ${r.id} (${r.name})${r.pageTitle ? " -> " + r.pageTitle : ""}`);
  }

  if (DRY_RUN) {
    console.log("\n--dry-run: not writing data/media.json");
    return;
  }

  media.places = media.places || {};
  for (const r of resolved) {
    media.places[r.id] = {
      ...(media.places[r.id] || {}),
      kind: "place",
      image: r.imageUrl,
      sourcePage: `https://walkingdead.fandom.com/wiki/${encodeURIComponent(r.pageTitle.replace(/ /g, "_"))}`,
      status: "verified",
      note: "Fandom MediaWiki page image, resolved by scripts/fill-location-fandom-images.mjs",
    };
    delete media.places[r.id].error;
  }
  // Record the negative result too - a location this script checked and found nothing for
  // should read differently from one nobody has looked at yet ("needs-ingestion"). Never
  // overwrites an existing image/status a human or an earlier run already set.
  const noImage = results.filter((r) => r.status === "no-page-image" || r.status === "image-unreachable");
  for (const r of noImage) {
    const existing = media.places[r.id];
    if (existing?.image) continue;
    media.places[r.id] = {
      ...existing,
      kind: "place",
      status: "no-verified-image",
      note: `scripts/fill-location-fandom-images.mjs found no usable Fandom page image (tried: ${(r.triedTitles || []).join(", ") || "n/a"}). Re-check if the location gains a dedicated wiki page.`,
      checkedAt: new Date().toISOString(),
    };
  }
  await writeFile(new URL("media.json", DATA), JSON.stringify(media, null, 2) + "\n");
  console.log(`\nWrote ${resolved.length} curated location image(s) and ${noImage.length} explicit no-verified-image record(s) to data/media.json`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
