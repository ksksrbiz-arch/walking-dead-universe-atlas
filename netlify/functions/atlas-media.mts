import type { Config } from "@netlify/functions";
import { getRuntimeManifest, RUNTIME_VERSION } from "../lib/atlas-runtime.mts";

export default async () => {
  const manifest = await getRuntimeManifest();
  return new Response(JSON.stringify({
    version: RUNTIME_VERSION,
    generatedAt: manifest.generatedAt,
    episodeMedia: manifest.media.episodeMedia,
    media: manifest.media.media,
  }), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "Netlify-CDN-Cache-Control": "public, durable, max-age=3600, stale-while-revalidate=86400",
      "cache-control": "public, max-age=300, stale-while-revalidate=3600",
      "x-atlas-runtime-version": RUNTIME_VERSION,
    },
  });
};

export const config: Config = {
  path: "/api/atlas/media",
};
