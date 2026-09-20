import { getAtlasStore } from "../lib/blob-store.mts";
import type { Config } from "@netlify/functions";

const store = getAtlasStore("atlas-state");

function validSession(value: string | null) {
  return !!value && /^[A-Za-z0-9_-]{16,128}$/.test(value);
}

export default async (req: Request) => {
  const url = new URL(req.url);
  const session = url.searchParams.get("session");

  if (!validSession(session)) {
    return Response.json({ error: "A valid session is required." }, { status: 400 });
  }

  const key = `sessions/${session}`;

  if (req.method === "GET") {
    const state = await store.get(key, { type: "json" });
    return Response.json({ state: state ?? null }, { headers: { "Cache-Control": "no-store" } });
  }

  if (req.method === "PUT") {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return Response.json({ error: "Invalid state payload." }, { status: 400 });
    }

    await store.setJSON(key, { ...body, updatedAt: new Date().toISOString() });
    return Response.json({ ok: true });
  }

  return Response.json({ error: "Method not allowed." }, { status: 405 });
};

export const config: Config = {
  path: "/api/atlas/state",
};
