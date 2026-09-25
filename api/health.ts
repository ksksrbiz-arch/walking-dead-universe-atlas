import { list } from "@vercel/blob";

const REQUIRED_DATA = [
  "characters.json",
  "locations.json",
  "episodes.json",
  "series.json",
  "chronology.json",
  "search-index.json",
] as const;

export async function GET(req: Request) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { Allow: "GET, HEAD" },
    });
  }

  const configured = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
  const deployment = {
    environment: process.env.VERCEL_ENV || "unknown",
    commit: process.env.VERCEL_GIT_COMMIT_SHA || null,
  };

  if (!configured) {
    return Response.json(
      { ok: false, status: "storage-not-configured", deployment },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const result = await list({ prefix: "twdu-atlas-data/", limit: 1000 });
    const available = new Set(result.blobs.map(blob => blob.pathname.replace(/^twdu-atlas-data\//, "")));
    const missing = REQUIRED_DATA.filter(name => !available.has(name));

    return Response.json(
      {
        ok: missing.length === 0,
        status: missing.length === 0 ? "ready" : "data-incomplete",
        data: {
          required: REQUIRED_DATA.length,
          available: REQUIRED_DATA.length - missing.length,
          missing,
        },
        deployment,
      },
      {
        status: missing.length === 0 ? 200 : 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    console.error("atlas health check failed", error);
    return Response.json(
      { ok: false, status: "storage-unavailable", deployment },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
