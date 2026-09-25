// Unit tests for the media proxy Worker with a stubbed global fetch (no network, no wrangler needed).
// Run: npm run test:media-worker
import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.ts";

const realFetch = globalThis.fetch;
const FANDOM = "https://static.wikia.nocookie.net/walkingdead/images/b/bb/Manhattan_Flag.jpg/revision/latest/scale-to-width-down/320";
const AMC = "https://images.cds.amcn.com/amcn/tve/TWDS11C_02_3200x1440_DesktopWebHero.jpg";
const bytes = (n) => new Uint8Array(n).fill(7);
const img = (type = "image/webp", size = 4096, headers = {}) =>
  new Response(bytes(size), { status: 200, headers: { "content-type": type, ...headers } });

// Install a fetch stub; `plan` maps a URL string to a Response (or a function returning one).
// A fresh Response is built per call (Response.clone() tees the stream, and cancelling one branch of a tee
// never settles, which would hang the worker's body.cancel()).
function stub(plan) {
  const calls = [];
  const frozen = new Map();
  globalThis.fetch = async (url, init) => {
    const key = String(url);
    calls.push({ url: key, init });
    const entry = plan[key];
    if (!entry) return new Response("not found", { status: 404 });
    if (typeof entry === "function") return entry(init);
    if (!frozen.has(key)) {
      frozen.set(key, { status: entry.status, headers: [...entry.headers], buf: await entry.arrayBuffer() });
    }
    const f = frozen.get(key);
    return new Response(f.buf.byteLength ? f.buf.slice(0) : null, { status: f.status, headers: f.headers });
  };
  return calls;
}
const call = (path, method = "GET") => worker.fetch(new Request("https://media.test/" + path, { method }));
const proxy = (source, method) => call("?url=" + encodeURIComponent(source), method);
test.afterEach(() => {
  globalThis.fetch = realFetch;
});

test("serves an allow-listed raster image with hardening + cache headers", async () => {
  stub({ [FANDOM]: img("image/webp", 4096, { "cf-cache-status": "HIT" }) });
  const res = await proxy(FANDOM);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "image/webp");
  assert.equal((await res.arrayBuffer()).byteLength, 4096);
  assert.match(res.headers.get("cache-control"), /max-age=2592000/);
  assert.match(res.headers.get("cache-control"), /s-maxage=2592000/);
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.match(res.headers.get("content-security-policy"), /sandbox/);
  assert.equal(res.headers.get("x-atlas-media-cache"), "HIT");
  assert.equal(res.headers.get("access-control-allow-origin"), "*");
});

test("asks Cloudflare to edge-cache the upstream image", async () => {
  const calls = stub({ [AMC]: img("image/jpeg") });
  await proxy(AMC);
  assert.equal(calls[0].init.cf.cacheEverything, true);
  assert.equal(calls[0].init.cf.cacheTtlByStatus["200-299"], 2592000);
  assert.equal(calls[0].init.cf.cacheTtlByStatus["500-599"], 0);
});

test("rejects missing, invalid, non-https and non-allow-listed sources without fetching", async () => {
  const calls = stub({});
  assert.equal((await call("")).status, 400);
  assert.equal((await proxy("not a url")).status, 400);
  assert.equal((await proxy("http://static.wikia.nocookie.net/x.png")).status, 403);
  assert.equal((await proxy("https://example.com/a.png")).status, 403);
  assert.equal((await proxy("https://static.wikia.nocookie.net.evil.com/a.png")).status, 403);
  assert.equal(calls.length, 0);
});

test("methods: OPTIONS 204, POST 405, HEAD has headers and no body", async () => {
  stub({ [FANDOM]: img() });
  assert.equal((await call("", "OPTIONS")).status, 204);
  assert.equal((await proxy(FANDOM, "POST")).status, 405);
  const head = await proxy(FANDOM, "HEAD");
  assert.equal(head.status, 200);
  assert.equal(head.headers.get("content-length"), "4096");
  assert.equal((await head.arrayBuffer()).byteLength, 0);
});

test("refuses SVG and other non-raster content types (415)", async () => {
  stub({ [FANDOM]: img("image/svg+xml"), "https://vignette.wikia.nocookie.net/walkingdead/images/b/bb/Manhattan_Flag.jpg/revision/latest/scale-to-width-down/320": img("text/html") });
  const res = await proxy(FANDOM);
  assert.equal(res.status, 415);
  assert.equal(res.headers.get("cache-control"), "no-store");
});

test("follows redirects only to allow-listed hosts", async () => {
  const hop = "https://images.wikia.nocookie.net/final.png";
  stub({
    [FANDOM]: new Response(null, { status: 302, headers: { location: hop } }),
    [hop]: img("image/png"),
  });
  const res = await proxy(FANDOM);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("x-atlas-media-source"), "images.wikia.nocookie.net");
});

test("blocks a redirect to a host that is not allow-listed", async () => {
  const calls = stub({
    [FANDOM]: new Response(null, { status: 302, headers: { location: "https://evil.example.com/a.png" } }),
    "https://vignette.wikia.nocookie.net/walkingdead/images/b/bb/Manhattan_Flag.jpg/revision/latest/scale-to-width-down/320": new Response(null, { status: 302, headers: { location: "http://static.wikia.nocookie.net/a.png" } }),
  });
  const res = await proxy(FANDOM);
  assert.equal(res.status, 502);
  assert.ok(!calls.some((c) => c.url.includes("evil.example.com")), "must never fetch the disallowed host");
  assert.ok(!calls.some((c) => c.url.startsWith("http://")), "must never fetch a plain-http hop");
});

test("gives up on redirect loops", async () => {
  stub({ [AMC]: new Response(null, { status: 302, headers: { location: AMC } }) });
  assert.equal((await proxy(AMC)).status, 502);
});

test("falls back to the sibling Fandom host when the first one fails", async () => {
  const alt = "https://vignette.wikia.nocookie.net/walkingdead/images/b/bb/Manhattan_Flag.jpg/revision/latest/scale-to-width-down/320";
  stub({ [FANDOM]: new Response("gone", { status: 500 }), [alt]: img("image/jpeg") });
  const res = await proxy(FANDOM);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "image/jpeg");
});

test("upstream 404 is a short-cached 404; other failures are 502 and not cached", async () => {
  stub({ [AMC]: new Response("nope", { status: 404 }) });
  const missing = await proxy(AMC);
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get("cache-control"), "public, max-age=60");
  stub({ [AMC]: new Response("boom", { status: 500 }) });
  const broken = await proxy(AMC);
  assert.equal(broken.status, 502);
  assert.equal(broken.headers.get("cache-control"), "no-store");
});

test("enforces the 12 MB cap (advertised and actual) and the tiny-image floor", async () => {
  stub({ [AMC]: img("image/jpeg", 16, { "content-length": String(13 * 1024 * 1024) }) });
  assert.equal((await proxy(AMC)).status, 413);
  stub({ [AMC]: img("image/jpeg", 13 * 1024 * 1024) });
  assert.equal((await proxy(AMC)).status, 413);
  stub({ [AMC]: img("image/jpeg", 100) });
  assert.equal((await proxy(AMC)).status, 502);
});
