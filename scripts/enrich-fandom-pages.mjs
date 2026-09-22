#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const API = "https://walkingdead.fandom.com/api.php";
const WIKI = "https://walkingdead.fandom.com/wiki/";
const ROOT = new URL("../", import.meta.url);
const OUT_DIR = new URL("data/enrichment/", ROOT);

const BATCH_SIZE = 50;
const DEFAULT_LIMIT = 5000;
const REVISION_CONCURRENCY = Number(process.env.FANDOM_REVISION_CONCURRENCY || 8);
const REQUEST_DELAY_MS = Number(process.env.FANDOM_REQUEST_DELAY_MS || 50);

const ENTITY_CONFIG = {
  character: {
    inputKey: "characters",
    matchFields: ["name"],
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
    matchFields: ["name"],
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
    matchFields: ["title", "name"],
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
      "user-agent": "TWDU-Atlas-Fandom-Page-Enrichment/2.0"
    },
    signal: AbortSignal.timeout(30000)
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(response.status + " " + response.statusText + ": " + text.slice(0, 500));
  }
  return JSON.parse(text);
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

function extractCategoryNames(categories = []) {
  return categories
    .map((item) => item.title || "")
    .filter(Boolean)
    .map((title) => title.replace(/^Category:/, ""));
}

function buildPageUrl(title) {
  return WIKI + encodeURIComponent(title.replaceAll(" ", "_"));
}

function candidateMap(result) {
  const map = new Map();
  for (const record of result?.records || []) {
    const id = String(record.candidate?.sourceRecordId || "");
    if (id) map.set(id, record);
  }
  return map;
}

async function fetchPageMetadata(pageIds) {
  const params = new URLSearchParams({
    action: "query",
    pageids: pageIds.join("|"),
    prop: "info|categories|pageimages",
    inprop: "url",
    cllimit: "max",
    piprop: "name|original|thumbnail",
    pithumbsize: "1200",
    redirects: "1",
    format: "json",
    formatversion: "2"
  });

  return fetchJson(API + "?" + params.toString());
}

async function fetchPageRevision(pageId) {
  const params = new URLSearchParams({
    action: "query",
    pageids: String(pageId),
    prop: "revisions",
    rvprop: "ids|timestamp|content",
    rvslots: "main",
    rvlimit: "1",
    format: "json",
    formatversion: "2"
  });

  const payload = await fetchJson(API + "?" + params.toString());
  return payload?.query?.pages?.[0] || null;
}

function flattenPage(page, entityType, candidate, revisionPage = null) {
  const revision = revisionPage?.revisions?.[0] || {};
  const wikitext = revision.slots?.main?.content || "";
  const infoboxes = wikitext ? findInfoboxes(wikitext) : [];

  return {
    entityType,
    sourceId: "walking-dead-wiki",
    sourceRecordId: String(page.pageid),
    sourceUrl: page.fullurl || buildPageUrl(page.title),
    retrievedAt: new Date().toISOString(),
    page: {
      pageId: page.pageid,
      title: page.title,
      namespace: page.ns,
      touched: page.touched || null,
      canonicalUrl: page.canonicalurl || page.fullurl || buildPageUrl(page.title),
      fullUrl: page.fullurl || buildPageUrl(page.title),
      redirect: page.redirect || false
    },
    revision: revision.revid
      ? {
          revisionId: revision.revid,
          parentId: revision.parentid || null,
          timestamp: revision.timestamp || null
        }
      : null,
    image: page.original || page.thumbnail || page.pageimage
      ? {
          fileName: page.pageimage || null,
          original: page.original || null,
          thumbnail: page.thumbnail?.source || null,
          width: page.original?.width || page.thumbnail?.width || null,
          height: page.original?.height || page.thumbnail?.height || null
        }
      : null,
    categories: extractCategoryNames(page.categories),
    templates: infoboxes.map((template) => template.name),
    infoboxes,
    hints: buildHints(entityType, infoboxes),
    candidate: candidate
      ? {
          canonicalId: candidate.match?.canonicalId || null,
          matchStatus: candidate.match?.status || "unmatched",
          matchScore: candidate.match?.score || 0,
          matchReasons: candidate.match?.reasons || [],
          seriesId: candidate.candidate?.fields?.seriesId || null,
          category: candidate.candidate?.fields?.category || null
        }
      : null,
    raw: wikitext
      ? {
          wikitext,
          hash: sha256(wikitext)
        }
      : null
  };
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let next = 0;

  async function run() {
    while (true) {
      const index = next++;
      if (index >= items.length) return;

      try {
        results[index] = await worker(items[index], index);
      } catch (error) {
        results[index] = {
          error: error?.message || String(error),
          item: items[index]
        };
      }

      if (REQUEST_DELAY_MS) await sleep(REQUEST_DELAY_MS);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => run())
  );

  return results;
}

async function enrichEntityType(entityType, result, limit) {
  const config = ENTITY_CONFIG[entityType];
  const records = [...new Map(
    (result[config.inputKey]?.records || [])
      .map((record) => [String(record.candidate?.sourceRecordId || ""), record])
      .filter(([id]) => id)
  ).values()].slice(0, limit);

  const pages = [];
  const errors = [];

  for (let offset = 0; offset < records.length; offset += BATCH_SIZE) {
    const batch = records.slice(offset, offset + BATCH_SIZE);
    const pageIds = batch.map((record) => Number(record.candidate.sourceRecordId)).filter(Number.isInteger);

    if (!pageIds.length) continue;

    try {
      const payload = await fetchPageMetadata(pageIds);
      for (const page of payload?.query?.pages || []) {
        pages.push({
          page,
          candidate: candidateMap(result[config.inputKey]).get(String(page.pageid))
        });
      }
    } catch (error) {
      errors.push({ pageIds, stage: "metadata", error: error?.message || String(error) });
    }
  }

  const matchedPages = pages.filter((item) => item.candidate?.match?.status === "matched");

  const revisions = await mapWithConcurrency(
    matchedPages,
    REVISION_CONCURRENCY,
    async ({ page, candidate }) => ({
      pageId: page.pageid,
      revisionPage: await fetchPageRevision(page.pageid),
      candidate
    })
  );

  const revisionMap = new Map();
  for (const item of revisions) {
    if (item?.error) {
      errors.push({
        pageId: item.item?.page?.pageid || null,
        stage: "revision",
        error: item.error
      });
      continue;
    }
    revisionMap.set(String(item.pageId), item.revisionPage);
  }

  const enriched = pages.map(({ page, candidate }) =>
    flattenPage(page, entityType, candidate, revisionMap.get(String(page.pageid)) || null)
  );

  return {
    entityType,
    source: "walking-dead-wiki",
    generatedAt: new Date().toISOString(),
    requested: records.length,
    metadataFetched: pages.length,
    matchedForRevision: matchedPages.length,
    revisionsFetched: revisionMap.size,
    errors,
    pages: enriched
  };
}

async function main() {
  const limit = Number(process.env.ENRICHMENT_LIMIT || DEFAULT_LIMIT);
  const input = await readJson(new URL("fandom-atlas-candidates.json", OUT_DIR));

  await mkdir(OUT_DIR, { recursive: true });

  const result = {
    generatedAt: new Date().toISOString(),
    source: "walking-dead-wiki",
    api: API,
    limit,
    characters: await enrichEntityType("character", input, limit),
    locations: await enrichEntityType("location", input, limit),
    episodes: await enrichEntityType("episode", input, limit)
  };

  await writeFile(
    new URL("fandom-page-enrichment.json", OUT_DIR),
    JSON.stringify(result, null, 2) + "\n"
  );

  await writeFile(
    new URL("fandom-page-enrichment-summary.json", OUT_DIR),
    JSON.stringify({
      generatedAt: result.generatedAt,
      source: result.source,
      limit,
      summary: {
        characters: {
          requested: result.characters.requested,
          metadataFetched: result.characters.metadataFetched,
          matchedForRevision: result.characters.matchedForRevision,
          revisionsFetched: result.characters.revisionsFetched,
          errors: result.characters.errors.length
        },
        locations: {
          requested: result.locations.requested,
          metadataFetched: result.locations.metadataFetched,
          matchedForRevision: result.locations.matchedForRevision,
          revisionsFetched: result.locations.revisionsFetched,
          errors: result.locations.errors.length
        },
        episodes: {
          requested: result.episodes.requested,
          metadataFetched: result.episodes.metadataFetched,
          matchedForRevision: result.episodes.matchedForRevision,
          revisionsFetched: result.episodes.revisionsFetched,
          errors: result.episodes.errors.length
        }
      }
    }, null, 2) + "\n"
  );

  console.log(JSON.stringify({
    characters: result.characters,
    locations: result.locations,
    episodes: result.episodes
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
