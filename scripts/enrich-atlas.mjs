#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { sourceRecord, summarizeMatches } from "./lib/enrichment.mjs";

const ROOT = new URL("../", import.meta.url);
const DATA = (name) => new URL("data/" + name, ROOT);
const OUT_DIR = new URL("data/enrichment/", ROOT);

const SOURCES = {
  fandom: {
    id: "walking-dead-wiki",
    apiUrl: "https://walkingdead.fandom.com/api.php"
  },
  walkingDeadApi: {
    id: "walking-dead-api",
    baseUrl: "https://thewalkingdead-api.onrender.com"
  }
};

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "TWDU-Atlas-Enrichment/1.0"
    },
    signal: AbortSignal.timeout(15000)
  });
  const text = await response.text();
  if (!response.ok) throw new Error(response.status + " " + response.statusText + ": " + text.slice(0, 300));
  return JSON.parse(text);
}

async function probeUrl(url) {
  const started = Date.now();
  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: {
        accept: "application/json,text/plain,text/html;q=0.8,*/*;q=0.5",
        "user-agent": "TWDU-Atlas-Enrichment/1.0"
      },
      signal: AbortSignal.timeout(12000)
    });
    const body = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      finalUrl: response.url,
      contentType: response.headers.get("content-type"),
      elapsedMs: Date.now() - started,
      sample: body.slice(0, 500)
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      finalUrl: url,
      elapsedMs: Date.now() - started,
      error: error?.message || String(error)
    };
  }
}

async function probeSources() {
  const probes = [
    ["walking-dead-api", SOURCES.walkingDeadApi.baseUrl],
    ["walking-dead-api-api", SOURCES.walkingDeadApi.baseUrl + "/api"],
    ["walking-dead-api-characters", SOURCES.walkingDeadApi.baseUrl + "/characters"],
    ["walking-dead-api-docs", SOURCES.walkingDeadApi.baseUrl + "/swagger"],
    [
      "walking-dead-wiki-api",
      SOURCES.fandom.apiUrl + "?action=query&meta=siteinfo&format=json"
    ]
  ];

  const results = [];
  for (const [sourceId, url] of probes) {
    results.push({ sourceId, url, result: await probeUrl(url) });
  }

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(
    new URL("source-health.json", OUT_DIR),
    JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2) + "\n"
  );
  return results;
}

async function fetchCategoryMembers(category, limit = 500) {
  const pages = [];
  let continuation = null;

  do {
    const params = new URLSearchParams({
      action: "query",
      list: "categorymembers",
      cmtitle: category,
      cmnamespace: "0",
      cmlimit: String(Math.min(limit - pages.length, 500)),
      format: "json",
      formatversion: "2"
    });

    if (continuation) params.set("cmcontinue", continuation);

    const payload = await fetchJson(SOURCES.fandom.apiUrl + "?" + params.toString());
    pages.push(...(payload?.query?.categorymembers ?? []));
    continuation = payload?.continue?.cmcontinue;
  } while (continuation && pages.length < limit);

  return pages.slice(0, limit);
}

async function ingestFandomCharacters(limit = 1000) {
  const categories = [
    "Category:TV Series Characters",
    "Category:Fear the Walking Dead Characters",
    "Category:World Beyond Characters",
    "Category:Tales of the Walking Dead Characters",
    "Category:Dead City Characters",
    "Category:Daryl Series Characters",
    "Category:The Ones Who Live Characters",
    "Category:Webisode Characters"
  ];

  const records = [];

  for (const category of categories) {
    let pages = [];
    try {
      pages = await fetchCategoryMembers(category, limit);
    } catch (error) {
      records.push(sourceRecord({
        sourceId: SOURCES.fandom.id,
        sourceRecordId: "error:" + category,
        entityType: "character-source-error",
        name: category,
        sourceUrl: SOURCES.fandom.apiUrl,
        fields: { error: error?.message || String(error) }
      }));
      continue;
    }

    for (const page of pages) {
      records.push(sourceRecord({
        sourceId: SOURCES.fandom.id,
        sourceRecordId: page.pageid,
        entityType: "character",
        name: page.title,
        sourceUrl: "https://walkingdead.fandom.com/wiki/" + encodeURIComponent(page.title.replaceAll(" ", "_")),
        fields: {
          category,
          namespace: page.ns,
          pageId: page.pageid
        }
      }));
    }
  }

  const characters = await readJson(DATA("characters.json"));
  const matched = summarizeMatches(records, characters, ["name"]);

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(
    new URL("fandom-character-candidates.json", OUT_DIR),
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      source: SOURCES.fandom.id,
      total: matched.length,
      matched: matched.filter((x) => x.match.status === "matched").length,
      review: matched.filter((x) => x.match.status !== "matched").length,
      records: matched
    }, null, 2) + "\n"
  );

  return matched;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const results = {};

  if (args.has("--probe") || args.size === 0) {
    results.probes = await probeSources();
  }

  if (args.has("--fandom-characters")) {
    const limit = Number(process.env.ENRICHMENT_LIMIT || 1000);
    results.fandomCharacters = await ingestFandomCharacters(limit);
  }

  if (!results.probes && !results.fandomCharacters) {
    console.log("Usage: node scripts/enrich-atlas.mjs --probe --fandom-characters");
    return;
  }

  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    probes: results.probes?.length ?? 0,
    fandomCharacterCandidates: results.fandomCharacters?.length ?? 0
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
