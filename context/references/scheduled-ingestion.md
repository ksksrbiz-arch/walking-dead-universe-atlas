# Scheduled ingestion (reference) — status: scaffolded, not wired up

GitHub Actions is ruled out for this repo (billing). The intended replacement is
Vercel-native scheduling (`vercel.json` `crons`), not GitHub Actions. Real
scaffolding for this already exists in the repo, but nothing end-to-end works
yet. This file is the honest record of what's built, what isn't, and exactly
what unblocks the rest — so it doesn't get silently rebuilt or lost.

## What already exists

- `api/entity/[...path].ts`, `api/search/[...path].ts`, `api/media/[...path].ts` — Blob-backed
  runtime read endpoints. Self-contained per the `api/*.ts` rule (see
  `journeys-and-sharing.md`). These work if Blob actually has data in it.
- `scripts/sync-vercel-atlas.mjs` — manual script, requires `BLOB_READ_WRITE_TOKEN`,
  pushes `data/*.json` (the allow-listed files) and `public/media-cache/` +
  `public/media/` into Vercel Blob under `twdu-atlas-data/` / `twdu-atlas-media/`.
  Not invoked by anything automatically.
- `api/cron/fandom-sync.ts`, `api/cron/media-sync.ts` — Vercel Cron-triggered dispatchers.
  Gated on `CRON_SECRET`; POST to `FANDOM_SYNC_ENDPOINT`/`MEDIA_SYNC_ENDPOINT` with a
  bearer token, then **discard the response** — they only log dispatch status, they
  don't persist anything themselves. Currently **not** registered in `vercel.json`
  (removed 2026-09-25 — see below).
- `scripts/sync-fandom-supabase.mjs` — a *different*, manual, local script. POSTs
  character/location/episode names to a Supabase edge function (`fandom-sync`,
  default endpoint `https://qflqfvoxdzkibpzfrwop.supabase.co/functions/v1/fandom-sync`)
  and writes the result straight to `data/enrichment/fandom-canonical.json` — the
  git-committed file the app statically imports at build time.
- `vercel.json` rewrites `/api/atlas/bookmarks`, `/api/atlas/state`, `/api/atlas/media`,
  `/api/fandom-image` to that same Supabase project (`qflqfvoxdzkibpzfrwop`). Those are
  live app features (watch state, bookmarks, media fallback) — unrelated to ingestion,
  not touched by anything in this doc, and presumed working.

## What's not connected

- **The frontend never reads from Blob.** `src/data.ts`, `src/lib/media.ts`, and
  `src/views/details/shared.tsx` all still statically import `data/*.json` /
  `data/enrichment/fandom-canonical.json` at build time. The Blob-backed API routes
  above are dormant — nothing calls them yet.
- **Zero environment variables were configured on the Vercel project** as of
  2026-09-25 (`CRON_SECRET`, `FANDOM_SYNC_ENDPOINT`/`TOKEN`, `MEDIA_SYNC_ENDPOINT`/`TOKEN`,
  `BLOB_READ_WRITE_TOKEN` — none set). The two cron jobs had been firing daily since
  deploy and doing nothing (401/503 no-ops).
- **Supabase contracts are now verified (2026-09-25)** — see `supabase-backend.md`. Two
  facts that change this plan: `fandom-sync` persists to the Supabase table
  `fandom_entity_cache` (not Blob) *and* returns the records, and it now **requires a bearer
  token** (`FANDOM_SYNC_TOKEN`, or the service role key). `api/cron/fandom-sync.ts` already
  sends that bearer, but its body has **no entities**, so even authenticated it would be
  a no-op until it sends `entities`.

## 2026-09-25: crons disabled

The `crons` array was removed from `vercel.json` (the two `api/cron/*.ts` files are
left in place, just unregistered) because they were pure no-ops with zero
configuration — better to have nothing than a daily job that silently does nothing
and creates a false signal that ingestion is running. Re-registering them is a
one-line `vercel.json` change once the prerequisites below are met and verified
against a real deployment (per the self-contained-api-file discipline — see
`journeys-and-sharing.md` — never merge an api/* change without checking it against
an actual deployed preview first).

## What actually finishing this needs

1. ~~Verify the Supabase edge function contracts~~ — done, documented in `supabase-backend.md`.
2. Configure real Vercel env vars for the project: `CRON_SECRET`, `FANDOM_SYNC_ENDPOINT`,
   `FANDOM_SYNC_TOKEN` (the same value must be set as a Supabase function secret),
   `MEDIA_SYNC_ENDPOINT`, `MEDIA_SYNC_TOKEN`, `BLOB_READ_WRITE_TOKEN`.
3. Decide whether results should also land in Blob: the edge function already stores them in
   `fandom_entity_cache` and returns them, but `api/cron/*.ts` discards the response and sends
   no entities. Either make the cron send entities and persist the response, or drop the cron
   and keep the manual `sync:fandom:supabase` script.
4. Switch `src/data.ts` / `src/lib/media.ts` / `src/views/details/shared.tsx` from
   static JSON imports to runtime fetches against `/api/entity`, `/api/search`,
   `/api/media` — this is real frontend work (async data loading, loading/error
   states) that hasn't started.
5. Re-add the `crons` entries to `vercel.json` only after 1–4 are done and verified
   against a real deployment.

Until then: enrichment stays exactly as it is today — the local npm scripts
(`enrich:fandom-full`, `cache:media`, etc.), run by hand, committing the result to
git, same as before this file existed.
