#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const API = "https://walkingdead.fandom.com/api.php";
const WIKI = "https://walkingdead.fandom.com/wiki/";
const ROOT = new URL("../", import.meta.url);
const OUT_DIR = new URL("data/enrichment/", ROOT);

const BATCH_SIZE = 50;
const DEFAULT_LIMIT = 5000;
const REQUEST_DELAY_MS = Number(process.env.FANDOM_REQUEST_DELAY_MS || 100);

const ENTITY_CONFIG = {
  character: {
    inputKey: "characters",
    hintKeys: {
      aliases: ["alias", "aliases", "other_names", "other name", "nickname", "nicknames"],
      actor: ["actor", "portrayed_by", "portrayed by", "portrayer"],
      status: ["status", "death", "died"],
      firstAppearance: ["first", "first_appearance", "first appearance", "debut"],
      lastAppearance: ["last", "last_appearance", "last appearance"],
      occupation: ["occupation", "occupations"],
      affiliation: ["affiliation", "affiliations", "group", "groups"],
      family: ["family", "relatives"],
      relationships: ["relationships", "romances"],
      image: ["image", "image_file", "image file"]
    }
  },
  location: {
    inputKey: "locations",
    hintKeys: {
      type: ["type", "location_type", "location type"],
      region: ["state", "region", "province", "country", "location"],
      status: ["status", "condition"],
      firstAppearance: ["first", "first_appearance", "first appearance", "debut"],
      lastAppearance: ["last", "last_appearance", "last appearance"],
      residents: ["residents", "inhabitants", "population"],
      affiliation: ["affiliation", "affiliations", "community", "communities"],
      coordinates: ["coordinates", "coordinate", "coords", "latitude", "longitude"],
      image: ["image", "image_file", "image file"]
    }
  },
  episode: {
    inputKey: "episodes",
    hintKeys: {
      season: ["season", "season_number", "season number"],
      episodeNumber: ["episode", "episode_number", "episode number", "number"],
      airDate: ["airdate", "air date", "air_date", "original_airdate", "original airdate"],
      director: ["director", "directed_by", "directed by"],
      writer: ["writer", "writers", "written_by", "written by"],
      cast: ["starring", "cast", "guest_starring", "guest starring"],
      locations: ["location", "locations", "filmed_at", "filmed at"],
      previous: ["previous", "previous_episode", "previous episode"],
      next: ["next", "next_episode", "next episode"],
      productionCode: ["production", "production_code", "production code"],
      viewership: ["viewers", "viewership", "rating", "ratings"],
      image: ["image", "image_file", "image file"]
    }
  }
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sha256(value) {
  return createHash("sha256").update(value ?? "").digest("hex");
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "TWDU-Atlas-Fandom-Page-Enrichment/3.0"
    },
    signal: AbortSignal.timeout(30000)
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(response.status + " " + response.statusText + ": " + text.slice(0, 500));
  }

  const payload = JSON.parse(text);
  if (payload?.error) {
    throw new Error(
      (payload.error.code || "api-error") +
      ": " +
      (payload.error.info || "Unknown MediaWiki API error")
    );
  }

  return payload;
}

function splitTopLevel(value, delimiter = "|") {
  const parts = [];
  let start = 0;
  let braces = 0;
  let brackets = 0;

  for (let i = 0; i < value.length; i += 1) {
    const pair = value.slice(i, i + 2);

    if (pair === "{{") {
      braces += 1;
      i += 1;
      continue;
    }

    if (pair === "}}" && braces > 0) {
      braces -= 1;
      i += 1;
      continue;
    }

    if (pair === "[[") {
      brackets += 1;
      i += 1;
      continue;
    }

    if (pair === "]]" && brackets > 0) {
      brackets -= 1;
      i += 1;
      continue;
    }

    if (value[i] === delimiter && braces === 0 && brackets === 0) {
      parts.push(value.slice(start, i));
      start = i + 1;
    }
  }

  parts.push(value.slice(start));
  return parts;
}

function extractBalancedTemplates(wikitext) {
  const templates = [];
  let cursor = 0;

  while (cursor < wikitext.length) {
    const start = wikitext.indexOf("{{", cursor);
    if (start === -1) break;

    let depth = 1;
    let i = start + 2;

    while (i < wikitext.length && depth > 0) {
      const pair = wikitext.slice(i, i + 2);
      if (pair === "{{") {
        depth += 1;
        i += 2;
        continue;
      }
      if (pair === "}}") {
        depth -= 1;
        i += 2;
        continue;
      }
      i += 1;
    }

    if (depth === 0) {
      templates.push(wikitext.slice(start, i));
      cursor = i;
    } else {
      break;
    }
  }

  return templates;
}

function normalizeKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[^a-z0-9 ]+/g, "");
}

function cleanValue(value) {
  let text = String(value || "")
    .replace(/<!--([\s\S]*?)-->/g, " ")
    .replace(/<ref(?: [^>]*)?>[\s\S]*?<\/ref>/gi, " ")
    .replace(/<ref[^>]*\/>/gi, " ")
    .replace(/<[^>]+>/g, " ");

  for (let i = 0; i < 5; i += 1) {
    text = text.replace(/{{[^{}]*}}/g, " ");
  }

  return text
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/'''/g, "")
    .replace(/''/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function parseTemplate(rawTemplate) {
  const inner = rawTemplate.slice(2, -2);
  const parts = splitTopLevel(inner);
  const name = cleanValue(parts.shift() || "");
  const parameters = {};

  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;

    const key = normalizeKey(part.slice(0, eq));
    if (!key) continue;

    const rawValue = part.slice(eq + 1).trim();
    if (!(key in parameters)) {
      parameters[key] = {
        raw: rawValue,
        value: cleanValue(rawValue)
      };
    }
  }

  return {
    name,
    normalizedName: normalizeKey(name),
    parameters
  };
}

function findInfoboxes(wikitext) {
  return extractBalancedTemplates(wikitext)
    .map(parseTemplate)
    .filter((template) =>
      /(^| )infobox( |$)/i.test(template.normalizedName) ||
      /^(character|location|episode) infobox/i.test(template.normalizedName)
    );
}

function getHintValue(parameters, aliases) {
  for (const alias of aliases) {
    const key = normalizeKey(alias);
    if (parameters[key]?.value) return parameters[key].value;
  }
  return null;
}

function buildHints(entityType, infoboxes) {
  const hints = {};
  const config = ENTITY_CONFIG[entityType];

  for (const [hint, aliases] of Object.entries(config.hintKeys)) {
    for (const infobox of infoboxes) {
      const value = getHintValue(infobox.parameters, aliases);
      if (value) {
        hints[hint] = value;
        break;
      }
    }
  }

  return hints;
}

function buildPageUrl(title) {
  return WIKI + encodeURIComponent(title.replaceAll(" ", "_"));
}

async function fetchPageBatch(pageIds) {
  if (!pageIds.length) return [];

  const params = new URLSearchParams({
    action: "query",
    pageids: pageIds.join("|"),
    prop: "info|pageimages",
    inprop: "url",
    piprop: "name|original|thumbnail",
    pithumbsize: "1200",
    redirects: "1",
    format: "json",
    formatversion: "2"
  });

  const payload = await fetchJson(API + "?" + params.toString());
  return (payload?.query?.pages || []).filter(
    (page) => page.ns === 0 && !page.missing
  );
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  async function run() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      try {
        results[index] = await worker(items[index], index);
      } catch (error) {
        results[index] = {
          error: error?.message || String(error),
          item: items[index]
        };
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, Math.max(1, items.length)) },
      () => run()
    )
  );

  return results;
}
async function enrichEntityType(entityType, result, limit) {
  const config = ENTITY_CONFIG[entityType];
  const sourceResult = result[config.inputKey];
  const candidates = sourceResult?.records || [];
  const uniqueCandidates = [...new Map(
    candidates
      .map((record) => [String(record.candidate?.sourceRecordId || ""), record])
      .filter(([id]) => id)
  ).values()].slice(0, limit);

  const batches = [];
  for (let i = 0; i < uniqueCandidates.length; i += BATCH_SIZE) {
    const batch = uniqueCandidates.slice(i, i + BATCH_SIZE);
    batches.push({
      candidates: batch,
      pageIds: batch.map((record) => String(record.candidate.sourceRecordId))
    });
  }

  const errors = [];
  const pagesById = new Map();

  const results = await mapWithConcurrency(batches, 8, async (batch) => {
    const pages = await fetchPageBatch(batch.pageIds);
    const revids = pages
      .map((page) => Number(page.lastrevid))
      .filter((revid) => Number.isInteger(revid) && revid > 0);

    const revisionPages = await fetchRevisions(revids);
    const revisionsByPageId = new Map(
      revisionPages.map((page) => [
        String(page.pageid),
        page.revisions?.[0] || null
      ])
    );

    return pages.map((page) =>
      flattenPage(
        page,
        revisionsByPageId.get(String(page.pageid)),
        entityType,
        batch.candidates.find(
          (record) => String(record.candidate.sourceRecordId) === String(page.pageid)
        )
      )
    );
  });

  for (const batchResult of results) {
    if (batchResult?.error) {
      errors.push({
        pageIds: batchResult.item.pageIds,
        error: batchResult.error
      });
      continue;
    }

    for (const page of batchResult || []) {
      pagesById.set(String(page.sourceRecordId), page);
    }
  }

  if (REQUEST_DELAY_MS > 0) await sleep(REQUEST_DELAY_MS);

  return {
    entityType,
    source: "walking-dead-wiki",
    generatedAt: new Date().toISOString(),
    requested: uniqueCandidates.length,
    fetched: pagesById.size,
    batchCount: batches.length,
    errors,
    pages: [...pagesById.values()]
  };
}

