#!/usr/bin/env node

function applySeriesFallbacks(manifest, media) {
  let fallbackCount = 0;
  for (const [id, episode] of Object.entries(manifest.episodes)) {
    if (episode.status === "verified" && episode.image) continue;
    const series = media.series?.[episode.seriesId];
    if (!series?.keyArt) continue;
    manifest.episodes[id] = {
      ...episode,
      status: "fallback",
      kind: "series-key-art-fallback",
      image: series.keyArt,
      sourcePage: series.sourcePage,
      source: "amc-series-art",
      fallbackForEpisode: true
    };
    fallbackCount++;
  }
  return fallbackCount;
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
  const media = JSON.parse(await readFile(MEDIA, "utf8"));
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

        await sleep(REQUEST_DELAY_MS);
      } catch (error) {
        failed++;
        console.warn("Media fetch failed:", url, error?.message || error);
      }
    }
  });

  await Promise.all(workers);

  const fallbacks = applySeriesFallbacks(manifest, media);

  manifest.updatedAt = new Date().toISOString();
  manifest.coverage = Object.keys(manifest.episodes).length;
  manifest.verified = Object.values(manifest.episodes).filter(
    (episode) => episode.status === "verified"
  ).length;

  await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");

  console.log(
    `Matched ${matched}; verified this run ${verified}; fallbacks applied ${fallbacks}; failed ${failed}; available ${manifest.available}/${manifest.coverage}; verified episode assets ${manifest.verified}/${manifest.coverage}.`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
