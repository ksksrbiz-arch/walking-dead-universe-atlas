import { get, list } from "@vercel/blob";

const MEDIA_CACHE = "public, max-age=86400, stale-while-revalidate=604800";

function validBlobUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      (url.hostname.endsWith(".public.blob.vercel-storage.com") ||
       url.hostname.endsWith(".blob.vercel-storage.com"));
  } catch {
    return false;
  }
}

export default async function handler(req: Request) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  }

  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(req.url).pathname.replace(/^\/api\/media\/?/, ""));
  } catch {
    return new Response("Invalid media path", { status: 400 });
  }

  const segments = pathname.split("/");
  if (!pathname || pathname.startsWith("/") ||
      segments.some(segment => !segment || segment === "." || segment === "..") ||
      pathname.includes("\\") || /[\u0000-\u001f]/.test(pathname)) {
    return new Response("Invalid media path", { status: 400 });
  }

  const mediaBase = (process.env.ATLAS_MEDIA_BLOB_BASE || "twdu-atlas-media/").replace(/^\/+|\/+$/g, "") + "/";
  const indexUrl = process.env.ATLAS_MEDIA_INDEX_URL;

  try {
    if (indexUrl) {
      let parsedIndex: URL;
      try {
        parsedIndex = new URL(indexUrl);
      } catch {
        return new Response("Invalid media index configuration", { status: 503 });
      }
      if (parsedIndex.protocol !== "https:") {
        return new Response("Invalid media index configuration", { status: 503 });
      }

      const indexResponse = await fetch(parsedIndex, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(5000),
      });
      if (!indexResponse.ok) return new Response("Media index unavailable", { status: 503 });

      const index = await indexResponse.json() as Record<string, unknown>;
      const blobUrl = index[pathname];
      if (!validBlobUrl(blobUrl)) return new Response("Media not found", { status: 404 });

      const upstream = await fetch(blobUrl, {
        method: req.method,
        redirect: "error",
        signal: AbortSignal.timeout(10000),
      });
      if (!upstream.ok) return new Response("Media not found", { status: upstream.status === 404 ? 404 : 502 });

      const headers = new Headers();
      headers.set("Cache-Control", MEDIA_CACHE);
      headers.set("X-Content-Type-Options", "nosniff");
      const type = upstream.headers.get("content-type");
      if (type) headers.set("Content-Type", type);
      const etag = upstream.headers.get("etag");
      if (etag) headers.set("ETag", etag);
      const length = upstream.headers.get("content-length");
      if (length) headers.set("Content-Length", length);
      return new Response(req.method === "HEAD" ? null : upstream.body, { status: 200, headers });
    }

    const result = await list({ prefix: mediaBase + pathname, limit: 100 });
    const blob = result.blobs.find(item => item.pathname === mediaBase + pathname);
    if (!blob) return new Response("Media not found", { status: 404 });

    const response = await get(blob.url, { access: "private" });
    if (!response) return new Response("Media not found", { status: 404 });

    return new Response(req.method === "HEAD" ? null : response.stream, {
      status: 200,
      headers: {
        "Content-Type": response.blob.contentType || "application/octet-stream",
        "Cache-Control": MEDIA_CACHE,
        "X-Content-Type-Options": "nosniff",
        ...(response.blob.etag ? { ETag: response.blob.etag } : {}),
      },
    });
  } catch (error) {
    console.error("atlas media error", error instanceof Error ? error.message : "unknown");
    return new Response("Media service unavailable", { status: 503 });
  }
}
