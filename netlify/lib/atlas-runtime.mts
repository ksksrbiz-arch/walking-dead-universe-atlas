import { getAtlasStore } from "./blob-store.mts";
import series from "../../data/series.json";
import seasons from "../../data/seasons.json";
import episodes from "../../data/episodes.json";
import locations from "../../data/locations.json";
import characters from "../../data/characters.json";
import communities from "../../data/communities.json";
import factions from "../../data/factions.json";
import connections from "../../data/connections.json";
import characterEpisodes from "../../data/characterEpisodes.json";
import locationEpisodes from "../../data/locationEpisodes.json";
import connectionEpisodes from "../../data/connectionEpisodes.json";
import media from "../../data/media.json";
import episodeMedia from "../../data/episodeMedia.json";

export const RUNTIME_VERSION = "4";
export const runtimeStore = getAtlasStore("atlas-runtime");

type EntityRecord = { id: string; [key: string]: unknown };
type IndexMap = Record<string, string[]>;

const asRecords = (value: unknown): EntityRecord[] => Array.isArray(value) ? value as EntityRecord[] : [];
const indexBy = (records: EntityRecord[], field: string): IndexMap => {
  const out: IndexMap = {};
  for (const record of records) {
    const value = record[field];
    if (typeof value === "string" && value) (out[value] ??= []).push(record.id);
  }
  return out;
};
const indexByArray = (records: EntityRecord[], field: string): IndexMap => {
  const out: IndexMap = {};
  for (const record of records) {
    const values = record[field];
    if (!Array.isArray(values)) continue;
    for (const value of values) {
      if (typeof value === "string" && value) (out[value] ??= []).push(record.id);
    }
  }
  return out;
};

export async function getRuntimeManifest() {
  const key = `runtime/manifest-v${RUNTIME_VERSION}`;
  const existing = await runtimeStore.get(key, { type: "json" }) as any;
  const sourceUpdatedAt = [
    (characterEpisodes as any).updatedAt,
    (locationEpisodes as any).updatedAt,
    (connectionEpisodes as any).updatedAt,
    (episodeMedia as any).updatedAt,
  ].filter(Boolean).join("|");

  if (existing?.version === RUNTIME_VERSION && existing?.sourceUpdatedAt === sourceUpdatedAt) {
    return existing;
  }

  const episodeRecords = asRecords(episodes);
  const locationRecords = asRecords(locations);
  const characterRecords = asRecords(characters);
  const communityRecords = asRecords(communities);
  const factionRecords = asRecords(factions);
  const connectionRecords = asRecords(connections);

  const manifest = {
    version: RUNTIME_VERSION,
    generatedAt: new Date().toISOString(),
    sourceUpdatedAt,
    counts: {
      series: asRecords(series).length,
      seasons: asRecords(seasons).length,
      episodes: episodeRecords.length,
      locations: locationRecords.length,
      characters: characterRecords.length,
      communities: communityRecords.length,
      factions: factionRecords.length,
      connections: connectionRecords.length,
    },
    indexes: {
      episodesBySeries: indexBy(episodeRecords, "seriesId"),
      episodesBySeason: indexBy(episodeRecords, "seasonId"),
      episodesByLocation: indexByArray(episodeRecords, "locationIds"),
      episodesByCharacter: indexByArray(episodeRecords, "characterIds"),
      episodesByCommunity: indexByArray(episodeRecords, "communityIds"),
      episodesByFaction: indexByArray(episodeRecords, "factionIds"),
      episodesByConnection: indexByArray(episodeRecords, "connectionIds"),
      charactersByEpisode: indexByArray(characterRecords, "episodeIds"),
      locationsByEpisode: indexByArray(locationRecords, "episodeIds"),
    },
    curated: {
      characterEpisodes,
      locationEpisodes,
      connectionEpisodes,
    },
    media: {
      episodeMedia,
      media,
    },
  };

  await runtimeStore.setJSON(key, manifest);

  // Persist the hot path as small, independently readable blobs. The manifest
  // remains the build/runtime snapshot, while entity and relationship reads do
  // not need to download the entire atlas graph.
  const indexEntries = Object.entries(manifest.indexes) as [string, IndexMap][];
  await Promise.all(indexEntries.flatMap(([indexName, index]) =>
    Object.entries(index).map(([entityId, ids]) =>
      runtimeStore.setJSON(`runtime/index-v${RUNTIME_VERSION}/${indexName}/${encodeURIComponent(entityId)}`, ids)
    )
  ));

  const entityCollections: Record<string, EntityRecord[]> = {
    series: asRecords(series),
    seasons: asRecords(seasons),
    episodes: episodeRecords,
    locations: locationRecords,
    characters: characterRecords,
    communities: communityRecords,
    factions: factionRecords,
    connections: connectionRecords,
  };
  await Promise.all(Object.entries(entityCollections).flatMap(([kind, records]) =>
    records.map(record =>
      runtimeStore.setJSON(`runtime/entity-v${RUNTIME_VERSION}/${kind}/${encodeURIComponent(record.id)}`, record)
    )
  ));

  await runtimeStore.setJSON(`runtime/meta-v${RUNTIME_VERSION}`, {
    version: RUNTIME_VERSION,
    generatedAt: manifest.generatedAt,
    sourceUpdatedAt,
    counts: manifest.counts,
  });
  return manifest;
}

export async function getRuntimeCollection(kind: string) {
  const manifest = await getRuntimeManifest();
  const collections: Record<string, unknown> = {
    series, seasons, episodes, locations, characters, communities, factions, connections,
  };
  return collections[kind] ?? null;
}

export async function getRuntimeEntity(kind: string, id: string) {
  const direct = await runtimeStore.get(
    `runtime/entity-v${RUNTIME_VERSION}/${kind}/${encodeURIComponent(id)}`,
    { type: "json" },
  );
  if (direct) return direct;
  const collection = await getRuntimeCollection(kind);
  if (!Array.isArray(collection)) return null;
  return (collection as EntityRecord[]).find(item => item.id === id) ?? null;
}

export async function getRuntimeIndex(indexName: string, id: string): Promise<string[]> {
  const direct = await runtimeStore.get(
    `runtime/index-v${RUNTIME_VERSION}/${indexName}/${encodeURIComponent(id)}`,
    { type: "json" },
  ) as string[] | null;
  if (Array.isArray(direct)) return direct;
  const manifest = await getRuntimeManifest();
  const index = (manifest.indexes as Record<string, IndexMap>)[indexName];
  return Array.isArray(index?.[id]) ? index[id] : [];
}
