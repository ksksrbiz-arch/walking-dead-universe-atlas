import { loadShareIndex, requestOrigin, resolveCard, shareHtml } from "./_lib/atlas-share";

// /j/:ids, /p/:id, /e/:id, /c/:id (vercel.json rewrites) → HTML meta page.
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
    return new Response(shareHtml(card, origin, og), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800" } });
  } catch (error) {
    console.error("atlas share failed", error);
    return Response.redirect(origin + "/", 302);
  }
}
