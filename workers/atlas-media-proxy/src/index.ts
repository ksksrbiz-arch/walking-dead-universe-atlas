const ALLOWED_HOSTS = new Set(["static.wikia.nocookie.net","vignette.wikia.nocookie.net","images.wikia.nocookie.net","images.cds.amcn.com","dimages.cds.amcn.com"]);
const MAX_BYTES = 12 * 1024 * 1024;

const corsHeaders = () => ({
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,HEAD,OPTIONS",
  "access-control-allow-headers": "Content-Type",
  "access-control-max-age": "86400",
});

function cacheKey(request, source) {
  const url = new URL(request.url);
  url.search = "";
  return new Request(url.origin + "/__media/" + encodeURIComponent(source), { method: "GET" });
}

async function fetchOrigin(source) {
  const host = new URL(source).hostname.toLowerCase();
  const fandom = host.endsWith(".wikia.nocookie.net");
  return fetch(source, {
    redirect: "follow",
    headers: {
      "User-Agent": "TWDU-Atlas-Media/1.0",
      Accept: "image/avif,image/webp,image/jpeg,image/png,image/gif,*/*;q=0.8",
      Referer: fandom ? "https://walkingdead.fandom.com/" : "https://www.amc.com/",
    },
  });
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });
    if (!["GET","HEAD"].includes(request.method)) return new Response("Method not allowed", { status: 405, headers: corsHeaders() });

    const source = new URL(request.url).searchParams.get("url");
    if (!source) return new Response("Missing url", { status: 400, headers: corsHeaders() });

    let parsed;
    try { parsed = new URL(source); } catch {
      return new Response("Invalid url", { status: 400, headers: corsHeaders() });
    }
    if (parsed.protocol !== "https:" || !ALLOWED_HOSTS.has(parsed.hostname.toLowerCase())) {
      return new Response("Source host is not allowlisted", { status: 403, headers: corsHeaders() });
    }

    const key = cacheKey(request, source);
    const cache = caches.default;
    const cached = await cache.match(key);
    if (cached) {
      const headers = new Headers(cached.headers);
      headers.set("x-atlas-media-cache", "HIT");
      return new Response(request.method === "HEAD" ? null : cached.body, { status: cached.status, headers });
    }

    const origin = await fetchOrigin(source);
    if (!origin.ok) return new Response("Upstream " + origin.status, { status: origin.status, headers: corsHeaders() });

    const contentType = origin.headers.get("content-type") || "";
    if (!contentType.toLowerCase().startsWith("image/")) {
      return new Response("Upstream did not return an image", { status: 415, headers: corsHeaders() });
    }
    const advertised = Number(origin.headers.get("content-length") || 0);
    if (advertised > MAX_BYTES) return new Response("Image exceeds 12 MB limit", { status: 413, headers: corsHeaders() });

    const body = await origin.arrayBuffer();
    if (body.byteLength < 512) return new Response("Image response is unexpectedly small", { status: 502, headers: corsHeaders() });
    if (body.byteLength > MAX_BYTES) return new Response("Image exceeds 12 MB limit", { status: 413, headers: corsHeaders() });

    const response = new Response(request.method === "HEAD" ? null : body, {
      status: 200,
      headers: {
        "content-type": contentType,
        "cache-control": "public, max-age=2592000, s-maxage=2592000, stale-while-revalidate=604800",
        "x-atlas-media-source": parsed.hostname,
        "x-atlas-media-cache": "MISS",
        "content-length": String(body.byteLength),
        ...corsHeaders(),
      },
    });
    ctx.waitUntil(cache.put(key, response.clone()));
    return response;
  },
};
