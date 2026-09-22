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
  "jonathan-beale": ["Johnathan Beale (The Ones Who Live)", "Johnathan Beale", "Major General Beale"],
  "mason-beale": ["Mason Beale (World Beyond)", "Mason Beale"],
  // Location identities whose Fandom page titles include universe/region disambiguation.
  "atlanta": ["Atlanta, Georgia (TV Universe)"],
  "king-county": ["King County, Georgia (TV Universe)"],
  "los-angeles": ["Los Angeles, California"],
  "cdc-atlanta": ["Center for Disease Control (TV Universe)"],
  "hershel-farm": ["Greene Family Farm (TV Series)"]
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

function canonicalMatchEvidence(page, canonical) {
  const titleKey = normalizeName(page?.page?.title || "");
  const canonicalKey = normalizeName(canonical?.name || "");
  const curated = CURATED_ALIASES[canonical.id] || [];
  const canonicalAliases = Array.isArray(canonical.aliases) ? canonical.aliases : [];

  if (titleKey && titleKey === canonicalKey) return "exact-canonical-name";
  if (curated.some((alias) => titleKey === normalizeName(alias))) return "exact-curated-fandom-title";
  if (canonicalAliases.some((alias) => titleKey === normalizeName(alias))) return "exact-canonical-alias";

  const pageKeys = buildKeys(page);
  if (curated.some((alias) => pageKeys.has(normalizeName(alias)))) return "curated-page-alias";
  if (canonicalAliases.some((alias) => pageKeys.has(normalizeName(alias)))) return "canonical-page-alias";

  return null;
}

function reconcileRecord(record, page, canonicals) {
  if (record.match?.status === "matched") return record.match;

  if (!page?.page?.title) return record.match;

  const evidence = canonicals
    .map((canonical) => ({ canonical, reason: canonicalMatchEvidence(page, canonical) }))
    .filter((item) => item.reason);

  const compatible = evidence.filter(({ canonical }) => seriesCompatible(record.candidate, canonical));

  // Exact page identity is preferred over inferred aliases. A page such as
  // "Johnathan Beale" must never be collapsed into a generic "Beale" identity,
  // especially when a distinct Mason Beale canonical record exists.
  if (compatible.length === 1) {
    return {
      status: "matched",
      score: compatible[0].reason.startsWith("exact-") ? 1 : 0.97,
      canonicalId: compatible[0].canonical.id,
      reasons: [`fandom-${compatible[0].reason}`]
    };
  }

  if (compatible.length > 1) {
    return {
      status: "ambiguous",
      score: 0,
      reasons: ["multiple-canonical-identity-matches"],
      candidateCanonicalIds: compatible.map((match) => match.canonical.id)
    };
  }

  // If Fandom's series classification is inconsistent, allow only a unique
  // exact page identity. Never use a generic surname or fuzzy identity here.
  if (evidence.length === 1 && evidence[0].reason.startsWith("exact-")) {
    return {
      status: "matched",
      score: 0.97,
      canonicalId: evidence[0].canonical.id,
      reasons: ["fandom-unique-exact-title"]
    };
  }

  if (evidence.length > 1) {
    return {
      status: "ambiguous",
      score: 0,
      reasons: ["multiple-canonical-identity-matches"],
      candidateCanonicalIds: evidence.map((match) => match.canonical.id)
    };
  }

  return record.match;
}

