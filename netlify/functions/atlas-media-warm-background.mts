import { getAtlasStore } from "../lib/blob-store.mts";
import type { Config } from "@netlify/functions";

export default async () => {
  const store = getAtlasStore("atlas-runtime");
  const manifest = await store.get("runtime/manifest-v3", { type: "json" }) as any;
  if (!manifest) return;

  const sources = new Set<string>();
  for (const item of Object.values(manifest.media?.media?.series ?? {}) as any[]) if (item?.keyArt) sources.add(item.keyArt);
  for (const item of Object.values(manifest.media?.media?.places ?? {}) as any[]) if (item?.image) sources.add(item.image);
  for (const item of Object.values(manifest.media?.media?.characters ?? {}) as any[]) if (item?.image) sources.add(item.image);
  for (const item of Object.values(manifest.media?.media?.episodes ?? {}) as any[]) if (item?.image) sources.add(item.image);
  for (const item of Object.values(manifest.media?.episodeMedia?.episodes ?? {}) as any[]) if (item?.image) sources.add(item.image);

  const base = Netlify.env.get("URL") || "https://walking-dead-universe-atlas.netlify.app";
  const targets = [...sources].slice(0, 250);
  const results = await Promise.allSettled(targets.map(async source => {
    const u = new URL("/.netlify/images", base);
    u.searchParams.set("url", source);
    u.searchParams.set("w", "1200");
    u.searchParams.set("q", "78");
    const response = await fetch(u);
    return { source, status: response.status, ok: response.ok };
  }));

  const checked = results.map((result, index) => result.status === "fulfilled"
    ? result.value
    : { source: targets[index], status: 0, ok: false });

  await store.setJSON("runtime/media-warm-state-v3", {
    updatedAt: new Date().toISOString(),
    attempted: checked.length,
    successful: checked.filter(x => x.ok).length,
    failed: checked.filter(x => !x.ok).length,
    results: checked,
  });
};

export const config: Config = {
  schedule: "0 */6 * * *",
};
