import { readBlobJson, cachedJson, json } from "../_lib/vercel-atlas";

export default async function handler(req: Request) {
  if (req.method !== "GET") return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET" } });
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim().toLowerCase();
  if (q.length < 2) return json({ ok: true, results: [] });
  try {
    const results = await cachedJson("atlas:search:" + encodeURIComponent(q), async () => {
      const index = await readBlobJson<Array<{ id: string; type: string; name: string; description?: string }>>("search-index.json");
      if (!index) return [];
      return index.filter(item => [item.name, item.description, item.id].some(value => String(value || "").toLowerCase().includes(q))).slice(0, 50);
    }, 300);
    return json({ ok: true, results });
  } catch (error) {
    console.error("atlas search error", error);
    return json({ ok: false, results: [], error: "Search service unavailable" }, { status: 503 });
  }
}
