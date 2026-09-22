import type { Config, Context } from "@netlify/functions";

const ALLOWED_HOSTS = new Set([
  "static.wikia.nocookie.net",
  "vignette.wikia.nocookie.net",
]);

const MAX_BYTES = 8 * 1024 * 1024;

export default async (request: Request, context: Context) => {
  const requestUrl = new URL(request.url);
  const source = requestUrl.searchParams.get("url");
  if (!source) return new Response("Missing image URL", { status: 400 });

  let target: URL;
  try {
    target = new URL(source);
  } catch {
    return new Response("Invalid image URL", { status: 400 });
  }

  if (target.protocol !== "https:" || !ALLOWED_HOSTS.has(target.hostname.toLowerCase())) {
    return new Response("Image host not allowed", { status: 403 });
  }

  const upstream = await fetch(target, {
    headers: {
      "user-agent": "TWDU-Atlas/1.0 (+https://walking-dead-universe-atlas.netlify.app/)",
      "accept": "image/avif,image/webp,image/jpeg,image/png,image/gif,*/*;q=0.8",
      "referer": "https://walkingdead.fandom.com/",
      "accept-language": "en-US,en;q=0.8",
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!upstream.ok) {
    return new Response("Upstream image unavailable", {
      status: upstream.status === 404 ? 404 : 502,
      headers: { "cache-control": "public, max-age=60" },
    });
  }

  const contentType = upstream.headers.get("content-type") || "";
  if (!/^image\/(?:avif|webp|jpeg|png|gif)$/i.test(contentType.split(";")[0])) {
    return new Response("Upstream response is not an image", { status: 502 });
  }

  const contentLength = Number(upstream.headers.get("content-length") || 0);
  if (contentLength > MAX_BYTES) return new Response("Image too large", { status: 413 });

  const body = await upstream.arrayBuffer();
  if (body.byteLength > MAX_BYTES) return new Response("Image too large", { status: 413 });

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": contentType,
      "cache-control": "public, max-age=86400, stale-while-revalidate=604800",
      "Netlify-CDN-Cache-Control": "public, durable, max-age=604800, stale-while-revalidate=2592000",
      "x-content-source": "walking-dead-fandom",
      "x-content-url": target.toString(),
    },
  });
};

export const config: Config = {
  path: "/api/fandom-image",
};
