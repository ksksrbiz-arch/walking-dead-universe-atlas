// Image proxy for Fandom/AMC art, cached at Cloudflare's edge. GET/HEAD only, allow-listed hosts.
//
// Why this exists: the Supabase `atlas-media` function does the same job but its responses always carry a
// Set-Cookie, so nothing in front of it (Vercel CDN) will cache them and every image load is a function
// invocation. See context/references/supabase-backend.md ("Caching").
//
// Caching, two layers (both work on *.workers.dev; the classic Cache API `caches.default` does NOT):
//   1. Workers Caching (`[cache] enabled = true` in wrangler.toml): honours the Cache-Control we return, and a hit
//      is served without running this Worker at all.
//   2. fetch() subrequest caching (`cf.cacheEverything`): the upstream image is cached at the edge, so even a
//      Worker run does not go back to Fandom/AMC.
// Hardening matches supabase/functions/atlas-media: raster types only (no SVG), every redirect hop re-validated
// against the allow-list, nosniff + a sandboxing CSP on every image response.
//
// Plain JS (no type annotations): kept type-free so Node can import it unmodified for
// workers/atlas-media-proxy/test/index.test.mjs.
const ALLOWED_HOSTS = new Set([
  "static.wikia.nocookie.net",
  "vignette.wikia.nocookie.net",
  "images.wikia.nocookie.net",
  "images.cds.amcn.com",
  "dimages.cds.amcn.com",
]);
const RASTER_TYPE = /^image\/(?:avif|webp|jpe?g|png|gif)$/i;
const MAX_BYTES = 12 * 1024 * 1024;
const MIN_BYTES = 512;
const MAX_REDIRECTS = 3;
const IMAGE_TTL = 30 * 24 * 60 * 60; // 30 days: art filenames are revision-stamped, so content is effectively immutable

const corsHeaders = () => ({
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,HEAD,OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "86400",
});

const isAllowed = (target) => target.protocol === "https:" && ALLOWED_HOSTS.has(target.hostname.toLowerCase());

const reply = (body, status, extra = {}) => new Response(body, { status, headers: { ...corsHeaders(), ...extra } });

// Fandom serves the same file from static. and vignette. hosts; try the other one if the first fails.
function candidateUrls(target) {
  const out = [target];
  const host = target.hostname.toLowerCase();
  const swap = { "static.wikia.nocookie.net": "vignette.wikia.nocookie.net", "vignette.wikia.nocookie.net": "static.wikia.nocookie.net" }[host];
  if (swap) {
    const alt = new URL(target.toString());
    alt.hostname = swap;
    out.push(alt);
  }
  return out;
}

// fetch() with manual redirect handling: every hop must still be https + allow-listed.
async function fetchAllowed(start, init) {
  let current = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetch(current, { ...init, redirect: "manual" });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      await res.body?.cancel();
      if (!location) throw new Error("Redirect without location");
      const next = new URL(location, current);
      if (!isAllowed(next)) throw new Error("Redirect to a host that is not allowed");
      current = next;
      continue;
    }
    return { response: res, finalUrl: current };
  }
  throw new Error("Too many redirects");
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });
    if (!["GET", "HEAD"].includes(request.method)) return reply("Method not allowed", 405);

    const source = new URL(request.url).searchParams.get("url");
    if (!source) return reply("Missing url", 400);

    let target;
    try {
      target = new URL(source);
    } catch {
      return reply("Invalid url", 400);
    }
    if (!isAllowed(target)) return reply("Source host is not allowlisted", 403);

    let lastStatus = 502;
    let lastError = "Upstream image unavailable";

    for (const candidate of candidateUrls(target)) {
      try {
        const fandom = candidate.hostname.toLowerCase().endsWith(".wikia.nocookie.net");
        const { response: upstream, finalUrl } = await fetchAllowed(candidate, {
          headers: {
            "user-agent": "TWDU-Atlas-Media/1.0",
            accept: "image/avif,image/webp,image/jpeg,image/png,image/gif,*/*;q=0.8",
            referer: fandom ? "https://walkingdead.fandom.com/" : "https://www.amc.com/",
          },
          // Cache the upstream image at the edge even though the origins send no useful cache headers.
          // Only successful fetches are held for long; errors are cached briefly or not at all.
          cf: { cacheEverything: true, cacheTtlByStatus: { "200-299": IMAGE_TTL, "404": 60, "500-599": 0 } },
        });

        lastStatus = upstream.status;
        if (!upstream.ok || !upstream.body) {
          await upstream.body?.cancel();
          lastError = `Upstream ${upstream.status}`;
          continue;
        }

        const contentType = (upstream.headers.get("content-type") || "").split(";")[0].trim();
        if (!RASTER_TYPE.test(contentType)) {
          await upstream.body.cancel();
          lastStatus = 415;
          lastError = "Upstream did not return a supported image type";
          continue;
        }

        const advertised = Number(upstream.headers.get("content-length") || 0);
        if (advertised > MAX_BYTES) {
          await upstream.body.cancel();
          return reply("Image exceeds 12 MB limit", 413);
        }

        const body = await upstream.arrayBuffer();
        if (body.byteLength > MAX_BYTES) return reply("Image exceeds 12 MB limit", 413);
        if (body.byteLength < MIN_BYTES) {
          lastStatus = 502;
          lastError = "Image response is unexpectedly small";
          continue;
        }

        return new Response(request.method === "HEAD" ? null : body, {
          status: 200,
          headers: {
            ...corsHeaders(),
            "content-type": contentType,
            "content-length": String(body.byteLength),
            "cache-control": `public, max-age=${IMAGE_TTL}, s-maxage=${IMAGE_TTL}, stale-while-revalidate=604800`,
            "x-content-type-options": "nosniff",
            "content-security-policy": "default-src 'none'; sandbox",
            "x-atlas-media-source": finalUrl.hostname,
            // Edge cache status of the upstream subrequest (HIT once the image is warm at this colo).
            "x-atlas-media-cache": upstream.headers.get("cf-cache-status") || "MISS",
          },
        });
      } catch (error) {
        lastError = error instanceof Error ? error.message : "Upstream image request failed";
      }
    }

    // Do not let a failure be cached for long by browsers or the edge.
    return reply(lastError, lastStatus === 404 ? 404 : lastStatus === 415 ? 415 : lastStatus === 413 ? 413 : 502, {
      "cache-control": lastStatus === 404 ? "public, max-age=60" : "no-store",
    });
  },
};
