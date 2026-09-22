#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { sourceRecord, summarizeMatches } from "./lib/enrichment.mjs";

const API = "https://walkingdead.fandom.com/api.php";
const REQUEST_RETRIES = Number(process.env.FANDOM_REQUEST_RETRIES || 4);
const REQUEST_DELAY_MS = Number(process.env.FANDOM_REQUEST_DELAY_MS || 150);
const WIKI = "https://walkingdead.fandom.com/wiki/";
const ROOT = new URL("../", import.meta.url);
const OUT_DIR = new URL("data/enrichment/", ROOT);

const SOURCES = {
  character: {
    "twd": "Category:TV Series Characters",
    "ftwd": "Category:Fear the Walking Dead Characters",
    "wb": "Category:World Beyond Characters",
    "tales": "Category:Tales of the Walking Dead Characters",
    "dead": "Category:Dead City Characters",
    "daryl": "Category:Daryl Series Characters",
    "owl": "Category:The Ones Who Live Characters",
    "webisodes": "Category:Webisode Characters"
  },
  location: {
    "twd": "Category:TV Series Locations",
    "ftwd": "Category:Fear the Walking Dead Locations",
    "wb": "Category:World Beyond Locations",
    "tales": "Category:Tales of the Walking Dead Locations",
    "dead": "Category:Dead City Locations",
    "daryl": "Category:Daryl Series Locations",
    "owl": "Category:The Ones Who Live Locations",
    "webisodes": "Category:Webisode Locations"
  },
  episode: {
    "twd": "Category:TV Series Episodes",
    "ftwd": "Category:Fear the Walking Dead Episodes",
    "wb": "Category:World Beyond Episodes",
    "tales": "Category:Tales of the Walking Dead Episodes",
    "dead": "Category:Dead City Episodes",
    "daryl": "Category:Daryl Dixon Episodes",
    "owl": "Category:The Ones Who Live Episodes",
    "webisodes": "Category:Webisode Episodes"
  }
};

async function readJson(name) {
  return JSON.parse(await readFile(new URL("data/" + name, ROOT), "utf8"));
}

async function fetchJson(url) {
  let lastError = null;
  for (let attempt = 1; attempt <= REQUEST_RETRIES; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          accept: "application/json",
          "user-agent": "TWDU-Atlas-Fandom-Ingest/2.0 (+https://github.com/ksksrbiz-arch/walking-dead-universe-atlas)",
          "accept-language": "en-US,en;q=0.8"
        },
        signal: AbortSignal.timeout(30000)
      });
      const text = await response.text();
      if (!response.ok) {
        const retryable = response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500;
        const error = new Error(response.status + " " + response.statusText + ": " + text.slice(0, 500));
        if (!retryable || attempt === REQUEST_RETRIES) throw error;
        const retryAfter = Number(response.headers.get("retry-after") || 0);
        await new Promise((resolve) => setTimeout(resolve, retryAfter > 0 ? retryAfter * 1000 : Math.min(10000, 750 * 2 ** (attempt - 1))));
        continue;
      }
      return JSON.parse(text);
    } catch (error) {
      lastError = error;
      if (attempt === REQUEST_RETRIES) break;
      await new Promise((resolve) => setTimeout(resolve, Math.min(10000, 750 * 2 ** (attempt - 1))));
    }
  }
  throw lastError || new Error("Fandom request failed");
}

async function fetchCategory(category, limit) {
  const rows = [];
  let continuation = null;

  do {
    const params = new URLSearchParams({
      action: "query",
      list: "categorymembers",
      cmtitle: category,
      cmnamespace: "0",
      cmtype: "page",
      cmlimit: String(Math.min(500, Math.max(1, limit - rows.length))),
      format: "json",
      formatversion: "2"
    });
    if (continuation) params.set("cmcontinue", continuation);

    const payload = await fetchJson(API + "?" + params.toString());
    rows.push(...(payload?.query?.categorymembers ?? []));
    continuation = payload?.continue?.cmcontinue;
  } while (continuation && rows.length < limit);

  return rows.slice(0, limit);
}

async function ingestType(entityType, canonicalFile, limit) {
  const canonical = await readJson(canonicalFile);
  const all = [];
  const errors = [];

  for (const [seriesId, category] of Object.entries(SOURCES[entityType])) {
    try {
      const pages = await fetchCategory(category, limit);
      for (const page of pages) {
        all.push(sourceRecord({
          sourceId: "walking-dead-wiki",
          sourceRecordId: page.pageid,
          entityType,
          name: page.title,
          sourceUrl: WIKI + encodeURIComponent(page.title.replaceAll(" ", "_")),
          fields: {
            category,
            seriesId,
            namespace: page.ns,
            pageId: page.pageid
          }
        }));
      }
    } catch (error) {
      errors.push({
        seriesId,
        category,
        error: error?.message || String(error)
      });
      await new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY_MS));
    }
  }

  const deduped = [...new Map(all.map((record) => [
    record.sourceRecordId + ":" + record.entityType,
    record
  ])).values()];

  const matchFields = entityType === "episode" ? ["title", "name"] : ["name"];
  const matches = summarizeMatches(deduped, canonical, matchFields);

  return {
    entityType,
    source: "walking-dead-wiki",
    generatedAt: new Date().toISOString(),
    sourceRecords: deduped.length,
    matched: matches.filter((x) => x.match.status === "matched").length,
    unmatched: matches.filter((x) => x.match.status === "unmatched").length,
    errors,
    records: matches
  };
}

async function main() {
  const limit = Number(process.env.ENRICHMENT_LIMIT || 5000);
  await mkdir(OUT_DIR, { recursive: true });

  const result = {
    generatedAt: new Date().toISOString(),
    limit,
    characters: await ingestType("character", "characters.json", limit),
    locations: await ingestType("location", "locations.json", limit),
    episodes: await ingestType("episode", "episodes.json", limit)
  };

  await writeFile(
    new URL("fandom-atlas-candidates.json", OUT_DIR),
    JSON.stringify(result, null, 2) + "\n"
  );

  console.log(JSON.stringify({
    characters: result.characters.sourceRecords,
    locations: result.locations.sourceRecords,
    episodes: result.episodes.sourceRecords,
    errors: [
      ...result.characters.errors,
      ...result.locations.errors,
      ...result.episodes.errors
    ]
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
