// Image proxy for Fandom/AMC art. Public, GET-only, allow-listed hosts.
// Hardening (2026-09-25): raster image types only (no SVG), and every redirect hop is
// re-validated against the allow-list instead of being followed blindly.
// Browsers reach this through the same-origin Vercel rewrite /api/atlas/media so the Vercel CDN
// can cache the (immutable) responses; see context/references/supabase-backend.md.
const ALLOWED_HOSTS = new Set([
  "static.wikia.nocookie.net",
  "vignette.wikia.nocookie.net",
  "images.wikia.nocookie.net",
  "images.cds.amcn.com",
  "dimages.cds.amcn.com",
]);
const RASTER_TYPE = /^image\/(?:avif|webp|jpe?g|png|gif)$/i;
const MAX_BYTES = 12 * 1024 * 1024;
const MAX_REDIRECTS = 3;

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,OPTIONS",
    "access-control-allow-headers": "content-type",
  };
}

function isAllowed(target: URL) {
  return target.protocol === "https:" && ALLOWED_HOSTS.has(target.hostname.toLowerCase());
}

function candidateUrls(target: URL) {
  const out = [target];
  const host = target.hostname.toLowerCase();
  if (host === "static.wikia.nocookie.net") {
    const fallback = new URL(target.toString());
    fallback.hostname = "vignette.wikia.nocookie.net";
    out.push(fallback);
  } else if (host === "vignette.wikia.nocookie.net") {
    const fallback = new URL(target.toString());
    fallback.hostname = "static.wikia.nocookie.net";
    out.push(fallback);
  }
  return out;
}

// fetch() with manual redirect handling: each hop must still be https + allow-listed.
async function fetchAllowed(start: URL, init: RequestInit) {
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
    return { res, finalUrl: current };
  }
  throw new Error("Too many redirects");
}

const text = (body: string, status: number, extra: Record<string, string> = {}) =>
  new Response(body, { status, headers: { ...corsHeaders(), ...extra } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });
  if (req.method !== "GET") return text("Method Not Allowed", 405);

  const source = new URL(req.url).searchParams.get("url") || "";
  if (!source) return text("Missing image URL", 400);

  let target: URL;
  try {
    target = new URL(source);
  } catch {
    return text("Invalid image URL", 400);
  }
  if (!isAllowed(target)) return text("Image host not allowed", 403);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    let lastStatus = 502;
    let lastError = "Upstream image unavailable";

    for (const candidate of candidateUrls(target)) {
      try {
        const isFandom = candidate.hostname.toLowerCase().endsWith(".wikia.nocookie.net");
        const { res: upstream, finalUrl } = await fetchAllowed(candidate, {
          signal: controller.signal,
          headers: {
            accept: "image/avif,image/webp,image/jpeg,image/png,image/gif,*/*;q=0.8",
            "user-agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",
            ...(isFandom
              ? { referer: "https://walkingdead.fandom.com/", origin: "https://walkingdead.fandom.com" }
              : { referer: "https://www.amc.com/" }),
          },
        });

        lastStatus = upstream.status;
        if (!upstream.ok || !upstream.body) {
          await upstream.body?.cancel();
          lastError = `Upstream image unavailable (${upstream.status})`;
          continue;
        }

        const contentType = (upstream.headers.get("content-type") || "").split(";")[0].trim();
        if (!RASTER_TYPE.test(contentType)) {
          await upstream.body.cancel();
          lastError = "Upstream content is not a supported image type";
          continue;
        }

        const length = Number(upstream.headers.get("content-length") || 0);
        if (length > MAX_BYTES) {
          await upstream.body.cancel();
          return text("Image too large", 413);
        }

        const body = await upstream.arrayBuffer();
        if (body.byteLength > MAX_BYTES) return text("Image too large", 413);

        return new Response(body, {
          status: 200,
          headers: {
            ...corsHeaders(),
            "content-type": contentType,
            "cache-control": "public,max-age=86400,s-maxage=604800,stale-while-revalidate=2592000",
            "x-content-type-options": "nosniff",
            "content-security-policy": "default-src 'none'; sandbox",
            "x-content-source": isFandom ? "walking-dead-fandom" : "amc-networks",
            "x-content-url": finalUrl.toString(),
          },
        });
      } catch (error) {
        lastError = error instanceof Error ? error.message : "Upstream image request failed";
      }
    }

    return text(lastError, lastStatus >= 400 && lastStatus < 600 ? (lastStatus === 404 ? 404 : 502) : 504, {
      "cache-control": "public,max-age=60",
    });
  } finally {
    clearTimeout(timeout);
  }
});
