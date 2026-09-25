import { get, list } from "@vercel/blob";

const MEDIA_CACHE = "public, max-age=86400, stale-while-revalidate=604800";
const MAX_MEDIA_BYTES = 12 * 1024 * 1024;
const BLOB_HOST_SUFFIXES = [".public.blob.vercel-storage.com", ".blob.vercel-storage.com"];

function validBlobUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port &&
      BLOB_HOST_SUFFIXES.some(suffix => url.hostname.length > suffix.length && url.hostname.endsWith(suffix)) &&
      !url.hostname.includes("..");
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
      if (parsedIndex.protocol !== "https:" || parsedIndex.username || parsedIndex.password || parsedIndex.port ||
          !BLOB_HOST_SUFFIXES.some(suffix => parsedIndex.hostname.length > suffix.length && parsedIndex.hostname.endsWith(suffix))) {
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
      if (!upstream.ok) return new Response(upstream.status === 404 ? "Media not found" : "Media upstream error", { status: upstream.status === 404 ? 404 : 502 });
      const declaredLength = Number(upstream.headers.get("content-length") || 0);
      if (declaredLength > MAX_MEDIA_BYTES) return new Response("Media exceeds size limit", { status: 413 });
      const bytes = await upstream.arrayBuffer();
      if (bytes.byteLength > MAX_MEDIA_BYTES) return new Response("Media exceeds size limit", { status: 413 });

      const headers = new Headers();
      headers.set("Cache-Control", MEDIA_CACHE);
      headers.set("X-Content-Type-Options", "nosniff");
      const type = upstream.headers.get("content-type");
      if (type) headers.set("Content-Type", type);
      const etag = upstream.headers.get("etag");
      if (etag) headers.set("ETag", etag);
      const length = upstream.headers.get("content-length");
      if (length) headers.set("Content-Length", length);
      headers.set("Content-Length", String(bytes.byteLength));
      return new Response(req.method === "HEAD" ? null : bytes, { status: 200, headers });
    }

    const result = await list({ prefix: mediaBase + pathname, limit: 100 });
    const blob = result.blobs.find(item => item.pathname === mediaBase + pathname);
    if (!blob) return new Response("Media not found", { status: 404 });

    if (!validBlobUrl(blob.url)) return new Response("Invalid media origin", { status: 502 });
    const response = await get(blob.url, { access: "private" });
    if (!response) return new Response("Media not found", { status: 404 });
    if (!response.stream) return new Response("Media body unavailable", { status: 502 });
    const reader = response.stream.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      if (!part.value) continue;
      total += part.value.byteLength;
      if (total > MAX_MEDIA_BYTES) {
        await reader.cancel();
        return new Response("Media exceeds size limit", { status: 413 });
      }
      chunks.push(part.value);
    }
    const payload = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { payload.set(chunk, offset); offset += chunk.byteLength; }

    return new Response(req.method === "HEAD" ? null : payload, {
      status: 200,
      headers: {
        "Content-Type": response.blob.contentType || "application/octet-stream",
        "Cache-Control": MEDIA_CACHE,
        "X-Content-Type-Options": "nosniff",
        "Content-Length": String(total),
        ...(response.blob.etag ? { ETag: response.blob.etag } : {}),
      },
    });
  } catch (error) {
    console.error("atlas media error", error instanceof Error ? error.message : "unknown");
    return new Response("Media service unavailable", { status: 503 });
  }
}
