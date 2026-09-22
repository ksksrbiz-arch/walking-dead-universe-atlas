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

function imageSource(page) {
  return page?.image?.original || page?.image?.thumbnail || null;
}

async function main() {
  const media = await readJson(new URL("media.json", DATA));
  const enrichment = await readJson(new URL("fandom-page-enrichment.json", ENRICH));
  const candidates = await readJson(new URL("fandom-atlas-candidates.json", ENRICH));

  const keys = [
    ["characters", "characters"],
    ["locations", "places"],
    ["episodes", "episodes"]
  ];

  const stats = { promoted: 0, existing: 0, skipped: 0 };

  for (const [entityKey, mediaKey] of keys) {
    media[mediaKey] ||= {};

    const candidateMap = new Map(
      (candidates[entityKey]?.records || []).map((record) => [
        String(record.candidate?.sourceRecordId || ""),
        record
      ])
    );

    for (const page of enrichment[entityKey]?.pages || []) {
      const source = imageSource(page);
      const candidate = candidateMap.get(String(page.sourceRecordId));
      const canonicalId = page.candidate?.canonicalId || candidate?.match?.canonicalId;

      if (!source || !canonicalId || page.candidate?.matchStatus !== "matched" && candidate?.match?.status !== "matched") {
        stats.skipped += 1;
        continue;
      }

      const existing = media[mediaKey][canonicalId];
      if (existing?.image) {
        stats.existing += 1;
        continue;
      }

      media[mediaKey][canonicalId] = {
        ...(existing || {}),
        kind: mediaKey === "characters" ? "character-portrait" : mediaKey === "places" ? "location-image" : "episode-image",
        image: source,
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

  media.version = 3;
  media.policy = "Prefer official AMC/AMC Networks media. Verified Fandom page imagery may be used as attributed enrichment when no approved official asset exists. Preserve provenance and never overwrite an existing approved image.";
  media.updatedAt = new Date().toISOString();

  await writeFile(new URL("media.json", DATA), JSON.stringify(media, null, 2) + "\n");
  console.log(JSON.stringify(stats, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
