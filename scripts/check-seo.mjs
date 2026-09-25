#!/usr/bin/env node
// SEO / share-metadata regression check. Run after `npm run build`:  npm run test:seo
// Verifies dist/index.html carries the head metadata crawlers and link unfurlers need, that every
// referenced asset exists in dist/, that all absolute URLs agree on one origin, and that the
// episode count quoted in the copy matches the dataset. See context/references/seo-and-share-metadata.md.
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const dist = new URL("../dist/", import.meta.url).pathname;
const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};
const file = (rel) => join(dist, rel.replace(/^\//, ""));
const read = (rel) => readFileSync(file(rel), "utf8");

if (!existsSync(file("index.html"))) {
  console.error("dist/index.html not found - run `npm run build` first.");
  process.exit(1);
}
const html = read("index.html");

const meta = (attr, name) => {
  const re = new RegExp(`<meta[^>]*\\b${attr}="${name}"[^>]*>`, "i");
  const tag = html.match(re)?.[0];
  return tag?.match(/\bcontent="([^"]*)"/i)?.[1];
};
const link = (rel) => html.match(new RegExp(`<link[^>]*\\brel="${rel}"[^>]*>`, "i"))?.[0]?.match(/\bhref="([^"]*)"/i)?.[1];
const decode = (s = "") => s.replace(/&amp;/g, "&");

// Title + description
const title = decode(html.match(/<title>([^<]*)<\/title>/i)?.[1]);
check(title.length >= 15 && title.length <= 65, `title length ${title.length} should be 15-65: "${title}"`);
const description = decode(meta("name", "description"));
check(description.length >= 70 && description.length <= 160, `description length ${description?.length} should be 70-160`);
const episodes = JSON.parse(readFileSync(new URL("../data/episodes.json", import.meta.url), "utf8")).length;
check(
  description?.includes(String(episodes)),
  `description must quote the current episode count (${episodes}); update index.html when the dataset changes`,
);

// Canonical + origin
const canonical = link("canonical");
check(/^https:\/\/[^/]+\/$/.test(canonical || ""), `canonical must be an absolute https root URL, got ${canonical}`);
const origin = canonical?.replace(/\/$/, "");

// Open Graph + Twitter
const expectOrigin = (label, value) => check(value?.startsWith(origin + "/"), `${label} must be on ${origin}, got ${value}`);
check(meta("property", "og:type") === "website", "og:type must be website");
check(decode(meta("property", "og:title")) === title.replace(/^/, ""), "og:title should match <title>");
check(decode(meta("property", "og:description")) === description, "og:description should match the meta description");
check(meta("property", "og:url") === canonical, "og:url should equal the canonical URL");
expectOrigin("og:image", meta("property", "og:image"));
check(meta("property", "og:image:width") === "1200" && meta("property", "og:image:height") === "630", "og:image size must be 1200x630");
check(Boolean(meta("property", "og:image:alt")), "og:image:alt is required");
check(meta("name", "twitter:card") === "summary_large_image", "twitter:card must be summary_large_image");
check(meta("name", "twitter:image") === meta("property", "og:image"), "twitter:image should equal og:image");
check(decode(meta("name", "twitter:title")) === title, "twitter:title should match <title>");
check(/index/.test(meta("name", "robots") || ""), "robots meta should allow indexing");

// OG image file: exists, JPEG, 1200x630, small enough for WhatsApp/Telegram unfurls
const ogPath = new URL(meta("property", "og:image") || "https://x/none").pathname;
if (existsSync(file(ogPath))) {
  const buf = readFileSync(file(ogPath));
  check(buf.length < 300 * 1024, `${ogPath} is ${(buf.length / 1024).toFixed(0)} KB; keep under 300 KB`);
  let i = 2,
    size = null;
  while (i < buf.length && buf[0] === 0xff && buf[1] === 0xd8) {
    if (buf[i] !== 0xff) break;
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc3) {
      size = { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      break;
    }
    i += 2 + len;
  }
  check(size?.w === 1200 && size?.h === 630, `${ogPath} must be a 1200x630 JPEG, got ${size ? size.w + "x" + size.h : "not a JPEG"}`);
} else check(false, `og:image file missing from dist: ${ogPath}`);

// Icons + manifest
for (const rel of [link("icon"), link("apple-touch-icon"), link("manifest")]) {
  check(Boolean(rel) && existsSync(file(rel)), `linked asset missing from dist: ${rel}`);
}
if (existsSync(file("manifest.webmanifest"))) {
  const manifest = JSON.parse(read("manifest.webmanifest"));
  check(Boolean(manifest.name && manifest.short_name && manifest.start_url), "manifest needs name, short_name and start_url");
  check(manifest.icons?.some((i) => i.sizes === "192x192") && manifest.icons?.some((i) => i.sizes === "512x512"), "manifest needs 192 and 512 icons");
  for (const icon of manifest.icons || []) check(existsSync(file(icon.src)), `manifest icon missing from dist: ${icon.src}`);
}

// robots.txt + sitemap.xml
if (existsSync(file("robots.txt"))) {
  const robots = read("robots.txt");
  check(/^User-agent:\s*\*/im.test(robots) && /^Allow:\s*\/\s*$/im.test(robots), "robots.txt must allow all crawlers");
  check(!/^Disallow:\s*\/api/im.test(robots), "robots.txt must NOT disallow /api/ (share cards are served from /api/og)");
  check(robots.includes(`Sitemap: ${origin}/sitemap.xml`), "robots.txt must reference the sitemap on the canonical origin");
} else check(false, "robots.txt missing from dist");
if (existsSync(file("sitemap.xml"))) {
  const sitemap = read("sitemap.xml");
  check(sitemap.includes(`<loc>${canonical}</loc>`), "sitemap.xml must list the canonical home URL");
  for (const [, loc] of sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) expectOrigin("sitemap <loc>", loc);
} else check(false, "sitemap.xml missing from dist");

// JSON-LD
const ld = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i)?.[1];
try {
  const data = JSON.parse(ld);
  check(data["@context"] === "https://schema.org" && data["@type"] === "WebApplication", "JSON-LD must be a schema.org WebApplication");
  check(data.url === canonical, "JSON-LD url should equal the canonical URL");
} catch {
  check(false, "JSON-LD block missing or not valid JSON");
}

if (failures.length) {
  console.error(`SEO check failed (${failures.length}):`);
  for (const f of failures) console.error(" - " + f);
  process.exit(1);
}
console.log(`SEO check passed: title, description (${episodes} episodes), canonical ${origin}, OG/Twitter, icons, manifest, robots, sitemap, JSON-LD`);
