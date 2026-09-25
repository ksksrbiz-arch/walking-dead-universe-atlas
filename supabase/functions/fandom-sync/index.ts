const API = "https://walkingdead.fandom.com/api.php";
const SERIES = {
  twd: ["tv universe", "tv series"],
  ftwd: ["fear"],
  wb: ["world beyond"],
  dead: ["dead city"],
  daryl: ["daryl series"],
  owl: ["the ones who live", "tv universe"],
  tales: ["tales"],
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const cors = () => ({
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST,OPTIONS",
  "access-control-allow-headers": "content-type",
});
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...cors() },
  });
async function fj(u: string) {
  for (let a = 1; a <= 4; a++) {
    try {
      const r = await fetch(u, {
        headers: { accept: "application/json", "user-agent": "TWDU-Atlas-Fandom-Sync/10.0" },
        signal: AbortSignal.timeout(12000),
      });
      const t = await r.text();
      if (r.ok) return JSON.parse(t);
      if (r.status < 500 && !([408, 425, 429] as number[]).includes(r.status))
        throw Error(r.status + " " + t.slice(0, 300));
    } catch (e) {
      if (a === 4) throw e;
    }
    await sleep(Math.min(5000, 400 * 2 ** (a - 1)));
  }
  throw Error("request failed");
}
function chunk<T>(a: T[], n: number) {
  const o: T[][] = [];
  for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n));
  return o;
}
function score(title: string, row: any) {
  const t = title.toLowerCase(),
    ns = [String(row.name), ...(Array.isArray(row.aliases) ? row.aliases : [])].filter(Boolean).map(String);
  let s = 0;
  for (const name of ns) {
    const n = name.toLowerCase();
    if (t === n) s = Math.max(s, 240);
    if (t === n + " (tv universe)") s = Math.max(s, 420);
    if (t.startsWith(n + " (tv universe)")) s = Math.max(s, 360);
    if (t.startsWith(n + " (")) s = Math.max(s, 150);
    if (t.includes(n)) s = Math.max(s, 70);
  }
  for (const sid of row.seriesIds || [])
    for (const token of SERIES[sid] || []) if (t.includes(token)) s += 120;
  if (
    /\(small bites\)|\(comic universe\)|\(comic series\)|\(video game\)|\(novel\)|\(no man's land\)|\(survivors\)|\(assault\)|\(aftermath\)|\(all-stars\)/i.test(
      title,
    )
  )
    s -= 220;
  if (/safehouse/i.test(title)) s -= 120;
  return s;
}
async function resolve(row: any) {
  let best: any = null;
  for (const name of [String(row.name), ...(Array.isArray(row.aliases) ? row.aliases : [])].filter(Boolean)) {
    const p = new URLSearchParams({
      action: "query",
      list: "search",
      srsearch: String(name),
      srnamespace: "0",
      srlimit: "15",
      format: "json",
      formatversion: "2",
    });
    const d = await fj(API + "?" + p);
    for (const x of d?.query?.search || []) {
      const s = score(String(x.title), row);
      if (!best || s > best.score) best = { title: x.title, score: s, matchedName: name };
    }
    if (best?.score >= 420) break;
  }
  return best;
}
async function page(title: string) {
  const p = new URLSearchParams({
    action: "query",
    prop: "info|revisions|pageimages",
    titles: title,
    inprop: "url",
    piprop: "original",
    rvprop: "content|ids|timestamp",
    rvslots: "main",
    redirects: "1",
    format: "json",
    formatversion: "2",
  });
  return (await fj(API + "?" + p))?.query?.pages?.[0];
}
async function cached(rows: any[], type: string) {
  const base = Deno.env.get("SUPABASE_URL")!,
    key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    ids = rows.map((x) => String(x.id)).join(",");
  if (!ids) return new Set();
  const r = await fetch(
    base +
      "/rest/v1/fandom_entity_cache?select=entity_id&entity_type=eq." +
      type +
      "&sync_status=eq.ok&entity_id=in." +
      encodeURIComponent("(" + ids + ")"),
    { headers: { apikey: key, authorization: "Bearer " + key } },
  );
  return r.ok ? new Set((await r.json()).map((x: any) => x.entity_id)) : new Set();
}
async function persist(rows: any[]) {
  const base = Deno.env.get("SUPABASE_URL")!,
    key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    now = new Date().toISOString();
  for (const part of chunk(rows, 100)) {
    const r = await fetch(base + "/rest/v1/fandom_entity_cache?on_conflict=entity_type%2Centity_id", {
      method: "POST",
      headers: {
        apikey: key,
        authorization: "Bearer " + key,
        "content-type": "application/json",
        prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(part.map((x) => ({ ...x, synced_at: now }))),
    });
    if (!r.ok) throw Error("cache write " + r.status + " " + (await r.text()).slice(0, 300));
  }
}
async function mapLimit<T, R>(a: T[], n: number, fn: (x: T) => Promise<R>) {
  const o: R[] = new Array(a.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= a.length) return;
      o[i] = await fn(a[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, a.length) }, worker));
  return o;
}
// Auth: this function writes public.fandom_entity_cache with the service role and fans out to the
// Fandom API, so it is NOT public. Callers (scripts/sync-fandom-supabase.mjs, api/cron/fandom-sync.ts)
// must send `Authorization: Bearer <token>` where token is FANDOM_SYNC_TOKEN (a dedicated secret, set with
// `supabase secrets set FANDOM_SYNC_TOKEN=...`) or, as a fallback, the project's service role key.
const encoder = new TextEncoder();
function safeEqual(a: string, b: string) {
  const x = encoder.encode(a),
    y = encoder.encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
function authorized(req: Request) {
  const header = req.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!presented) return false;
  const accepted = [Deno.env.get("FANDOM_SYNC_TOKEN"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")].filter(
    (t): t is string => Boolean(t),
  );
  return accepted.some((token) => safeEqual(presented, token));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
  if (req.method !== "POST") return json("Method Not Allowed", 405);
  if (!authorized(req)) return json({ error: "Unauthorized" }, 401);
  try {
    const b = await req.json(),
      input = b.entities || {},
      opt = b.options || {},
      max = Math.min(300, Math.max(1, Number(opt.maxPerType || 100))),
      con = Math.min(8, Math.max(1, Number(opt.concurrency || 6))),
      force = Boolean(opt.force),
      out: any = {
        version: 10,
        generatedAt: new Date().toISOString(),
        source: "walking-dead-wiki",
        characters: {},
        locations: {},
        episodes: {},
      },
      writes: any[] = [],
      missing: any[] = [],
      stats: any = { requests: 0, skipped: 0 };
    for (const type of ["characters", "locations", "episodes"]) {
      const rows = Array.isArray(input[type])
        ? input[type].filter((x: any) => x?.id && x?.name).slice(0, max)
        : [];
      const c = force ? new Set() : await cached(rows, type);
      stats.skipped += c.size;
      const work = rows.filter((x: any) => !c.has(String(x.id)));
      const res = await mapLimit(work, con, async (row: any) => {
        const m = await resolve(row);
        stats.requests++;
        if (!m || m.score < 120)
          return {
            missing: {
              entityType: type,
              id: String(row.id),
              canonicalName: String(row.name),
              resolution: m || null,
            },
          };
        const p = await page(m.title);
        stats.requests++;
        if (!p || p.missing)
          return {
            missing: { entityType: type, id: String(row.id), canonicalName: String(row.name), resolution: m },
          };
        return {
          rec: {
            entity_type: type,
            entity_id: String(row.id),
            canonical_name: String(row.name),
            fandom_title: p.title,
            fandom_url: p.fullurl || null,
            fandom_revision: p.revisions?.[0]?.revid ? String(p.revisions[0].revid) : null,
            image_urls: p.original?.source ? [p.original.source] : [],
            metadata: {
              id: String(row.id),
              source: "walking-dead-wiki",
              pageTitle: p.title,
              sourceUrl: p.fullurl || null,
              resolutionScore: m.score,
              seriesIds: row.seriesIds || [],
            },
            sync_status: "ok",
            error_message: null,
          },
        };
      });
      for (const x of res) {
        if ((x as any).rec) {
          const r = (x as any).rec;
          out[type][r.entity_id] = r;
          writes.push(r);
        } else missing.push((x as any).missing);
      }
    }
    const mr = missing.map((x) => ({
      entity_type: x.entityType,
      entity_id: x.id,
      canonical_name: x.canonicalName,
      fandom_title: null,
      fandom_url: null,
      fandom_revision: null,
      image_urls: [],
      metadata: { source: "walking-dead-wiki", resolution: x.resolution || null },
      sync_status: "missing",
      error_message: "Fandom page not confidently resolved",
    }));
    await persist([...writes, ...mr]);
    return json({
      ...out,
      stats: {
        ...stats,
        characters: Object.keys(out.characters).length,
        locations: Object.keys(out.locations).length,
        episodes: Object.keys(out.episodes).length,
        missing: missing.length,
        cacheWritten: writes.length + mr.length,
      },
    });
  } catch (e) {
    return json({ error: "Fandom sync failed", detail: e instanceof Error ? e.message : "unknown" }, 502);
  }
});
