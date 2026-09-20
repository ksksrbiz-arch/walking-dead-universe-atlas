import { getAtlasStore } from "../lib/blob-store.mts";
import type { Config } from "@netlify/functions";

type WarmResult = { source: string; status: number; ok: boolean; checkedAt: string };

const VERSION = "4";
const STATE_KEY = `runtime/media-warm-state-v${VERSION}`;
const RESULTS_KEY = `runtime/media-warm-results-v${VERSION}`;

export default async () => {
  const store = getAtlasStore("atlas-runtime");
  const manifest = await store.get(`runtime/manifest-v${VERSION}`, { type: "json" }) as any;
  if (!manifest) return;

  const sources = new Set<string>();
  for (const item of Object.values(manifest.media?.media?.series ?? {}) as any[]) if (item?.keyArt) sources.add(item.keyArt);
  for (const item of Object.values(manifest.media?.media?.places ?? {}) as any[]) if (item?.image) sources.add(item.image);
  for (const item of Object.values(manifest.media?.media?.characters ?? {}) as any[]) if (item?.image) sources.add(item.image);
  for (const item of Object.values(manifest.media?.media?.episodes ?? {}) as any[]) if (item?.image) sources.add(item.image);
  for (const item of Object.values(manifest.media?.episodeMedia?.episodes ?? {}) as any[]) if (item?.image) sources.add(item.image);

  const ordered = [...sources].sort();
  const priorState = await store.get(STATE_KEY, { type: "json" }) as any;
  const priorResults = await store.get(RESULTS_KEY, { type: "json" }) as Record<string, WarmResult> | null;
  const results: Record<string, WarmResult> = priorResults && typeof priorResults === "object" ? priorResults : {};

  let cursor = Number(priorState?.cursor ?? 0);
  if (!Number.isFinite(cursor) || cursor < 0 || cursor >= ordered.length) cursor = 0;

  const batchSize = Math.min(250, ordered.length);
  const targets = Array.from({ length: batchSize }, (_, i) => ordered[(cursor + i) % ordered.length]);
  const checkedAt = new Date().toISOString();

  const settled = await Promise.allSettled(targets.map(async source => {
    const base = Netlify.env.get("URL") || "https://walking-dead-universe-atlas.netlify.app";
    const u = new URL("/.netlify/images", base);
    u.searchParams.set("url", source);
    u.searchParams.set("w", "1200");
    u.searchParams.set("q", "78");
    const response = await fetch(u);
    return { source, status: response.status, ok: response.ok, checkedAt };
  }));

  settled.forEach((result, index) => {
    const source = targets[index];
    results[source] = result.status === "fulfilled"
      ? result.value
      : { source, status: 0, ok: false, checkedAt };
  });

  const nextCursor = ordered.length ? (cursor + targets.length) % ordered.length : 0;
  const successful = Object.values(results).filter(x => x.ok).length;
  const failed = Object.values(results).length - successful;

  await store.setJSON(RESULTS_KEY, results);
  await store.setJSON(STATE_KEY, {
    version: VERSION,
    updatedAt: checkedAt,
    cursor: nextCursor,
    batchSize: targets.length,
    totalSources: ordered.length,
    verifiedSources: successful,
    failedSources: failed,
    coveragePercent: ordered.length ? Number(((Object.keys(results).length / ordered.length) * 100).toFixed(1)) : 100,
    complete: Object.keys(results).length >= ordered.length,
    lastBatch: targets,
  });
};

export const config: Config = {
  schedule: "0 */6 * * *",
};
