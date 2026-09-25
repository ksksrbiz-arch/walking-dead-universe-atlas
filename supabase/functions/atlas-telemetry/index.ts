import { createClient } from "npm:@supabase/supabase-js@2";

// Anonymous performance telemetry from the browser (src/lib/performance.ts, sent with
// sendBeacon, so the body may arrive as text/plain). Aggregates only: name/count/sum/max.
// public.atlas_upsert_telemetry is executable by service_role only, so this function is the
// single validated entry point. See context/references/supabase-backend.md.
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST,OPTIONS",
  "access-control-allow-headers": "content-type",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...CORS },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json("Method Not Allowed", 405);
  try {
    const body = await req.json();
    if (!Array.isArray(body?.metrics) || body.metrics.length === 0 || body.metrics.length > 40) {
      return json("Invalid metrics", 400);
    }
    const clean = body.metrics
      .filter((m: any) => typeof m?.name === "string" && m.name.length < 80 && Number.isFinite(m.value))
      .slice(0, 40);
    if (!clean.length) return json("No valid metrics", 400);
    const { error } = await supabase.rpc("atlas_upsert_telemetry", { p_metrics: clean, p_session_increment: 1 });
    if (error) throw error;
    return json({ ok: true, accepted: clean.length });
  } catch (e) {
    console.error(e);
    return json("Invalid telemetry", 400);
  }
});
