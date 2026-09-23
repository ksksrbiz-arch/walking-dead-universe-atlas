import { list, get } from "@vercel/blob";
import { getCache } from "@vercel/functions";

export const BLOB_MEDIA_PREFIX = "twdu-atlas-media/";
export const BLOB_DATA_PREFIX = "twdu-atlas-data/";

export function json(value: unknown, init: ResponseInit = {}) {
  return Response.json(value, {
    ...init,
    headers: {
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      ...(init.headers || {}),
    },
  });
}

export function requireMethod(req: Request, methods: string[]) {
  if (!methods.includes(req.method)) {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { Allow: methods.join(", ") },
    });
  }
  return null;
}

export async function cachedJson<T>(key: string, loader: () => Promise<T>, ttl = 300): Promise<T> {
  const cache = getCache();
  const hit = await cache.get(key) as T | null;
  if (hit !== null && hit !== undefined) return hit;
  const value = await loader();
  await cache.set(key, value, { ttl });
  return value;
}

export async function findBlob(pathname: string, prefix: string) {
  const result = await list({ prefix: prefix + pathname, limit: 1 });
  return result.blobs[0] || null;
}

export async function readBlobJson<T>(pathname: string): Promise<T | null> {
  const blob = await findBlob(pathname, BLOB_DATA_PREFIX);
  if (!blob) return null;
  const result = await get(blob.url, { access: "private" });
  if (!result) return null;
  return JSON.parse(await result.text()) as T;
}
