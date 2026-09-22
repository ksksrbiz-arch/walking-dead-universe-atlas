#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";

const ROOT = new URL("../", import.meta.url);
const DIR = new URL("data/enrichment/", ROOT);

async function readJson(name) {
  return JSON.parse(await readFile(new URL(name, DIR), "utf8"));
}

function byStatus(records) {
  return records.reduce((acc, item) => {
    const status = item.match?.status || "unknown";
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
}

function matchScoreBuckets(records) {
  const buckets = {
    "1.00": 0,
    "0.98": 0,
    "0.95": 0,
    "0.72-0.94": 0,
    "0.00": 0
  };

  for (const item of records) {
    const score = Number(item.match?.score || 0);
    if (score >= 0.995) buckets["1.00"] += 1;
    else if (score >= 0.98) buckets["0.98"] += 1;
    else if (score >= 0.95) buckets["0.95"] += 1;
    else if (score >= 0.72) buckets["0.72-0.94"] += 1;
    else buckets["0.00"] += 1;
  }

  return buckets;
}

function seriesBreakdown(records) {
  const counts = {};

  for (const item of records) {
    const seriesId = item.candidate?.fields?.seriesId || "unknown";
    const status = item.match?.status || "unknown";

    counts[seriesId] ||= { total: 0, matched: 0, unmatched: 0 };
    counts[seriesId].total += 1;
    if (status === "matched") counts[seriesId].matched += 1;
    else counts[seriesId].unmatched += 1;
  }

  return counts;
}

function topUnmatched(records, limit = 50) {
  return records
    .filter((item) => item.match?.status !== "matched")
    .slice(0, limit)
    .map((item) => ({
      sourceRecordId: item.candidate?.sourceRecordId,
      name: item.candidate?.name,
      seriesId: item.candidate?.fields?.seriesId,
      category: item.candidate?.fields?.category,
      sourceUrl: item.candidate?.sourceUrl
    }));
}

function pageCoverage(pageResult) {
  const pages = pageResult.pages || [];
  const withInfobox = pages.filter((page) => page.infoboxes?.length);
  const withImage = pages.filter((page) => page.image);
  const withExtract = pages.filter((page) => page.extract);
  const withHints = pages.filter((page) => Object.keys(page.hints || {}).length);

  return {
    requested: pageResult.requested,
    fetched: pageResult.fetched,
    errors: pageResult.errors?.length || 0,
    infoboxCoverage: pages.length ? withInfobox.length / pages.length : 0,
    imageCoverage: pages.length ? withImage.length / pages.length : 0,
    extractCoverage: pages.length ? withExtract.length / pages.length : 0,
    hintCoverage: pages.length ? withHints.length / pages.length : 0
  };
}

async function main() {
  const candidates = await readJson("fandom-atlas-candidates.json");
  const pages = await readJson("fandom-page-enrichment.json");
  const canonical = {
    characters: await readJson(new URL("../characters.json", DIR).pathname),
    locations: await readJson(new URL("../locations.json", DIR).pathname),
    episodes: await readJson(new URL("../episodes.json", DIR).pathname)
  };

  const entities = ["characters", "locations", "episodes"];
  const summary = {};

  for (const key of entities) {
    const candidateResult = candidates[key];
    const pageResult = pages[key];
    const records = candidateResult.records || [];

    const matchedCanonicalIds = new Set(
      records
        .map((item) => item.match?.canonicalId)
        .filter(Boolean)
    );
    const unmatched = records
      .filter((item) => item.match?.status !== "matched")
      .map((item) => ({
        sourceRecordId: item.candidate?.sourceRecordId,
        name: item.candidate?.name,
        seriesId: item.candidate?.fields?.seriesId,
        category: item.candidate?.fields?.category,
        sourceUrl: item.candidate?.sourceUrl,
        reason: item.match?.reasons?.[0] || "unmatched"
      }));

    summary[key] = {
      candidates: candidateResult.sourceRecords,
      matched: candidateResult.matched,
      unmatched: candidateResult.unmatched,
      canonicalEntities: canonical[key].length,
      canonicalMatched: matchedCanonicalIds.size,
      canonicalUnmatched: Math.max(0, canonical[key].length - matchedCanonicalIds.size),
      canonicalCoverage: canonical[key].length ? matchedCanonicalIds.size / canonical[key].length : 0,
      matchStatuses: byStatus(records),
      matchScoreBuckets: matchScoreBuckets(records),
      seriesBreakdown: seriesBreakdown(records),
      topUnmatched: unmatched.slice(0, 50),
      reviewQueueCount: unmatched.length,
      pageCoverage: pageCoverage(pageResult)
    };
  }

  const report = {
    generatedAt: new Date().toISOString(),
    source: "walking-dead-wiki",
    summary
  };

  const reviewQueue = {
    generatedAt: report.generatedAt,
    source: report.source,
    policy: "unmatched Fandom records are review-only and must not overwrite canonical Atlas data",
    characters: summary.characters.reviewQueueCount,
    locations: summary.locations.reviewQueueCount,
    episodes: summary.episodes.reviewQueueCount,
    records: Object.fromEntries(
      entities.map((key) => [key, (candidates[key].records || [])
        .filter((item) => item.match?.status !== "matched")
        .map((item) => ({
          sourceRecordId: item.candidate?.sourceRecordId,
          name: item.candidate?.name,
          seriesId: item.candidate?.fields?.seriesId,
          category: item.candidate?.fields?.category,
          sourceUrl: item.candidate?.sourceUrl,
          match: item.match || null
        }))])
    )
  };

  await writeFile(
    new URL("fandom-enrichment-review-queue.json", DIR),
    JSON.stringify(reviewQueue, null, 2) + "\\n"
  );

  await writeFile(
    new URL("fandom-enrichment-audit.json", DIR),
    JSON.stringify(report, null, 2) + "\n"
  );

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
