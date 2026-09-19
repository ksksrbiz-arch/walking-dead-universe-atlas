import { getDatabase } from "@netlify/database";
import type { Config } from "@netlify/functions";

type Bookmark = {
  id?: string;
  sessionId: string;
  itemKind: string;
  itemId: string;
  label?: string;
  metadata?: Record<string, unknown>;
};

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function validSession(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{16,128}$/.test(value);
}

function validateBookmark(input: unknown): Bookmark | null {
  if (!input || typeof input !== "object") return null;
  const value = input as Record<string, unknown>;
  if (!validSession(value.sessionId) || typeof value.itemKind !== "string" || typeof value.itemId !== "string") return null;
  return {
    sessionId: value.sessionId,
    itemKind: value.itemKind.slice(0, 40),
    itemId: value.itemId.slice(0, 160),
    label: typeof value.label === "string" ? value.label.slice(0, 240) : undefined,
    metadata: value.metadata && typeof value.metadata === "object" ? value.metadata as Record<string, unknown> : {},
  };
}

export default async (req: Request) => {
  const db = getDatabase();
  const url = new URL(req.url);

  if (req.method === "GET") {
    const sessionId = url.searchParams.get("session");
    if (!validSession(sessionId)) return json({ error: "A valid session is required." }, 400);
    const rows = await db.sql`
      SELECT id, session_id AS "sessionId", item_kind AS "itemKind", item_id AS "itemId",
             label, metadata, created_at AS "createdAt", updated_at AS "updatedAt"
      FROM atlas_bookmarks WHERE session_id = ${sessionId} ORDER BY updated_at DESC
    `;
    return json({ bookmarks: rows });
  }

  if (req.method === "POST") {
    const bookmark = validateBookmark(await req.json().catch(() => null));
    if (!bookmark) return json({ error: "Invalid bookmark payload." }, 400);
    const id = bookmark.id ?? crypto.randomUUID();
    const rows = await db.sql`
      INSERT INTO atlas_bookmarks (id, session_id, item_kind, item_id, label, metadata, updated_at)
      VALUES (${id}, ${bookmark.sessionId}, ${bookmark.itemKind}, ${bookmark.itemId}, ${bookmark.label ?? null}, ${JSON.stringify(bookmark.metadata ?? {})}::jsonb, NOW())
      ON CONFLICT (session_id, item_kind, item_id) DO UPDATE SET label = EXCLUDED.label, metadata = EXCLUDED.metadata, updated_at = NOW()
      RETURNING id, session_id AS "sessionId", item_kind AS "itemKind", item_id AS "itemId", label, metadata, created_at AS "createdAt", updated_at AS "updatedAt"
    `;
    return json({ bookmark: rows[0] }, 201);
  }

  if (req.method === "DELETE") {
    const sessionId = url.searchParams.get("session");
    const itemKind = url.searchParams.get("kind");
    const itemId = url.searchParams.get("id");
    if (!validSession(sessionId) || !itemKind || !itemId) return json({ error: "session, kind, and id are required." }, 400);
    await db.sql`DELETE FROM atlas_bookmarks WHERE session_id = ${sessionId} AND item_kind = ${itemKind} AND item_id = ${itemId}`;
    return json({ ok: true });
  }

  return json({ error: "Method not allowed." }, 405);
};

export const config: Config = {
  path: "/api/atlas/bookmarks",
};
