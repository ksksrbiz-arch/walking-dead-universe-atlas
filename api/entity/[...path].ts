import { readBlobJson, cachedJson, json } from "../_lib/vercel-atlas";

export default async function handler(req: Request) {
  if (req.method !== "GET") return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET" } });

  const path = new URL(req.url).pathname.replace(/^\/api\/entity\/?/, "");
  const [type, ...parts] = path.split("/").filter(Boolean);
  const id = parts.join("/");
  if (!type || !id || !/^[a-z0-9_-]+$/i.test(type) || !/^[a-z0-9._:-]+$/i.test(id)) {
    return json({ ok: false, error: "Invalid entity path" }, { status: 400 });
  }

  try {
    const entity = await cachedJson("atlas:entity:" + type + ":" + id, async () => {
      const collection = await readBlobJson<Record<string, unknown>>(type + ".json");
      return collection?.[id] ?? null;
    }, 600);
    if (!entity) return json({ ok: false, error: "Entity not found" }, { status: 404 });
    return json({ ok: true, type, id, entity });
  } catch (error) {
    console.error("atlas entity error", error);
    return json({ ok: false, error: "Entity service unavailable" }, { status: 503 });
  }
}
