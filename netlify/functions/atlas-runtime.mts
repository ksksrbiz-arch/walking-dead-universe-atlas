import type { Config } from "@netlify/functions";
import { getRuntimeCollection, getRuntimeEntity, getRuntimeIndex, getRuntimeManifest, RUNTIME_VERSION } from "../lib/atlas-runtime.mts";

const cacheHeaders = {
  "content-type": "application/json; charset=utf-8",
  "Netlify-CDN-Cache-Control": "public, durable, max-age=300, stale-while-revalidate=3600",
  "cache-control": "public, max-age=60, stale-while-revalidate=300",
  "x-atlas-runtime-version": RUNTIME_VERSION,
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: cacheHeaders });
}

export default async (req: Request) => {
  if (req.method !== "GET") return json({ error: "Method not allowed." }, 405);
  try {
    const url = new URL(req.url);
    const resource = url.searchParams.get("resource") ?? "meta";
    const kind = url.searchParams.get("kind");
    const id = url.searchParams.get("id");

    if (resource === "meta") {
      const manifest = await getRuntimeManifest();
      return json({ version: manifest.version, generatedAt: manifest.generatedAt, counts: manifest.counts });
    }

    if (resource === "manifest") return json(await getRuntimeManifest());

    if (resource === "collection" && kind) {
      const collection = await getRuntimeCollection(kind);
      if (!collection) return json({ error: "Unknown collection." }, 404);
      return json({ kind, items: collection });
    }

    if (resource === "entity" && kind && id) {
      const entity = await getRuntimeEntity(kind, id);
      if (!entity) return json({ error: "Entity not found." }, 404);
      return json({ kind, entity });
    }

    if (resource === "index") {
      const manifest = await getRuntimeManifest();
      const indexName = url.searchParams.get("name");
      if (!indexName || !(indexName in manifest.indexes)) return json({ error: "Unknown index." }, 404);
      return json({ name: indexName, ids: (manifest.indexes as any)[indexName] });
    }

    if (resource === "relationships" && kind && id) {
      const indexNames: Record<string, string[]> = {
        character: ["episodesByCharacter"],
        location: ["episodesByLocation"],
        community: ["episodesByCommunity"],
        faction: ["episodesByFaction"],
        connection: ["episodesByConnection"],
        series: ["episodesBySeries"],
        season: ["episodesBySeason"],
      };
      const episodeIds = new Set<string>();
      for (const indexName of indexNames[kind] ?? []) {
        for (const episodeId of await getRuntimeIndex(indexName, id)) episodeIds.add(episodeId);
      }
      const manifest = await getRuntimeManifest();
      const curated = manifest.curated as any;
      if (kind === "character") for (const episodeId of curated.characterEpisodes?.episodesByCharacter?.[id] ?? []) episodeIds.add(episodeId);
      if (kind === "location") for (const episodeId of curated.locationEpisodes?.episodesByLocation?.[id] ?? []) episodeIds.add(episodeId);
      return json({ kind, id, episodeIds: [...episodeIds] });
    }

    return json({ error: "Unknown resource." }, 400);
  } catch (error) {
    return json({ error: "Atlas runtime unavailable.", detail: error instanceof Error ? error.message : String(error) }, 500);
  }
};

export const config: Config = {
  path: "/api/atlas/runtime",
};
