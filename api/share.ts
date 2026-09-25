import { readFile } from "node:fs/promises";
import { join } from "node:path";

// /j/:ids, /p/:id, /e/:id, /c/:id (vercel.json rewrites) → a tiny HTML page
// whose meta tags give chat apps and social sites a rich preview, then sends
// people on to the app state the link describes.
//
// Self-contained on purpose (duplicated with api/og.ts, which needs the same
// loadShareIndex/requestOrigin/resolveCard): Vercel runs api/*.ts files
// individually and its tracer does not reliably include a sibling module
// imported from elsewhere under api/ (confirmed empirically — see
// context/references/journeys-and-sharing.md and scripts/check-api-imports.mjs,
// which now requires every api/*.ts file to be import-free of local modules).
// Reads dist/share-index.json, which `vite build` emits from the same
// modules the app uses (src/lib/shareIndex.ts).

type Journey = { places: number; km: number; series: string[]; years: [number | null, number | null]; stops: [number, number][]; legs: [number, number][]; beats: number[] };
type ShareIndex = {
  version: 1;
  series: Record<string, { name: string; short: string; color: string }>;
  characters: Record<string, { name: string; image?: string; series: string[]; episodes: number; journey?: Journey }>;
  locations: Record<string, { name: string; type: string; series: string; year: number; image?: string; lat?: number; lng?: number; episodes: number }>;
  episodes: Record<string, { title: string; code: string; series: string; year: string; image?: string; order: number }>;
  land: any;
};
type ShareKind = "j" | "p" | "e" | "c";
type ShareCard = { kind: ShareKind; ids: string[]; at?: number; title: string; description: string; appPath: string };

let indexPromise: Promise<ShareIndex> | null = null;
function loadShareIndex(origin: string): Promise<ShareIndex> {
  indexPromise ??= (async () => {
    // A local build first (tests, `vercel dev`), then the deployment's own static copy.
    try { return JSON.parse(await readFile(join(process.cwd(), "dist", "share-index.json"), "utf8")); } catch {}
    const res = await fetch(new URL("/share-index.json", origin));
    if (!res.ok) throw new Error("share index unavailable: " + res.status);
    return res.json();
  })().catch(error => { indexPromise = null; throw error; });
  return indexPromise;
}

function requestOrigin(req: Request) {
  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") || url.host;
  const proto = req.headers.get("x-forwarded-proto") || url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

const fmt = (n: number) => n.toLocaleString("en-US");
const seriesNames = (index: ShareIndex, ids: string[]) => ids.map(id => index.series[id]?.short || id.toUpperCase()).join(" · ");

/** Resolve a share request to a card, or null when the ids are unknown. */
function resolveCard(index: ShareIndex, kind: string, rawId: string, rawAt?: string | null): ShareCard | null {
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
function shareHtml(card: ShareCard, origin: string, imagePath: string) {
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

export async function GET(req: Request) {
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") || "";
  const id = url.searchParams.get("id") || "";
  const origin = requestOrigin(req);
  try {
    const index = await loadShareIndex(origin);
    const card = resolveCard(index, kind, id, url.searchParams.get("at"));
    if (!card) return Response.redirect(origin + "/", 302);
    const og = `/api/og?kind=${card.kind}&id=${card.ids.map(encodeURIComponent).join("%2B")}${card.at != null ? `&at=${Math.round(card.at)}` : ""}`;
    return new Response(shareHtml(card, origin, og), {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800" },
    });
  } catch (error) {
    console.error("atlas share failed", error);
    return Response.redirect(origin + "/", 302);
  }
}
