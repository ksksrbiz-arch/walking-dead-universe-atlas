import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { geoEqualEarth, geoPath } from "d3-geo";
import { feature } from "topojson-client";

// Server side of shareable links (api/share.ts → HTML with preview meta,
// api/og.ts → the 1200×630 preview image). Reads dist/share-index.json, which
// `vite build` emits from the same modules the app uses (src/lib/shareIndex.ts).

type Journey = { places: number; km: number; series: string[]; years: [number | null, number | null]; stops: [number, number][]; legs: [number, number][]; beats: number[] };
export type ShareIndex = {
  version: 1;
  series: Record<string, { name: string; short: string; color: string }>;
  characters: Record<string, { name: string; image?: string; series: string[]; episodes: number; journey?: Journey }>;
  locations: Record<string, { name: string; type: string; series: string; year: number; image?: string; lat?: number; lng?: number; episodes: number }>;
  episodes: Record<string, { title: string; code: string; series: string; year: string; image?: string; order: number }>;
  land: any;
};

export const JOURNEY_COLORS = ["#f2b84b", "#5ec8e0", "#ef6f86"];
export type ShareKind = "j" | "p" | "e" | "c";

let indexPromise: Promise<ShareIndex> | null = null;
export function loadShareIndex(origin: string): Promise<ShareIndex> {
  indexPromise ??= (async () => {
    // A local build first (tests, `vercel dev`), then the deployment's own static copy.
    try { return JSON.parse(await readFile(join(process.cwd(), "dist", "share-index.json"), "utf8")); } catch {}
    const res = await fetch(new URL("/share-index.json", origin));
    if (!res.ok) throw new Error("share index unavailable: " + res.status);
    return res.json();
  })().catch(error => { indexPromise = null; throw error; });
  return indexPromise;
}

export function requestOrigin(req: Request) {
  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") || url.host;
  const proto = req.headers.get("x-forwarded-proto") || url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

export type ShareCard = {
  kind: ShareKind;
  ids: string[];
  at?: number;
  title: string;
  description: string;
  appPath: string;
};

const fmt = (n: number) => n.toLocaleString("en-US");
const seriesNames = (index: ShareIndex, ids: string[]) => ids.map(id => index.series[id]?.short || id.toUpperCase()).join(" · ");

/** Resolve a share request to a card, or null when the ids are unknown. */
export function resolveCard(index: ShareIndex, kind: string, rawId: string, rawAt?: string | null): ShareCard | null {
  const at = rawAt != null && rawAt !== "" && Number.isFinite(Number(rawAt)) ? Number(rawAt) : undefined;
  if (kind === "j") {
    const ids = [...new Set(decodeURIComponent(rawId).split(/[+, ]/))].filter(id => index.characters[id]?.journey).slice(0, 3);
    if (!ids.length) return null;
    const people = ids.map(id => index.characters[id]);
    const title = people.length === 1 ? `${people[0].name}'s journey` : `${people.map(p => p.name).join(" & ")} — journeys compared`;
    const description = people.length === 1
      ? `${fmt(people[0].journey!.places)} places across ${seriesNames(index, people[0].journey!.series)}, ${people[0].journey!.years[0] ?? "?"}–${people[0].journey!.years[1] ?? "?"}. Play it back in story order on the Walking Dead Universe atlas.`
      : `Follow ${people.map(p => p.name).join(", ")} side by side in story order — where they went, and where their paths crossed.`;
    return { kind, ids, at, title, description, appPath: `/?j=${ids.map(encodeURIComponent).join(",")}${at != null ? `&at=${Math.round(at)}` : ""}` };
  }
  const id = decodeURIComponent(rawId);
  if (kind === "p" && index.locations[id]) {
    const l = index.locations[id];
    return { kind, ids: [id], title: `${l.name} · TWDU Atlas`, description: `${l.type ? l.type[0].toUpperCase() + l.type.slice(1) : "Place"} in ${index.series[l.series]?.name ?? "the Walking Dead Universe"}${l.year ? `, from ${l.year}` : ""}. ${fmt(l.episodes)} episode${l.episodes === 1 ? "" : "s"} set here.`, appPath: `/?place=${encodeURIComponent(id)}` };
  }
  if (kind === "e" && index.episodes[id]) {
    const e = index.episodes[id];
    return { kind, ids: [id], title: `${e.title} (${index.series[e.series]?.short ?? ""} ${e.code}) · TWDU Atlas`, description: `Story year ${e.year} — #${e.order} in in-universe order. See where it happens on the Walking Dead Universe atlas.`, appPath: `/?ep=${encodeURIComponent(id)}` };
  }
  if (kind === "c" && index.characters[id]) {
    const c = index.characters[id];
    return { kind, ids: [id], title: `${c.name} · TWDU Atlas`, description: `${fmt(c.episodes)} episodes across ${seriesNames(index, c.series)}${c.journey ? `, ${fmt(c.journey.places)} mapped places` : ""}.`, appPath: `/?who=${encodeURIComponent(id)}` };
  }
  return null;
}

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Crawlers read the meta tags; people are sent straight on to the app. */
export function shareHtml(card: ShareCard, origin: string, imagePath: string) {
  const app = origin + card.appPath, image = origin + imagePath;
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<title>${esc(card.title)}</title>
<meta name="description" content="${esc(card.description)}">
<link rel="canonical" href="${esc(app)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="TWDU Atlas">
<meta property="og:title" content="${esc(card.title)}">
<meta property="og:description" content="${esc(card.description)}">
<meta property="og:url" content="${esc(app)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(card.title)}">
<meta name="twitter:description" content="${esc(card.description)}">
<meta name="twitter:image" content="${esc(image)}">
<meta http-equiv="refresh" content="0;url=${esc(card.appPath)}">
<script>location.replace(${JSON.stringify(card.appPath).replace(/</g, "\\u003c")})</script>
</head><body style="background:#0a0d0c;color:#ecebe4;font-family:system-ui,sans-serif"><p><a style="color:#f2794f" href="${esc(card.appPath)}">Open ${esc(card.title)} in TWDU Atlas</a></p></body></html>`;
}

// ---- Preview image ---------------------------------------------------------------
// Satori element trees built without JSX so this file needs no JSX runtime.
type Node = { type: string; props: Record<string, any> };
// Satori treats any children array as "multiple children" (which then demands
// display:flex), so a single child is passed through unwrapped.
export const h = (type: string, props: Record<string, any> = {}, ...children: any[]): Node => {
  const kids = children.flat().filter(c => c != null && c !== false);
  return { type, props: { ...props, ...(kids.length ? { children: kids.length === 1 ? kids[0] : kids } : {}) } };
};

/** Fetch a preview image as a data URL (JPEG/PNG/GIF only); null on any failure. */
export async function imageData(src?: string, timeoutMs = 3500): Promise<string | null> {
  if (!src) return null;
  try {
    const res = await fetch(src, { signal: AbortSignal.timeout(timeoutMs), headers: { Accept: "image/jpeg,image/png,image/gif" } });
    const type = (res.headers.get("content-type") || "").split(";")[0];
    if (!res.ok || !/^image\/(jpeg|png|gif)$/.test(type)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 4_000_000) return null;
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch { return null; }
}

function arc(a: [number, number], b: [number, number]) {
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1, bend = Math.min(len * .18, 60);
  return `M${a[0].toFixed(1)} ${a[1].toFixed(1)}Q${((a[0] + b[0]) / 2 - dy / len * bend).toFixed(1)} ${((a[1] + b[1]) / 2 + dx / len * bend).toFixed(1)} ${b[0].toFixed(1)} ${b[1].toFixed(1)}`;
}

/** Map panel: land plus each journey's legs, framed on the route. */
export function mapPanel(index: ShareIndex, w: number, hgt: number, routes: { journey?: Journey; color: string; at?: number }[], pin?: [number, number]) {
  const points = routes.flatMap(r => r.journey?.stops ?? []).map(([lat, lng]) => [lng, lat]);
  if (pin) points.push([pin[1], pin[0]]);
  const projection = geoEqualEarth();
  if (points.length > 1) projection.fitExtent([[70, 70], [w - 70, hgt - 70]], { type: "MultiPoint", coordinates: points } as any);
  else if (points.length === 1) projection.fitExtent([[70, 70], [w - 70, hgt - 70]], { type: "MultiPoint", coordinates: [[points[0][0] - 9, points[0][1] - 6], [points[0][0] + 9, points[0][1] + 6]] } as any);
  else projection.fitExtent([[10, 10], [w - 10, hgt - 10]], { type: "Sphere" } as any);
  // Keep regional routes from zooming in so far that 1:110m coastlines turn to blobs.
  if (projection.scale() > 2400) projection.scale(2400);
  const path = geoPath(projection);
  const land = path(feature(index.land, index.land.objects.land) as any) || "";
  const children: Node[] = [h("rect", { x: 0, y: 0, width: w, height: hgt, fill: "#0f1817" }), h("path", { d: land, fill: "#27302b", stroke: "#3a4540", "stroke-width": 1 })];
  // Later routes draw thinner on top, so overlapping journeys stay visible.
  routes.forEach((r, ri) => {
    if (!r.journey) return;
    const width = [5, 3.4, 2.2][ri] ?? 2;
    const pts = r.journey.stops.map(([lat, lng]) => projection([lng, lat]) as [number, number]);
    const reached = r.at == null ? pts.length - 1 : r.journey.beats.reduce((n, b, i) => (b <= r.at! ? i : n), -1);
    for (const [from, to] of r.journey.legs) {
      const done = to <= reached;
      children.push(h("path", { d: arc(pts[from], pts[to]), fill: "none", stroke: r.color, "stroke-width": done ? width : 2, "stroke-linecap": "round", opacity: done ? 0.95 : 0.3 }));
    }
    pts.forEach((p, i) => children.push(h("circle", { cx: p[0], cy: p[1], r: i === reached ? 11 : 5, fill: i <= reached ? r.color : "#0f1817", stroke: i === reached ? "#ffffff" : r.color, "stroke-width": i === reached ? 4 : 2 })));
  });
  if (pin) {
    const p = projection([pin[1], pin[0]]) as [number, number];
    children.push(h("circle", { cx: p[0], cy: p[1], r: 26, fill: "none", stroke: "#f2794f", "stroke-width": 3, opacity: 0.5 }), h("circle", { cx: p[0], cy: p[1], r: 12, fill: "#f2794f", stroke: "#ffffff", "stroke-width": 4 }));
  }
  return h("svg", { width: w, height: hgt, viewBox: `0 0 ${w} ${hgt}` }, ...children);
}

const brand = () => h("div", { style: { display: "flex", alignItems: "center", gap: 14, fontSize: 24, letterSpacing: 4, color: "#b3bab4" } },
  h("div", { style: { width: 16, height: 16, borderRadius: 8, background: "#d9502a" } }), "TWDU ATLAS");

export async function cardElement(index: ShareIndex, card: ShareCard): Promise<Node> {
  const W = 1200, H = 630;
  const shell = (left: Node, right: Node[]) => h("div", { style: { width: W, height: H, display: "flex", background: "#0a0d0c", color: "#ecebe4" } },
    h("div", { style: { width: 620, height: H, display: "flex", position: "relative" } }, left),
    h("div", { style: { flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "54px 56px 48px 48px" } }, ...right));
  const kicker = (text: string, color = "#f2794f") => h("div", { style: { fontSize: 24, letterSpacing: 5, color, textTransform: "uppercase" } }, text);
  const stat = (text: string) => h("div", { style: { fontSize: 30, color: "#d8ddd6", display: "flex" } }, text);

  if (card.kind === "j" || card.kind === "c") {
    const people = card.ids.map(id => ({ id, ...index.characters[id] }));
    const faces = await Promise.all(people.map(p => imageData(p.image)));
    const map = mapPanel(index, 620, H, people.map((p, i) => ({ journey: p.journey, color: JOURNEY_COLORS[i], at: card.kind === "j" ? card.at : undefined })));
    const single = people.length === 1, p0 = people[0];
    const facesRow = h("div", { style: { display: "flex" } }, ...people.map((p, i) => h("div", { style: { width: single ? 150 : 118, height: single ? 150 : 118, borderRadius: 999, border: `6px solid ${card.kind === "c" ? "#ecebe4" : JOURNEY_COLORS[i]}`, marginLeft: i ? -26 : 0, background: "#1b221f", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", fontSize: 44, color: "#b3bab4" } },
      faces[i] ? h("img", { src: faces[i], width: single ? 150 : 118, height: single ? 150 : 118, style: { objectFit: "cover", borderRadius: 999 } }) : p.name.split(/\s+/).map(w => w[0]).slice(0, 2).join(""))));
    const lines = single
      ? [p0.journey ? `${fmt(p0.journey.places)} places · ${fmt(p0.journey.km)} km` : `${fmt(p0.episodes)} episodes`, seriesNames(index, p0.journey?.series ?? p0.series), p0.journey ? `${p0.journey.years[0] ?? "?"}–${p0.journey.years[1] ?? "?"}` : ""]
      : people.map(p => `${p.name.split(" ")[0]}: ${fmt(p.journey?.places ?? 0)} places`);
    return shell(map, [
      h("div", { style: { display: "flex", flexDirection: "column", gap: 22 } },
        facesRow,
        kicker(card.kind === "c" ? "Character" : single ? "Journey" : "Journeys compared"),
        h("div", { style: { fontSize: single ? 68 : 50, lineHeight: 1.02, display: "flex", flexWrap: "wrap" } }, people.map(p => p.name).join(" & "))),
      h("div", { style: { display: "flex", flexDirection: "column", gap: 8 } }, ...lines.filter(Boolean).map(stat)),
      brand(),
    ]);
  }
  if (card.kind === "p") {
    const l = index.locations[card.ids[0]];
    const photo = await imageData(l.image);
    const left = photo
      ? h("img", { src: photo, width: 620, height: H, style: { objectFit: "cover" } })
      : mapPanel(index, 620, H, [], l.lat != null && l.lng != null ? [l.lat, l.lng] : undefined);
    return shell(left, [
      h("div", { style: { display: "flex", flexDirection: "column", gap: 18 } },
        kicker(`Place · ${index.series[l.series]?.short ?? ""}`, index.series[l.series]?.color),
        h("div", { style: { fontSize: 72, lineHeight: 1.02, display: "flex", flexWrap: "wrap" } }, l.name)),
      h("div", { style: { display: "flex", flexDirection: "column", gap: 8 } }, stat(`${l.type || "place"}${l.year ? ` · from ${l.year}` : ""}`), stat(`${fmt(l.episodes)} episode${l.episodes === 1 ? "" : "s"} set here`)),
      brand(),
    ]);
  }
  const e = index.episodes[card.ids[0]];
  const still = await imageData(e.image);
  const color = index.series[e.series]?.color ?? "#9aa6a1";
  return h("div", { style: { width: W, height: H, display: "flex", position: "relative", background: "#0a0d0c", color: "#ecebe4" } },
    still ? h("img", { src: still, width: W, height: H, style: { position: "absolute", left: 0, top: 0, objectFit: "cover" } }) : null,
    h("div", { style: { position: "absolute", left: 0, top: 0, width: W, height: H, display: "flex", backgroundImage: "linear-gradient(to top, rgba(10,13,12,0.96) 20%, rgba(10,13,12,0.35) 70%, rgba(10,13,12,0.15))" } }),
    h("div", { style: { position: "absolute", left: 64, right: 64, bottom: 54, display: "flex", flexDirection: "column", gap: 16 } },
      kicker(`${index.series[e.series]?.name ?? ""} · ${e.code}`, color),
      h("div", { style: { fontSize: 84, lineHeight: 1, display: "flex", flexWrap: "wrap" } }, e.title),
      h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 } }, stat(`Story year ${e.year} · #${e.order} in story order`), brand())));
}
