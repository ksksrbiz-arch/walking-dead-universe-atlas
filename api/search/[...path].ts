import { list, get } from "@vercel/blob";
import { getCache } from "@vercel/functions";

// Self-contained on purpose (duplicated with api/entity/[...path].ts): Vercel
// runs api/*.ts files individually and its tracer does not reliably include a
// sibling module imported from elsewhere under api/ (confirmed empirically —
// see context/references/journeys-and-sharing.md and
// scripts/check-api-imports.mjs, which now requires every api/*.ts file to be
// import-free of local modules).

const BLOB_DATA_PREFIX = "twdu-atlas-data/";

function json(value: unknown, init: ResponseInit = {}) {
  return Response.json(value, {
    ...init,
    headers: {
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      ...(init.headers || {}),
    },
  });
}

async function cachedJson<T>(key: string, loader: () => Promise<T>, ttl = 300): Promise<T> {
  const cache = getCache();
  const hit = await cache.get(key) as T | null;
  if (hit !== null && hit !== undefined) return hit;
  const value = await loader();
  await cache.set(key, value, { ttl });
  return value;
}

async function findBlob(pathname: string, prefix: string) {
  // Blob list uses prefix matching, not exact-path matching. Require the exact
  // pathname so similarly named JSON files cannot be returned accidentally.
  const expectedPath = prefix + pathname;
  const result = await list({ prefix: expectedPath, limit: 100 });
  return result.blobs.find(blob => blob.pathname === expectedPath) || null;
}

async function readBlobJson<T>(pathname: string): Promise<T | null> {
  const blob = await findBlob(pathname, BLOB_DATA_PREFIX);
  if (!blob) return null;
  const result = await get(blob.url, { access: "private" });
  if (!result?.stream) return null;
  const body = await new Response(result.stream).text();
  return JSON.parse(body) as T;
}

export default async function handler(req: Request) {
  if (req.method !== "GET") return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET" } });
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim().toLowerCase();
  if (q.length < 2) return json({ ok: true, results: [] });
  try {
    const results = await cachedJson("atlas:search:" + encodeURIComponent(q), async () => {
      const index = await readBlobJson<Array<{ id: string; type: string; name: string; description?: string }>>("search-index.json");
      if (!index) return [];
      return index.filter(item => [item.name, item.description, item.id].some(value => String(value || "").toLowerCase().includes(q))).slice(0, 50);
    }, 300);
    return json({ ok: true, results });
  } catch (error) {
    console.error("atlas search error", error);
    return json({ ok: false, results: [], error: "Search service unavailable" }, { status: 503 });
  }
}
