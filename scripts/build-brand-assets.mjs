#!/usr/bin/env node
// Renders the static brand assets in public/: og-home.jpg (1200x630, the social-preview card for
// the home page `/`) and icons/icon-{180,192,512}.png (apple-touch-icon + web manifest). Entity share links (/j, /p, /e, /c) keep their dynamic cards from api/og.ts; that
// endpoint has no "home" kind and its build is deliberately fragile (see
// context/references/journeys-and-sharing.md), so the home card is a committed static asset.
//
// Built only from data already in the repo: the world-atlas land outline, the placed
// locations (data/locations.json) in their series colours, and the episode count. No
// third-party stills. Re-run after the dataset changes:  npm run build:brand-assets
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { geoEqualEarth, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import { chromium } from "playwright";
import { SERIES_BY_ID, FALLBACK_COLOR } from "../src/lib/series.ts";

const W = 1200;
const H = 630;
const read = async (p) => JSON.parse(await readFile(new URL(p, import.meta.url), "utf8"));

const topo = await read("../node_modules/@cublya/world-atlas/land-110m.json");
const locations = await read("../data/locations.json");
const episodes = await read("../data/episodes.json");

const land = topo.type === "Topology" ? feature(topo, topo.objects.land ?? Object.values(topo.objects)[0]) : topo;
const projection = geoEqualEarth().fitExtent(
  [
    [-30, 10],
    [W + 30, H + 10],
  ],
  { type: "Sphere" },
);
const path = geoPath(projection);

const placed = locations.filter(
  (l) => Number.isFinite(l.lat) && Number.isFinite(l.lng) && !(l.lat === 0 && l.lng === 0),
);
const dots = placed
  .map((l) => {
    const p = projection([l.lng, l.lat]);
    if (!p) return "";
    const color = SERIES_BY_ID[l.seriesId]?.color ?? FALLBACK_COLOR;
    return `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="12" fill="${color}" opacity=".30"/>` +
      `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="4.6" fill="${color}"/>`;
  })
  .join("");

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;background:#0a0d0c}
  .card{position:relative;width:${W}px;height:${H}px;overflow:hidden;background:
    radial-gradient(900px 500px at 30% 45%,#15201d 0%,#0a0d0c 70%);
    font-family:"Barlow Condensed","Arial Narrow","Liberation Sans Narrow","DejaVu Sans Condensed",Arial,sans-serif;color:#f1efe6}
  svg{position:absolute;inset:0}
  .fade{position:absolute;inset:0;background:linear-gradient(90deg,rgba(10,13,12,.70) 0%,rgba(10,13,12,.30) 34%,rgba(10,13,12,0) 56%),
    linear-gradient(0deg,rgba(10,13,12,.80) 0%,rgba(10,13,12,0) 40%)}
  .mark{position:absolute;left:64px;top:56px;width:64px;height:64px;border-radius:16px;background:#e8502f;display:flex;align-items:center;justify-content:center;
    font-weight:700;font-size:30px;letter-spacing:1px;color:#fff}
  .title{position:absolute;left:64px;bottom:168px;font-weight:700;font-size:92px;line-height:.95;letter-spacing:1px;text-transform:uppercase}
  .title span{color:#e8502f}
  .tag{position:absolute;left:66px;bottom:112px;font-size:32px;font-weight:600;color:#c9d3cf;font-family:Inter,Arial,sans-serif;letter-spacing:.2px}
  .stat{position:absolute;left:66px;bottom:60px;font-size:24px;color:#8a9994;font-family:Inter,Arial,sans-serif;letter-spacing:1.5px;text-transform:uppercase}
</style></head><body><div class="card">
  <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <path d="${path(land)}" fill="#22302c" stroke="#33443f" stroke-width="1"/>
    ${dots}
  </svg>
  <div class="fade"></div>
  <div class="mark">AT</div>
  <div class="title">TWDU<br><span>Atlas</span></div>
  <div class="tag">Chronology, geography and connections</div>
  <div class="stat">${episodes.length} episodes &middot; ${placed.length} mapped places</div>
</div></body></html>`;

// CHROMIUM_EXECUTABLE_PATH: use an existing Chromium instead of Playwright's own download.
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined });
try {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: "load" });
  const img = await page.screenshot({ type: "jpeg", quality: 88, clip: { x: 0, y: 0, width: W, height: H } });
  await writeFile(new URL("../public/og-home.jpg", import.meta.url), img);
  console.log(`public/og-home.jpg ${W}x${H}, ${(img.length / 1024).toFixed(0)} KB, ${placed.length} places, ${episodes.length} episodes`);

  // App icons: the same "AT" mark as the card, on a transparent rounded square.
  await mkdir(new URL("../public/icons/", import.meta.url), { recursive: true });
  for (const size of [180, 192, 512]) {
    const icon = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await icon.setContent(
      `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:transparent}
      .i{width:${size}px;height:${size}px;border-radius:${Math.round(size * 0.22)}px;background:#e8502f;display:flex;align-items:center;justify-content:center;
      color:#fff;font:700 ${Math.round(size * 0.46)}px/1 "Barlow Condensed","Arial Narrow","Liberation Sans Narrow","DejaVu Sans Condensed",Arial,sans-serif;letter-spacing:${Math.round(size * 0.01)}px}
      </style><div class="i">AT</div>`,
      { waitUntil: "load" },
    );
    const png = await icon.screenshot({ type: "png", omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
    await writeFile(new URL(`../public/icons/icon-${size}.png`, import.meta.url), png);
    console.log(`public/icons/icon-${size}.png ${(png.length / 1024).toFixed(1)} KB`);
    await icon.close();
  }
} finally {
  await browser.close();
}
