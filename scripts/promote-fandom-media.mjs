#!/usr/bin/env node
/**
 * Promote verified Fandom page imagery into the Atlas media manifest.
 *
 * Policy:
 * - Only pages already reconciled to one canonical entity are promoted.
 * - Keep Fandom provenance and the original image URL.
 * - Never overwrite an existing approved image from another source.
 * - Fandom media is enrichment, not a runtime dependency.
 */
import { readFile, writeFile } from "node:fs/promises";

const ROOT = new URL("../", import.meta.url);
const ENRICH = new URL("data/enrichment/", ROOT);
const DATA = new URL("data/", ROOT);

async function readJson(url) {
  return JSON.parse(await readFile(url, "utf8"));
}

function normalizeImageText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function imageCandidates(page) {
  const candidates = [
    ...(Array.isArray(page?.details?.imageFiles)
      ? page.details.imageFiles.flatMap((item) => [
          item?.url ? { url: item.url, label: item.title, kind: "file" } : null,
          item?.thumbnail ? { url: item.thumbnail, label: item.title, kind: "thumbnail" } : null
        ])
      : []),
    ...(Array.isArray(page?.hints?.imageGallery)
      ? page.hints.imageGallery.map((url) => ({ url, label: "", kind: "gallery" }))
      : []),
    page?.image?.original?.source
      ? { url: page.image.original.source, label: page.image.fileName, kind: "primary" }
      : page?.image?.original
        ? { url: page.image.original, label: page.image.fileName, kind: "primary" }
        : null,
    page?.image?.thumbnail?.source
      ? { url: page.image.thumbnail.source, label: page.image.fileName, kind: "thumbnail" }
      : page?.image?.thumbnail
        ? { url: page.image.thumbnail, label: page.image.fileName, kind: "thumbnail" }
        : null,
    Array.isArray(page?.hints?.image)
      ? page.hints.image.map((url) => ({ url, label: "", kind: "hint" }))
      : page?.hints?.image
        ? { url: page.hints.image, label: "", kind: "hint" }
        : null
  ].filter((item) => item?.url && /^https?:\/\//i.test(String(item.url)));

  const title = normalizeImageText(page?.page?.title || "");
  const titleTokens = title
    .split(" ")
    .filter((token) => token.length >= 3 && !["tv", "universe", "series", "the"].includes(token));

  const score = (item) => {
    const haystack = normalizeImageText([item.label, item.url].filter(Boolean).join(" "));
    let value = item.kind === "file" ? 30 : item.kind === "gallery" ? 24 : item.kind === "primary" ? 18 : 10;
    const matched = titleTokens.filter((token) => haystack.includes(token));
    value += matched.length * 18;
    if (titleTokens.length && matched.length === titleTokens.length) value += 35;
    if (/\b(?:logo|title card|titlecard|key art|keyart|series art|franchise)\b/.test(haystack)) value -= 40;
    if (/\b(?:promo|poster)\b/.test(haystack) && matched.length === 0) value -= 15;
    return value;
  };

  const deduped = new Map();
  for (const item of candidates) {
    const url = String(item.url);
    const existing = deduped.get(url);
    if (!existing || score(item) > score(existing)) deduped.set(url, item);
  }

  return [...deduped.values()]
    .sort((a, b) => score(b) - score(a))
    .map((item) => item.url);
}

async function main() {
  const media = await readJson(new URL("media.json", DATA));
  const enrichment = await readJson(new URL("fandom-page-enrichment.json", ENRICH));
  const candidates = await readJson(new URL("fandom-atlas-candidates.json", ENRICH));
  let galleryManifest = null;
  try { galleryManifest = await readJson(new URL("fandom-gallery-media.json", ENRICH)); } catch {}

  const canonicals = {
    characters: await readJson(new URL("characters.json", DATA)),
    locations: await readJson(new URL("locations.json", DATA)),
    episodes: await readJson(new URL("episodes.json", DATA))
  };

  const normalize = (value) => String(value || "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const exactCanonicalId = (entityKey, title) => {
    const key = normalize(title);
    if (!key) return null;
    const matches = (canonicals[entityKey] || []).filter((item) => normalize(item.name) === key);
    return matches.length === 1 ? matches[0].id : null;
  };

  const keys = [
    ["characters", "characters"],
    ["locations", "places"],
    ["episodes", "episodes"]
  ];

  const stats = { promoted: 0, existing: 0, galleryAdded: 0, skipped: 0 };

  for (const [entityKey, mediaKey] of keys) {
    media[mediaKey] ||= {};

    const candidateMap = new Map(
      (candidates[entityKey]?.records || []).map((record) => [
        String(record.candidate?.sourceRecordId || ""),
        record
      ])
    );

    for (const page of enrichment[entityKey]?.pages || []) {
      const sources = imageCandidates(page);
      const source = sources[0] || null;
      const candidate = candidateMap.get(String(page.sourceRecordId));
      // Prefer the reconciled match. If reconciliation missed a page but the Fandom
      // title exactly equals one canonical Atlas entity, use that identity only.
      // This is deliberately exact-name matching: no fuzzy promotion of imagery.
      const canonicalId = page.candidate?.canonicalId || candidate?.match?.canonicalId || exactCanonicalId(mediaKey === "places" ? "locations" : entityKey, page.page?.title);
      const reconciled = page.candidate?.matchStatus === "matched" || candidate?.match?.status === "matched";
      const exactTitleMatch = Boolean(exactCanonicalId(mediaKey === "places" ? "locations" : entityKey, page.page?.title));

      if (!sources.length || !canonicalId || (!reconciled && !exactTitleMatch)) {
        stats.skipped += 1;
        continue;
      }

      const existing = media[mediaKey][canonicalId];
      if (existing?.image) {
        const gallery = new Set(existing.gallery || []);
        for (const candidateSource of sources) gallery.add(candidateSource);
        const nextGallery = [...gallery].slice(0, 12);
        if (nextGallery.length !== (existing.gallery || []).length) {
          media[mediaKey][canonicalId] = { ...existing, gallery: nextGallery };
          stats.galleryAdded += Math.max(0, nextGallery.length - (existing.gallery || []).length);
        } else {
          stats.existing += 1;
        }
        continue;
      }

      media[mediaKey][canonicalId] = {
        ...(existing || {}),
        kind: mediaKey === "characters" ? "character-portrait" : mediaKey === "places" ? "location-image" : "episode-image",
        image: source,
        gallery: sources.slice(0, 12),
        sourcePage: page.sourceUrl || page.page?.canonicalUrl || null,
        source: "walking-dead-fandom",
        provenance: {
          pageId: page.page?.pageId || Number(page.sourceRecordId) || null,
          pageTitle: page.page?.title || null,
          revisionId: page.revision?.revisionId || null,
          retrievedAt: page.retrievedAt || null
        }
      };
      stats.promoted += 1;
    }
  }

  if (galleryManifest?.records?.length) {
    for (const record of galleryManifest.records) {
      const baseTitle = String(record.title || "").replace(/\/Gallery$/i, "").trim();
      const entityKey = record.categories?.some((x) => /location/i.test(x)) ? "locations"
        : record.categories?.some((x) => /episode/i.test(x)) ? "episodes"
        : record.categories?.some((x) => /character|series galleries/i.test(x)) ? "characters"
        : null;
      if (!entityKey) continue;
      const canonicalId = exactCanonicalId(entityKey, baseTitle);
      if (!canonicalId) continue;
      const sources = [
        ...(record.media || []).map((item) => item?.url).filter(Boolean),
        ...(record.directUrls || [])
      ];
      if (!sources.length) continue;
      const mediaKey = entityKey === "locations" ? "places" : entityKey;
      media[mediaKey] ||= {};
      const existing = media[mediaKey][canonicalId] || {};
      const gallery = new Set(existing.gallery || []);
      for (const source of sources) gallery.add(source);
      const next = [...gallery];
      media[mediaKey][canonicalId] = {
        ...existing,
        gallery: next.slice(0, 100),
        galleryMediaCount: next.length,
        gallerySourcePage: record.sourceUrl || existing.gallerySourcePage || null
      };
      if (!existing.image) {
        media[mediaKey][canonicalId].image = next[0] || null;
        media[mediaKey][canonicalId].source = existing.source || "walking-dead-fandom-gallery";
      }
    }
  }

  media.version = 4;
  media.policy = "Prefer official AMC/AMC Networks media. Verified Fandom page imagery may be used as attributed enrichment when no approved official asset exists. Preserve provenance and never overwrite an existing approved image.";
  media.updatedAt = new Date().toISOString();

  await writeFile(new URL("media.json", DATA), JSON.stringify(media, null, 2) + "\n");
  console.log(JSON.stringify(stats, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
