#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { normalizeName } from "./lib/enrichment.mjs";

const ROOT = new URL("../", import.meta.url);
const DIR = new URL("data/enrichment/", ROOT);
const DATA = new URL("data/", ROOT);

async function readJson(url) {
  return JSON.parse(await readFile(url, "utf8"));
}

const CURATED_ALIASES = {
  "jadis-stokes": ["Anne (TV Universe)", "Jadis Stokes"],
  "paul-rovia": ["Paul Rovia (TV Universe)", "Jesus"],
  "alpha": ["Alpha (TV Universe)", "Dee"],
  "edwin-jenner": ["Edwin Jenner (TV Universe)", "Dr. Edwin Jenner"],
  "andrea-harrison": ["Andrea (TV Series)", "Andrea Harrison (TV Series)"],
  "princess-juanita-sanchez": ["Juanita Sanchez (TV Series)", "Princess"],
  "mercer": ["Michael Mercer (TV Series)", "Mercer"],
  "nick-clark": ["Nick Clark (TV Series)", "Nicholas Clark (Fear)"],
  "laurent": ["Laurent Carrière (Daryl Series)", "Laurent Carrière"],
  "genet": ["Marion Genet (Daryl Series)", "Marion Genet"],
  "jonathan-beale": ["Johnathan Beale (The Ones Who Live)", "Major General Beale"]
};

function seriesCompatible(candidate, canonical) {
  const candidateSeries = candidate?.fields?.seriesId;
  if (!candidateSeries) return true;
  const values = Array.isArray(canonical?.seriesIds)
    ? canonical.seriesIds
    : [canonical?.seriesId];
  const normalized = values.filter(Boolean);
  return !normalized.length || normalized.includes(candidateSeries);
}

function buildKeys(page) {
  const keys = new Set();
  const title = page?.page?.title;
  if (title) keys.add(normalizeName(title));
  const aliases = page?.hints?.aliases;
  if (aliases) {
    for (const alias of String(aliases).split(/[,;•|]/).map((v) => normalizeName(v)).filter(Boolean)) {
      keys.add(alias);
    }
  }
  return keys;
}

function reconcileRecord(record, page, canonicals) {
  if (record.match?.status === "matched") return record.match;

  const keys = buildKeys(page);
  if (!keys.size) return record.match;

  const matches = canonicals.filter((canonical) => {
    if (!seriesCompatible(record.candidate, canonical)) return false;
    const curated = CURATED_ALIASES[canonical.id] || [];
    return keys.has(normalizeName(canonical.name)) ||
      curated.some((alias) => keys.has(normalizeName(alias))) ||
      (Array.isArray(canonical.aliases) && canonical.aliases.some((alias) => keys.has(normalizeName(alias))));
  });

  // If the Fandom page title uniquely identifies one canonical entity,
  // allow a series-agnostic exact-title reconciliation. This handles
  // Fandom category inconsistencies without introducing fuzzy matches.
  const uniqueTitleMatches = canonicals.filter((canonical) => {
    const curated = CURATED_ALIASES[canonical.id] || [];
    return keys.has(normalizeName(canonical.name)) ||
      curated.some((alias) => keys.has(normalizeName(alias))) ||
      (Array.isArray(canonical.aliases) && canonical.aliases.some((alias) => keys.has(normalizeName(alias))));
  });
  if (uniqueTitleMatches.length === 1 && matches.length === 0) {
    return {
      status: "matched",
      score: 0.97,
      canonicalId: uniqueTitleMatches[0].id,
      reasons: ["fandom-unique-title"]
    };
  }

  if (matches.length === 1) {
    return {
      status: "matched",
      score: 0.97,
      canonicalId: matches[0].id,
      reasons: ["fandom-page-alias"]
    };
  }

  if (matches.length > 1) {
    return {
      status: "ambiguous",
      score: 0,
      reasons: ["multiple-canonical-alias-matches"],
      candidateCanonicalIds: matches.map((match) => match.id)
    };
  }

  return record.match;
}

async function main() {
  const candidates = await readJson(new URL("fandom-atlas-candidates.json", DIR));
  const pages = await readJson(new URL("fandom-page-enrichment.json", DIR));

  const configs = [
    ["characters", "characters.json"],
    ["locations", "locations.json"],
    ["episodes", "episodes.json"]
  ];

  const stats = {};

  for (const [key, file] of configs) {
    const canonicals = await readJson(new URL(file, DATA));
    const pageMap = new Map((pages[key]?.pages || []).map((page) => [String(page.sourceRecordId), page]));
    let aliasMatched = 0;
    let ambiguous = 0;

    for (const record of candidates[key].records || []) {
      if (record.match?.status === "matched") continue;

      const page = pageMap.get(String(record.candidate?.sourceRecordId));
      const nextMatch = reconcileRecord(record, page, canonicals);

      if (nextMatch?.status === "matched") aliasMatched += 1;
      if (nextMatch?.status === "ambiguous") ambiguous += 1;

      record.match = nextMatch;
      if (page) {
        page.candidate = {
          ...(page.candidate || {}),
          canonicalId: nextMatch?.canonicalId || null,
          matchStatus: nextMatch?.status || "unmatched",
          matchScore: nextMatch?.score || 0,
          matchReasons: nextMatch?.reasons || []
        };
      }
    }

    stats[key] = { aliasMatched, ambiguous };
  }

  await writeFile(new URL("fandom-atlas-candidates.json", DIR), JSON.stringify(candidates, null, 2) + "\n");
  await writeFile(new URL("fandom-page-enrichment.json", DIR), JSON.stringify(pages, null, 2) + "\n");

  console.log(JSON.stringify(stats, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
