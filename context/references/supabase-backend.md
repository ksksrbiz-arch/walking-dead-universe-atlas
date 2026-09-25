# Supabase backend (reference)

Project `qflqfvoxdzkibpzfrwop` (us-west-1, Postgres 17). Source of truth for everything deployed there lives in
`supabase/`: `functions/<name>/index.ts`, `migrations/`, `config.toml`. Live state was audited and hardened on
2026-09-25; this file records the contracts so nobody has to reverse-engineer them again.

## Access model (read this first)
- Every table has **RLS enabled and zero policies**, and `anon` / `authenticated` hold **no grants**. The public
  PostgREST API can read and write nothing.
- All data access goes through the edge functions below, which use the **service role** (bypasses RLS).
- `public.atlas_upsert_telemetry` is `SECURITY DEFINER` and executable by `service_role` **only**. If it ever
  becomes callable by `anon`, anyone can bypass the telemetry function's validation (unbounded metric names).
- The advisor reports `rls_enabled_no_policy` (INFO) for all five tables. That is the intended deny-all setup, not a bug.
- Do not add `anon` grants or permissive policies without a written reason here.

## Edge functions
All six were deployed with `verify_jwt = false`: browsers call them with no user session, so each enforces its own limits.

| Function | Who calls it | Method / contract | Limits / auth |
|---|---|---|---|
| `atlas-media` | Browser, directly (`MEDIA_PROXY` in `src/lib/media.ts`) | `GET ?url=<encoded image URL>` returns the image | https + allow-listed hosts only (Fandom/wikia, AMC CDN); raster types only (avif/webp/jpeg/png/gif, **no SVG**); 12 MB cap; every redirect hop re-validated (max 3). Sends `s-maxage`, but see "Caching" below |
| `atlas-telemetry` | Browser (`src/lib/performance.ts`, `sendBeacon`) | `POST {metrics:[{name,value}]}`, 1-40 metrics | name < 80 chars, finite value; calls `atlas_upsert_telemetry` |
| `atlas-state` | Nothing yet (planned: `/api/atlas/state` rewrite) | `GET/PUT ?session=<16-128 char id>` | 32 KB body cap; session id is the only key |
| `atlas-bookmarks` | Nothing yet (planned: `/api/atlas/bookmarks` rewrite) | `GET/POST/DELETE` | 16 KB body, 4 KB metadata, 500 bookmarks/session (429 beyond) |
| `fandom-sync` | `scripts/sync-fandom-supabase.mjs` (manual), `api/cron/fandom-sync.ts` (unregistered) | `POST {entities:{characters,locations,episodes}, options}` | **Bearer required**: `FANDOM_SYNC_TOKEN` or the service role key (401 otherwise). Max 300 entities/type, concurrency <= 8 |

`atlas-state` and `atlas-bookmarks` hold 0 rows and **nothing in `src/`, `api/` or `scripts/` calls them** (only the
`vercel.json` rewrites `/api/atlas/state` and `/api/atlas/bookmarks` exist). The limits are there so they are safe
when the app is wired up. `/api/fandom-image` (rewritten to `atlas-media`) is likewise unused.

### fandom-sync details
- Resolves each entity to a wiki page (scored title match), then upserts `fandom_entity_cache` and returns the
  same records. `options.force` overwrites cached rows, which is why the endpoint must never be public.
- Set a dedicated secret so callers do not need the service key:
  `supabase secrets set FANDOM_SYNC_TOKEN=<random> --project-ref qflqfvoxdzkibpzfrwop`, then export the same value
  as `FANDOM_SYNC_TOKEN` where the caller runs.
- `api/cron/fandom-sync.ts` already sends `Bearer $FANDOM_SYNC_TOKEN`, but its body has **no entities**, so even
  authenticated it does nothing useful. It is unregistered in `vercel.json` (see `scheduled-ingestion.md`).

## Tables
`atlas_bookmarks`, `atlas_session_state`, `atlas_telemetry_metrics` (name/count/sum/max), `atlas_telemetry_sessions`
(single row, id 1), `fandom_entity_cache` (563 rows at audit time). Full DDL: `supabase/migrations/20260925000000_baseline_atlas_backend.sql`
(idempotent; a no-op on the live project).

## Deploy and verify
```
supabase functions deploy <name> --project-ref qflqfvoxdzkibpzfrwop     # config.toml sets verify_jwt=false
```
After any change, check from the deployed site's origin (CORS allows it) that:
1. `POST fandom-sync` with no `Authorization` returns **401**.
2. `atlas-state` PUT over 32 KB returns **413**; `atlas-bookmarks` POST with metadata over 4 KB returns **413**.
3. `atlas-media?url=https://example.com/a.png` returns **403**; a real Fandom image returns 200 with an image type.
4. Security advisor shows no `WARN` (only the 5 INFO `rls_enabled_no_policy`).
5. In SQL: `has_function_privilege('anon','public.atlas_upsert_telemetry(jsonb,bigint)','execute')` is **false**.

## Caching (`atlas-media`) - verified 2026-09-25
Every image the app shows from Fandom/AMC is one Supabase invocation per load per visitor (about 13k/day at audit
time, mostly automated test traffic). The `/api/atlas/media` Vercel rewrite in `vercel.json` looks like a way to get CDN
caching, but it **does not cache**: Supabase's edge adds a fresh `Set-Cookie: __cf_bm=...` to every response and Vercel
does not cache responses that set cookies. Three plain requests to production all returned `x-vercel-cache: MISS`, so
routing the browser through that rewrite would only add a hop. Do not switch `MEDIA_PROXY` to it without re-testing.

The real fix is already in the repo but **not deployed**: `workers/atlas-media-proxy` (Cloudflare Worker
`walking-dead-atlas-media`; it uses the Workers cache and reports `x-atlas-media-cache: HIT|MISS`). To use it:
`cd workers/atlas-media-proxy && npx wrangler deploy`, then set `VITE_ATLAS_MEDIA_PROXY` on the Vercel project to the
worker URL and redeploy. Before that, port this function's hardening to the worker (it currently accepts any `image/*`
including SVG and follows redirects blindly), and re-check `x-atlas-media-cache: HIT` on a second request.

## Known gaps / not done
- **No rate limiting** on any public function (Edge Functions have no built-in limiter). Until the worker above is
  deployed, watch invocation counts against the plan quota.
- `fandom-image` is still deployed but **unused** (`vercel.json` maps `/api/fandom-image` to `atlas-media`). Its source is
  not vendored. Remove it with `supabase functions delete fandom-image --project-ref qflqfvoxdzkibpzfrwop`.
- `atlas-media` cannot be called with `HEAD` (405).
- Session ids for `atlas-state` / `atlas-bookmarks` are bearer secrets (whoever knows one can read and overwrite that
  session). When the app starts using them, generate ids with `crypto.randomUUID()` and never derive them from
  anything guessable; the functions only enforce 16-128 characters of `[A-Za-z0-9_-]`.
- `atlas_upsert_telemetry` writes unbounded distinct metric names if the edge function is ever loosened; keep the
  name-length and array-size checks there.
