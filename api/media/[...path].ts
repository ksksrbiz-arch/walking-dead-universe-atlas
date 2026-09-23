import { get } from "@vercel/blob";

export default async function handler(req: Request) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  }

  const pathname = new URL(req.url).pathname.replace(/^\/api\/media\/?/, "");
  if (!pathname || pathname.includes("..")) {
    return new Response("Invalid media path", { status: 400 });
  }

  const mediaBase = process.env.ATLAS_MEDIA_BLOB_BASE || "twdu-atlas-media/";
  const indexUrl = process.env.ATLAS_MEDIA_INDEX_URL;

  try {
    if (indexUrl) {
      const indexResponse = await fetch(indexUrl, { headers: { accept: "application/json" } });
      if (!indexResponse.ok) return new Response("Media index unavailable", { status: 503 });
      const index = await indexResponse.json() as Record<string, string>;
      const blobUrl = index[pathname];
      if (!blobUrl) return new Response("Media not found", { status: 404 });
      return fetch(blobUrl, { method: req.method });
    }

    const { list } = await import("@vercel/blob");
    const result = await list({ prefix: mediaBase + pathname, limit: 1 });
    const blob = result.blobs[0];
    if (!blob) return new Response("Media not found", { status: 404 });

    const response = await get(blob.url, { access: "private" });
    if (!response) return new Response("Media not found", { status: 404 });

    return new Response(req.method === "HEAD" ? null : response.stream, {
      status: 200,
      headers: {
        "Content-Type": response.blob.contentType || "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
        "ETag": response.blob.etag || "",
      },
    });
  } catch (error) {
    console.error("atlas media error", error);
    return new Response("Media service unavailable", { status: 503 });
  }
}
