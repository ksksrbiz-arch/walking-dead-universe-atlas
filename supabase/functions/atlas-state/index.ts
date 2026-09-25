import { createClient } from "npm:@supabase/supabase-js@2";

// Per-session UI state (watch progress etc.). Public endpoint: the session id is the only
// key, so every write is size-capped. See context/references/supabase-backend.md.
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const MAX_STATE_BYTES = 32 * 1024;

function validSession(v: unknown): v is string {
  return typeof v === "string" && /^[A-Za-z0-9_-]{16,128}$/.test(v);
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
function cors(req: Request, res: Response) {
  const h = new Headers(res.headers);
  h.set("access-control-allow-origin", req.headers.get("origin") ?? "*");
  h.set("access-control-allow-methods", "GET,PUT,OPTIONS");
  h.set("access-control-allow-headers", "content-type");
  return new Response(res.body, { status: res.status, headers: h });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return cors(req, new Response(null, { status: 204 }));
  try {
    const session = new URL(req.url).searchParams.get("session");
    if (!validSession(session)) return cors(req, json({ error: "A valid session is required." }, 400));
    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("atlas_session_state")
        .select("state")
        .eq("session_id", session)
        .maybeSingle();
      if (error) throw error;
      return cors(req, json({ state: data?.state ?? null }));
    }
    if (req.method === "PUT") {
      const declared = Number(req.headers.get("content-length") || 0);
      if (declared > MAX_STATE_BYTES) return cors(req, json({ error: "State payload too large." }, 413));
      const raw = await req.text();
      if (raw.length > MAX_STATE_BYTES) return cors(req, json({ error: "State payload too large." }, 413));
      let body: unknown = null;
      try {
        body = JSON.parse(raw);
      } catch {
        body = null;
      }
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return cors(req, json({ error: "Invalid state payload." }, 400));
      }
      const { error } = await supabase
        .from("atlas_session_state")
        .upsert(
          { session_id: session, state: { ...(body as Record<string, unknown>), updatedAt: new Date().toISOString() } },
          { onConflict: "session_id" },
        );
      if (error) throw error;
      return cors(req, json({ ok: true }));
    }
    return cors(req, json({ error: "Method not allowed." }, 405));
  } catch (e) {
    console.error(e);
    return cors(req, json({ error: "Database request failed." }, 500));
  }
});
