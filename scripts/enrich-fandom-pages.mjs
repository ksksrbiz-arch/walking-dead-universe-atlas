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
      firstAppearance: ["first", "first_appearance", "first appearance", "debut", "tvfirst", "fearfirst", "towlfirst", "osfirst"],
      lastAppearance: ["last", "last_appearance", "last appearance", "tvlast", "fearlast", "towllast", "oslast"],
      occupation: ["occupation", "occupations"],
      affiliation: ["affiliation", "affiliations", "group", "groups", "community", "communities"],
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
      firstAppearance: ["first", "first_appearance", "first appearance", "debut", "tvfirst", "fearfirst", "towlfirst", "osfirst"],
      lastAppearance: ["last", "last_appearance", "last appearance", "tvlast", "fearlast", "towllast", "oslast"],
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
  const acceptedNames = new Set([
    "infobox",
    "character info",
    "character infobox",
    "location info",
    "location infobox",
    "episode info",
    "episode infobox",
    "episode"
  ]);

  return extractBalancedTemplates(wikitext)
    .map(parseTemplate)
    .filter((template) =>
      acceptedNames.has(template.normalizedName) ||
      /(^| )infobox( |$)/i.test(template.normalizedName) ||
      /^(character|location|episode) (info|infobox)$/i.test(template.normalizedName)
    );
}

function getHintValue(parameters, aliases) {
  for (const alias of aliases) {
    const key = normalizeKey(alias);
    if (parameters[key]?.value) return parameters[key].value;
  }
  return null;
}

function extractImageUrls(wikitext, infoboxes) {
  const urls = new Set();
  const add = (value) => {
    if (!value) return;
    const text = String(value)
      .replace(/\\[\\[([^\\]|]+)\\|[^\\]]+\\]\\]/g, "$1")
      .replace(/<[^>]+>/g, " ");
    for (const match of text.matchAll(/https?:\\/\\/[^\\s\\]<>|}]+/gi)) {
      const url = match[0].replace(/[),.;]+$/, "");
      if (/\\.(?:jpe?g|png|webp|gif)(?:[?#].*)?$/i.test(url)) urls.add(url);
    }
  };
  for (const infobox of infoboxes) {
    for (const [key, parameter] of Object.entries(infobox.parameters)) {
      if (/image|photo|poster|portrait|file/.test(key)) add(parameter.raw);
    }
  }
  add(wikitext);
  return [...urls].slice(0, 20);
}

function buildHints(entityType, infoboxes, wikitext = "") {
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

  const gallery = extractImageUrls(wikitext, infoboxes);
  if (gallery.length) hints.imageGallery = gallery;
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

async function fetchRevisions(revids) {
  if (!revids.length) return [];

  const params = new URLSearchParams({
    action: "query",
    revids: revids.join("|"),
    prop: "revisions",
    rvprop: "ids|timestamp|content",
    rvslots: "main",
    format: "json",
    formatversion: "2"
  });

  const payload = await fetchJson(API + "?" + params.toString());
  return (payload?.query?.pages || []).filter((page) => !page.missing);
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
function extractLeadText(wikitext) {
  const lead = String(wikitext || "").split(/\n\s*==[^=][^=]*==/i)[0];
  return cleanValue(
    lead
      .replace(/^\s*#redirect[^\n]*/i, "")
      .replace(/\[\[Category:[^\]]+\]\]/gi, "")
      .slice(0, 5000)
  );
}

function flattenPage(page, revision, entityType, candidate) {
  const wikitext = revision?.slots?.main?.content || "";
  const infoboxes = findInfoboxes(wikitext);

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
      lastRevisionId: page.lastrevid || revision?.revid || null,
      canonicalUrl: page.canonicalurl || page.fullurl || buildPageUrl(page.title),
      fullUrl: page.fullurl || page.canonicalurl || buildPageUrl(page.title),
      redirect: page.redirect || false
    },
    revision: {
      revisionId: revision?.revid || page.lastrevid || null,
      parentId: revision?.parentid || null,
      timestamp: revision?.timestamp || null
    },
    image: page.original || page.thumbnail || page.pageimage
      ? {
          fileName: page.pageimage || null,
          original: page.original || null,
          thumbnail: page.thumbnail?.source || null,
          width: page.original?.width || page.thumbnail?.width || null,
          height: page.original?.height || page.thumbnail?.height || null
        }
      : null,
    extract: extractLeadText(wikitext),
    templates: infoboxes.map((template) => template.name),
    infoboxes,
    hints: buildHints(entityType, infoboxes, wikitext),
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
    raw: {
      wikitext,
      hash: sha256(wikitext)
    }
  };
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

  const summary = {
    characters: {
      requested: result.characters.requested,
      fetched: result.characters.fetched,
      errors: result.characters.errors.length,
      batchCount: result.characters.batchCount
    },
    locations: {
      requested: result.locations.requested,
      fetched: result.locations.fetched,
      errors: result.locations.errors.length,
      batchCount: result.locations.batchCount
    },
    episodes: {
      requested: result.episodes.requested,
      fetched: result.episodes.fetched,
      errors: result.episodes.errors.length,
      batchCount: result.episodes.batchCount
    }
  };

  await writeFile(
    new URL("fandom-page-enrichment-summary.json", OUT_DIR),
    JSON.stringify({
      generatedAt: result.generatedAt,
      source: result.source,
      limit,
      summary
    }, null, 2) + "\n"
  );

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
