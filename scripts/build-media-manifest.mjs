#!/usr/bin/env node
/**
 * Builds an end-to-end media manifest for the Atlas.
 *
 * This does NOT trust upload counts or deployment status. For every character,
 * location and episode it replicates the exact resolution order the live app
 * uses (src/lib/media.ts: curated data/media.json / data/episodeMedia.json first,
 * then the Fandom canonical heuristic match, then series key art) and then
 * makes a real HTTP request through the same delivery path the browser would
 * use (the Supabase atlas-media proxy for Fandom/AMC sources, a local file
 * check for /media/... static assets) to confirm the asset actually resolves.
 *
 * Output: data/enrichment/media-manifest.json
 */
import { readFile, writeFile, access } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";

const ROOT = new URL("../", import.meta.url);
const DATA = new URL("data/", ROOT);
const OUT = new URL("data/enrichment/", ROOT);

const MEDIA_PROXY = "https://qflqfvoxdzkibpzfrwop.supabase.co/functions/v1/atlas-media";
const CONCURRENCY = Number(process.env.MEDIA_VERIFY_CONCURRENCY || 8);
const TIMEOUT_S = Number(process.env.MEDIA_VERIFY_TIMEOUT || 15);
const SKIP_VERIFY = process.env.MEDIA_MANIFEST_SKIP_VERIFY === "1";

const readJson = async (url) => JSON.parse(await readFile(url, "utf8"));

// Mirrors fandomEntityImage() in src/lib/media.ts. Keep these in sync; this script
// exists specifically so drift between "what we think resolves" and "what the
// app actually renders" gets caught instead of assumed away.
function fandomEntityImage(fandomCanonical, entityType, id, name) {
  const record = fandomCanonical?.[entityType]?.[id];
  const candidates = [
    ...(Array.isArray(record?.image_urls) ? record.image_urls : []),
    ...(record?.details?.imageFiles || []).flatMap((x) => [x?.url, x?.thumbnail].filter(Boolean)),
    ...(Array.isArray(record?.hints?.imageGallery) ? record.hints.imageGallery : []),
    ...(Array.isArray(record?.hints?.image) ? record.hints.image : record?.hints?.image ? [record.hints.image] : []),
  ].filter((x) => typeof x === "string" && /^https?:\/\//i.test(x));
  if (!candidates.length) return "";
  const tokens = String(name).toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/)
    .filter((x) => x.length >= 3 && !["the", "tv", "universe", "series"].includes(x));
  const generic = /logo|title.?card|key.?art|series.?art|franchise|ensemble|group.?photo|cast.?photo|promo|poster|banner|background|wallpaper/i;
  const scored = [...new Set(candidates)].map((url) => {
    const hay = url.toLowerCase().replace(/[_-]+/g, " ");
    const matches = tokens.filter((t) => hay.includes(t)).length;
    let score = matches * 30 + (matches === tokens.length && tokens.length ? 70 : 0);
    if (generic.test(hay)) score -= 90;
    return { url, score };
  }).sort((a, b) => b.score - a.score);
  return scored[0]?.score > 0 ? scored[0].url : "";
}

function isFandomImage(source) {
  return /^https?:\/\/(?:static\.wikia\.nocookie\.net|vignette\.wikia\.nocookie\.net|images\.wikia\.nocookie\.net)\//i.test(source);
}
function isAmcImage(source) {
  return /^https?:\/\/(?:images|dimages)\.cds\.amcn\.com\//i.test(source);
}

// Mirrors atlasImageUrl() in src/lib/media.ts: local resized variants
// (src/generated/media-local.json, npm run media:resize) win for AMC sources;
// Fandom sources are requested CDN-resized through the proxy.
let LOCAL_MEDIA = {};
try { LOCAL_MEDIA = JSON.parse(await import("node:fs/promises").then(fs => fs.readFile(new URL("../src/generated/media-local.json", import.meta.url), "utf8"))); } catch {}
function deliveryFor(source) {
  if (!source) return null;
  if (source.startsWith("/")) return { kind: "local-static", requestUrl: source };
  const local = LOCAL_MEDIA[source];
  if (local) {
    const variants = typeof local === "string" ? [local] : Object.values(local);
    return { kind: "local-resized", requestUrl: variants[variants.length - 1], localPaths: variants };
  }
  if (isFandomImage(source) || isAmcImage(source)) {
    const url = new URL(MEDIA_PROXY);
    // The app never requests a Fandom original (some are >10 MB and exceed the
    // proxy's size cap); it asks the Fandom CDN for the display width. Check
    // the largest routine request (1200px), mirroring fandomScaled().
    const requested = isFandomImage(source) && /\/revision\/latest/.test(source) && !/scale-to-width/.test(source)
      ? source.replace(/\/revision\/latest/, "/revision/latest/scale-to-width-down/1200") : source;
    url.searchParams.set("url", requested);
    return { kind: "supabase-proxy", requestUrl: url.toString() };
  }
  return { kind: "direct", requestUrl: source };
}

function curlCheckOnce(url) {
  return new Promise((resolve) => {
    execFile("curl", [
      "-s", "-L", "-o", "/dev/null",
      "-w", "%{http_code} %{content_type}",
      "--max-time", String(TIMEOUT_S),
      url,
    ], { timeout: (TIMEOUT_S + 5) * 1000 }, (error, stdout) => {
      if (error) return resolve({ ok: false, httpStatus: null, contentType: null, error: error.message });
      const [code, ...rest] = String(stdout).trim().split(" ");
      const status = Number(code) || null;
      const contentType = rest.join(" ") || null;
      resolve({ ok: Boolean(status && status >= 200 && status < 400), httpStatus: status, contentType });
    });
  });
}

// A single dropped connection under concurrent load shouldn't get reported as a broken
// asset - retry once before concluding it's actually down.
async function curlCheck(url) {
  const first = await curlCheckOnce(url);
  if (first.ok) return first;
  await new Promise((r) => setTimeout(r, 800));
  return curlCheckOnce(url);
}

async function localStaticCheck(publicPath) {
  const filePath = new URL("public" + publicPath, ROOT);
  try {
    await access(filePath);
    return { ok: true, httpStatus: 200, contentType: "local-file" };
  } catch {
    return { ok: false, httpStatus: 404, contentType: null, error: "file not found under public/" };
  }
}

async function verify(delivery) {
  if (!delivery) return { ok: false, httpStatus: null, contentType: null, error: "unresolved" };
  if (SKIP_VERIFY) return { ok: null, httpStatus: null, contentType: null, error: "skipped" };
  if (delivery.kind === "local-static") return localStaticCheck(delivery.requestUrl);
  if (delivery.kind === "local-resized") {
    for (const p of delivery.localPaths) { const r = await localStaticCheck(p); if (!r.ok) return { ...r, error: "resized variant missing: " + p }; }
    return { ok: true, httpStatus: 200, contentType: "local-resized" };
  }
  return curlCheck(delivery.requestUrl);
}

async function pool(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

async function main() {
  const [characters, locations, episodes, seriesList, media, episodeMedia, fandomCanonical] = await Promise.all([
    readJson(new URL("characters.json", DATA)),
    readJson(new URL("locations.json", DATA)),
    readJson(new URL("episodes.json", DATA)),
    readJson(new URL("series.json", DATA)),
    readJson(new URL("media.json", DATA)),
    readJson(new URL("episodeMedia.json", DATA)),
    readJson(new URL("enrichment/fandom-canonical.json", DATA)).catch(() => ({})),
  ]);

  const seriesKeyArt = Object.fromEntries(Object.entries(media.series || {}).map(([id, s]) => [id, s.image || s.keyArt]));

  const entries = [];

  for (const c of characters) {
    const curated = media.characters?.[c.id];
    const fandomImage = fandomEntityImage(fandomCanonical, "characters", c.id, c.name);
    const fallback = seriesKeyArt[c.seriesIds?.[0]];
    const source = curated?.image || fandomImage || fallback || "";
    const method = curated?.image ? "curated" : fandomImage ? "fandom-heuristic" : fallback ? "series-keyart-fallback" : "none";
    entries.push({ entityType: "characters", id: c.id, name: c.name, source, method, curatedStatus: curated?.status || null });
  }

  for (const l of locations) {
    const curated = media.places?.[l.id];
    const fandomImage = fandomEntityImage(fandomCanonical, "locations", l.id, l.name);
    const fallback = seriesKeyArt[l.seriesId];
    const source = curated?.image || fandomImage || fallback || "";
    const method = curated?.image ? "curated" : fandomImage ? "fandom-heuristic" : fallback ? "series-keyart-fallback" : "none";
    entries.push({ entityType: "locations", id: l.id, name: l.name, source, method, curatedStatus: curated?.status || null });
  }

  for (const e of episodes) {
    const curated = media.episodes?.[e.id];
    const legacy = episodeMedia.episodes?.[e.id];
    // Mirrors fandomPrimaryImage() then fandomEntityImage() in src/lib/media.ts.
    const primary = (fandomCanonical.episodes?.[e.id]?.image_urls || []).find(u => typeof u === "string" && /^https?:\/\//.test(u) && !/logo|title.?card|key.?art|series.?art|franchise|poster|banner|wallpaper/i.test(u)) || "";
    const fandomImage = primary || fandomEntityImage(fandomCanonical, "episodes", e.id, e.title);
    const fallback = seriesKeyArt[e.seriesId];
    // Mirrors episodeImage() in src/lib/atlasHelpers.ts: a verified official still beats the
    // episode's own Fandom still, which beats the series key-art "fallback" record.
    const verified = legacy?.status === "verified" ? legacy.image : "";
    const source = curated?.image || verified || fandomImage || legacy?.image || fallback || "";
    const method = curated?.image ? "curated" : verified ? "verified-episode-media" : fandomImage ? "fandom-heuristic" : legacy?.image ? "legacy-episode-media" : fallback ? "series-keyart-fallback" : "none";
    entries.push({ entityType: "episodes", id: e.id, name: e.title, source, method, curatedStatus: legacy?.status || null });
  }

  for (const s of seriesList) {
    const curated = media.series?.[s.id];
    const source = curated?.image || curated?.keyArt || "";
    const method = source ? "curated" : "none";
    entries.push({ entityType: "series", id: s.id, name: s.title || s.shortTitle || s.id, source, method, curatedStatus: curated?.status || null });
  }

  const withDelivery = entries.map((entry) => ({ ...entry, delivery: deliveryFor(entry.source) }));

  console.log(`Verifying ${withDelivery.filter((x) => x.delivery).length} resolved assets (concurrency ${CONCURRENCY})...`);
  const verified = await pool(withDelivery, CONCURRENCY, async (entry) => {
    const result = await verify(entry.delivery);
    return { ...entry, verification: result };
  });

  const manifest = {
    generatedAt: new Date().toISOString(),
    version: 1,
    notes: "Reflects the actual live resolution order in src/lib/media.ts + atlasHelpers.ts (curated data/media.json > verified episodeMedia still > Fandom canonical heuristic match > series key art; AMC served from local resized variants), not the Vercel Blob pipeline, which is not currently wired into image rendering.",
    summary: {},
    entities: verified.map((v) => ({
      entityType: v.entityType,
      id: v.id,
      name: v.name,
      resolvedSource: v.source || null,
      resolutionMethod: v.method,
      curatedStatus: v.curatedStatus,
      deliveryKind: v.delivery?.kind || null,
      // Entities with no resolved source at all (method "none") never had a URL to check -
      // that's "unresolved", not "broken". "broken" is reserved for a real URL that failed
      // verification, which is a materially different, more urgent thing to fix.
      verificationStatus: !v.source ? "unresolved" : v.verification.ok === true ? "verified" : v.verification.ok === false ? "broken" : v.verification.ok === null ? "skipped" : "unresolved",
      httpStatus: v.verification.httpStatus,
      contentType: v.verification.contentType,
      checkedAt: new Date().toISOString(),
    })),
  };

  for (const type of ["characters", "locations", "episodes", "series"]) {
    const rows = manifest.entities.filter((x) => x.entityType === type);
    manifest.summary[type] = {
      total: rows.length,
      resolved: rows.filter((x) => x.resolvedSource).length,
      unresolved: rows.filter((x) => !x.resolvedSource).length,
      verified: rows.filter((x) => x.verificationStatus === "verified").length,
      broken: rows.filter((x) => x.verificationStatus === "broken").length,
      byMethod: Object.fromEntries(
        [...new Set(rows.map((x) => x.resolutionMethod))].map((m) => [m, rows.filter((x) => x.resolutionMethod === m).length]),
      ),
    };
  }

  await writeFile(new URL("media-manifest.json", OUT), JSON.stringify(manifest, null, 2) + "\n");
  console.log(JSON.stringify(manifest.summary, null, 2));

  const broken = manifest.entities.filter((x) => x.verificationStatus === "broken");
  if (broken.length) {
    console.log(`\n${broken.length} broken/unreachable asset(s):`);
    for (const b of broken.slice(0, 30)) console.log(`  [${b.entityType}] ${b.id} (${b.name}) -> ${b.httpStatus ?? "?"} ${b.resolvedSource}`);
    // A real URL that stopped resolving is exactly the "asset silently disappeared" case this
    // manifest exists to catch - fail the run so it can gate a deploy/CI step, same convention
    // as scripts/audit-atlas.mjs.
    process.exitCode = 1;
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
