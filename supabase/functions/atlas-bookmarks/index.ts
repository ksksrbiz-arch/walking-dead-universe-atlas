import { createClient } from "npm:@supabase/supabase-js@2";

// Per-session bookmarks. Public endpoint: the session id is the only key, so every write is
// size-capped and each session is limited. See context/references/supabase-backend.md.
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const MAX_BODY_BYTES = 16 * 1024;
const MAX_METADATA_BYTES = 4 * 1024;
const MAX_BOOKMARKS_PER_SESSION = 500;

function validSession(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{16,128}$/.test(value);
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
function cors(req: Request) {
  return req.headers.get("origin") ?? "*";
}
function withCors(res: Response, req: Request) {
  const h = new Headers(res.headers);
  h.set("access-control-allow-origin", cors(req));
  h.set("access-control-allow-methods", "GET,POST,DELETE,OPTIONS");
  h.set("access-control-allow-headers", "content-type");
  return new Response(res.body, { status: res.status, headers: h });
}

const COLUMNS = "id,session_id,item_kind,item_id,label,metadata,created_at,updated_at";
const toBookmark = (r: any) => ({
  id: r.id,
  sessionId: r.session_id,
  itemKind: r.item_kind,
  itemId: r.item_id,
  label: r.label,
  metadata: r.metadata,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return withCors(new Response(null, { status: 204 }), req);
  try {
    const url = new URL(req.url);
    if (req.method === "GET") {
      const sessionId = url.searchParams.get("session");
      if (!validSession(sessionId)) return withCors(json({ error: "A valid session is required." }, 400), req);
      const { data, error } = await supabase
        .from("atlas_bookmarks")
        .select(COLUMNS)
        .eq("session_id", sessionId)
        .order("updated_at", { ascending: false })
        .limit(MAX_BOOKMARKS_PER_SESSION);
      if (error) throw error;
      return withCors(json({ bookmarks: (data ?? []).map(toBookmark) }), req);
    }
    if (req.method === "POST") {
      const declared = Number(req.headers.get("content-length") || 0);
      if (declared > MAX_BODY_BYTES) return withCors(json({ error: "Bookmark payload too large." }, 413), req);
      const raw = await req.text();
      if (raw.length > MAX_BODY_BYTES) return withCors(json({ error: "Bookmark payload too large." }, 413), req);
      let input: any = null;
      try {
        input = JSON.parse(raw);
      } catch {
        input = null;
      }
      if (
        !input ||
        typeof input !== "object" ||
        !validSession(input.sessionId) ||
        typeof input.itemKind !== "string" ||
        typeof input.itemId !== "string"
      ) {
        return withCors(json({ error: "Invalid bookmark payload." }, 400), req);
      }
      const metadata =
        input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata) ? input.metadata : {};
      if (JSON.stringify(metadata).length > MAX_METADATA_BYTES) {
        return withCors(json({ error: "Bookmark metadata too large." }, 413), req);
      }
      const row = {
        session_id: input.sessionId,
        item_kind: input.itemKind.slice(0, 40),
        item_id: input.itemId.slice(0, 160),
        label: typeof input.label === "string" ? input.label.slice(0, 240) : null,
        metadata,
      };
      const { count, error: countError } = await supabase
        .from("atlas_bookmarks")
        .select("id", { count: "exact", head: true })
        .eq("session_id", row.session_id);
      if (countError) throw countError;
      if ((count ?? 0) >= MAX_BOOKMARKS_PER_SESSION) {
        const { data: existing, error: existingError } = await supabase
          .from("atlas_bookmarks")
          .select("id")
          .eq("session_id", row.session_id)
          .eq("item_kind", row.item_kind)
          .eq("item_id", row.item_id)
          .maybeSingle();
        if (existingError) throw existingError;
        if (!existing) return withCors(json({ error: "Bookmark limit reached for this session." }, 429), req);
      }
      const { data, error } = await supabase
        .from("atlas_bookmarks")
        .upsert(row, { onConflict: "session_id,item_kind,item_id" })
        .select(COLUMNS)
        .single();
      if (error) throw error;
      return withCors(json({ bookmark: toBookmark(data) }, 201), req);
    }
    if (req.method === "DELETE") {
      const sessionId = url.searchParams.get("session"),
        itemKind = url.searchParams.get("kind"),
        itemId = url.searchParams.get("id");
      if (!validSession(sessionId) || !itemKind || !itemId) {
        return withCors(json({ error: "session, kind, and id are required." }, 400), req);
      }
      const { error } = await supabase
        .from("atlas_bookmarks")
        .delete()
        .eq("session_id", sessionId)
        .eq("item_kind", itemKind)
        .eq("item_id", itemId);
      if (error) throw error;
      return withCors(json({ ok: true }), req);
    }
    return withCors(json({ error: "Method not allowed." }, 405), req);
  } catch (e) {
    console.error(e);
    return withCors(json({ error: "Database request failed." }, 500), req);
  }
});
