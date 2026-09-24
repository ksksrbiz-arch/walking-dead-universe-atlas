import { ImageResponse } from "@vercel/og";
import { cardElement, loadShareIndex, requestOrigin, resolveCard } from "../lib/atlas-share";

// 1200×630 preview card for a share link (see api/share.ts).
export async function GET(req: Request) {
  const url = new URL(req.url);
  try {
    const index = await loadShareIndex(requestOrigin(req));
    const card = resolveCard(index, url.searchParams.get("kind") || "", url.searchParams.get("id") || "", url.searchParams.get("at"));
    if (!card) return new Response("Unknown share target", { status: 404 });
    return new ImageResponse(await cardElement(index, card) as any, {
      width: 1200,
      height: 630,
      headers: { "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800" },
    });
  } catch (error) {
    console.error("atlas og failed", error);
    return new Response("Preview unavailable", { status: 503 });
  }
}
