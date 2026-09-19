#!/usr/bin/env node
/**
 * Bulk-ingest official AMC episode imagery into data/episodeMedia.json.
 *
 * Strategy:
 * 1. Discover episode URLs from AMC's canonical /episodes catalog.
 * 2. Recursively crawl AMC sitemap indexes when available.
 * 3. Keep only the seven core TWDU series.
 * 4. Fetch each episode page and extract its canonical/OG image.
 * 5. Match by series + season + episode number.
 * 6. Preserve explicit provenance; never invent an image URL.
 *
 * This script is intentionally resilient: an AMC outage or an individual
 * missing page should not prevent the Vite build from completing.
 */

import { readFile, writeFile } from "node:fs/promises";

const BASE = "https://www.amc.com";
const CATALOG = `${BASE}/episodes`;
const SITEMAPS = [
  `${BASE}/sitemap.xml`,
  `${BASE}/sitemap_index.xml`,
  `${BASE}/sitemap-index.xml`,
  `${BASE}/sitemap/sitemap.xml`
];
const MANIFEST = "data/episodeMedia.json";

const SERIES_SLUGS = {
  twd: "the-walking-dead",
  ftwd: "fear-the-walking-dead",
  wb: "the-walking-dead-world-beyond",
  tales: "tales-of-the-walking-dead",
  owl: "the-walking-dead-the-ones-who-live",
  daryl: "the-walking-dead-daryl-dixon",
  dead: "the-walking-dead-dead-city"
};

const SLUG_TO_SERIES = Object.fromEntries(
  Object.entries(SERIES_SLUGS).map(([id, slug]) => [slug, id])
);



const SERIES_PAGES = Object.fromEntries(
  Object.entries(SERIES_SLUGS).map(([id, slug]) => [id, BASE + "/shows/" + slug])
);

async function discoverSeriesPageUrls() {
  const out = new Set();
  for (const slug of Object.values(SERIES_SLUGS)) {
    const page = BASE + "/shows/" + slug;
    try {
      const html = await fetchText(page);
      for (const url of discoverUrls(html)) out.add(url);
    } catch {}
  }
  return [...out];
}

const SLUG_ALIASES = {
  "the-walking-dead-rick-and-michonne": "owl"
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function stripHtml(value = "") {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isCoreEpisodeUrl(value) {
  try {
    const url = new URL(value);
    if (url.hostname !== "www.amc.com") return false;
    if (!url.pathname.includes("/shows/") || !url.pathname.includes("/episodes/")) {
      return false;
    }

    const parts = url.pathname.split("/shows/")[1]?.split("/") ?? [];
    const slug = parts[0] ?? "";
    return Boolean(SLUG_TO_SERIES[slug] || SLUG_ALIASES[slug]);
  } catch {
    return false;
  }
}

function discoverUrls(html) {
  const out = new Set();
  const patterns = [
    /href=["'](\/shows\/[^"'#?]*\/episodes\/[^"'#?]*)["']/gi,
    /https?:\/\/www\.amc\.com\/shows\/[^"'\s<]+\/episodes\/[^"'\s<]*/gi,
    /\/shows\/[^"'\s<]+\/episodes\/[^"'\s<]*/gi
  ];

  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const href = match[1] || match[0];
      try {
        const url = new URL(href, BASE).href;
        if (isCoreEpisodeUrl(url)) out.add(url);
      } catch {
        // Ignore malformed links.
      }
    }
  }

  return [...out];
}

function discoverSitemapEntries(xml) {
  const urls = new Set();

  for (const match of xml.matchAll(/<loc>\s*(.*?)\s*<\/loc>/gis)) {
    const url = match[1].trim();
    urls.add(url);
  }

  return [...urls];
}

async function discoverSitemapTree(rootUrl, seen = new Set()) {
  if (seen.has(rootUrl)) return [];
  seen.add(rootUrl);

  let xml;
  try {
    xml = await fetchText(rootUrl);
  } catch (error) {
    console.warn("Sitemap discovery failed:", rootUrl, error?.message || error);
    return [];
  }

  const entries = discoverSitemapEntries(xml);
  const episodeUrls = new Set();
  const childSitemaps = [];

  for (const entry of entries) {
    if (isCoreEpisodeUrl(entry)) {
      episodeUrls.add(entry);
    } else if (/\.xml(?:\?|$)/i.test(entry)) {
      childSitemaps.push(entry);
    }
  }

  for (const child of childSitemaps) {
    for (const url of await discoverSitemapTree(child, seen)) {
      episodeUrls.add(url);
    }
  }

  return [...episodeUrls];
}

function identify(url, html, manifest) {
  const match = url.match(
    /https?:\/\/www\.amc\.com\/shows\/([^/]+)\/episodes\/[^?#]*/i
  );
  if (!match) return null;

  const slug = match[1];
  const seriesId = SLUG_TO_SERIES[slug] || SLUG_ALIASES[slug];
  if (!seriesId) return null;

  const text = stripHtml(html);
  const seasonEpisode =
    text.match(/\bS(\d{1,2})\s*,?\s*E(\d{1,2})\b/i) ||
    text.match(/\bSeason\s*(\d{1,2})\D{0,20}\bEpisode\s*(\d{1,2})\b/i);

  if (!seasonEpisode) return null;

  return {
    seriesId,
    season: Number(seasonEpisode[1]),
    episode: Number(seasonEpisode[2])
  };
}

function extractMetaContent(html, propertyOrName) {
  const escaped = propertyOrName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${escaped}["']`, "i"),
    new RegExp(`<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${escaped}["']`, "i")
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return match[1];
  }

  return null;
}

function extractImage(html) {
  const image =
    extractMetaContent(html, "og:image") ||
    extractMetaContent(html, "twitter:image");

  if (!image) return null;

  try {
    return new URL(image, BASE).href;
  } catch {
    return null;
  }
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  const response = await fetch(url, {
    headers: {
      "user-agent": "TWDU-Atlas-media-ingestor/1.0",
      accept: "text/html,application/xml,text/xml;q=0.9,*/*;q=0.8"
    },
    signal: controller.signal
  });
  clearTimeout(timeout);

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  return response.text();
}

function findManifestEpisode(manifest, id) {
  return Object.entries(manifest.episodes).find(([, episode]) =>
    episode.seriesId === id.seriesId &&
    episode.seasonId === `${id.seriesId}-s${String(id.season).padStart(2, "0")}` &&
    episode.episodeNumber === id.episode
  )?.[0];
}

async function main() {
  const manifest = JSON.parse(await readFile(MANIFEST, "utf8"));
  const urlsSet = new Set();

  for (const url of await discoverSeriesPageUrls()) urlsSet.add(url);

  try {
    const catalog = await fetchText(CATALOG);
    for (const url of discoverUrls(catalog)) urlsSet.add(url);
  } catch (error) {
    console.warn("AMC catalog discovery failed:", error?.message || error);
  }

  for (const sitemap of SITEMAPS) {
    for (const url of await discoverSitemapTree(sitemap)) {
      urlsSet.add(url);
    }
  }

  const urls = [...urlsSet];
  console.log(`Discovered ${urls.length} AMC TWDU episode pages from catalog/sitemaps.`);

  let verified = 0;
  let failed = 0;
  let matched = 0;
  const queue = [...urls];

  const workers = Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const url = queue.shift();
      if (!url) break;

      try {
        const html = await fetchText(url);
        const id = identify(url, html, manifest);
        if (!id) continue;

        const key = findManifestEpisode(manifest, id);
        if (!key) continue;

        matched++;
        if (manifest.episodes[key]?.status === "verified" && manifest.episodes[key]?.image) continue;

        const image = extractImage(html);
        if (image) {
          manifest.episodes[key] = {
            ...manifest.episodes[key],
            status: "verified",
            image,
            sourcePage: url,
            source: "amc",
            verifiedAt: new Date().toISOString()
          };
          verified++;
        }

        await sleep(75);
      } catch (error) {
        failed++;
        console.warn("Media fetch failed:", url, error?.message || error);
      }
    }
  });

  await Promise.all(workers);

  manifest.updatedAt = new Date().toISOString();
  manifest.coverage = Object.keys(manifest.episodes).length;
  manifest.verified = Object.values(manifest.episodes).filter(
    (episode) => episode.status === "verified"
  ).length;

  await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");

  console.log(
    `Matched ${matched}; verified this run ${verified}; failed ${failed}; total verified now ${manifest.verified}/${manifest.coverage}.`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
