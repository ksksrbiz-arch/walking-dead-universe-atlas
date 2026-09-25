# CLAUDE.md — TWDU Atlas router

Routing only. Detail lives in the files below; load what the task needs, nothing else.
Hard rules for every task are in `AGENTS.md` (map transform contract, 363-episode dataset, no invented data).

## Route by task

| Task | Load | Workflow |
|---|---|---|
| Any UI / layout / styling change | `context/references/ui-design-system.md`, `src/styles.css` (tokens at top) | `context/workflows/ui-change/CONTEXT.md` |
| Map pan / zoom / markers / framing | `docs/MOBILE_MAP_GESTURE_ARCHITECTURE.md`, `src/App.tsx` (map section) | `context/workflows/map-change/CONTEXT.md` |
| Episode / place / character / link data | `data/README.md`, `data/EPISODE_SCHEMA.md` | `context/workflows/data-change/CONTEXT.md` |
| Product direction / new modes | `docs/ATLAS_ARCHITECTURE.md` | — |
| Why the UI looks the way it does | `docs/UI_AUDIT_AND_REDESIGN_2026-09.md` | — |
| Media / Fandom enrichment | `docs/DATA_ENRICHMENT_ARCHITECTURE.md` | — |
| Scheduled/automated ingestion (Vercel cron, Blob-backed data) | `context/references/scheduled-ingestion.md` | — |
| Supabase edge functions, tables, access model, security | `context/references/supabase-backend.md`, `supabase/` | — |
| SEO / share metadata / crawler files | `context/references/seo-and-share-metadata.md` | — |
| Journeys, deep links, share previews | `context/references/journeys-and-sharing.md`, `src/lib/journeys.ts` | `context/workflows/map-change/CONTEXT.md` (map layers) |

## Do not load unless the task is about them

| Skip | Why |
|---|---|
| `data/enrichment/fandom-canonical.json` (455 KB) | Read through `src/lib/atlasHelpers.ts` / `views/details/shared.tsx` |
| `package-lock.json`, `dist/` | Generated |
| `api/`, `workers/` | Backend/media delivery — except `api/share.ts`, `api/og.ts` for share-link work (each file is self-contained; see the note in journeys-and-sharing.md) |
| `supabase/functions/*` | Deployed edge functions; only for backend tasks (contracts live in `supabase-backend.md`) |
| `scripts/*enrich*`, `scripts/*fandom*` | Ingestion pipeline |

## Source map (UI)

```
src/App.tsx                 shell, navigation stack, map geometry + gestures
src/lib/series.ts           series colours/names (single source)
src/lib/lookup.ts           O(1) id lookups, episode codes, counts
src/lib/atlasHelpers.ts     map layers, icons, image resolution
src/lib/atlasContext.ts     actions + watch state for all views
src/lib/journeys.ts         journey model (stops, legs, beats, crossings)
src/lib/media.ts            image sizing/proxy/credits; galleries.ts = Fandom galleries
src/components/ui.tsx       shared primitives (rows, sections, hero…)
src/components/TimeScrubber.tsx, SearchOverlay.tsx, Icon.tsx (lucide), Lightbox.tsx, JourneyLayer.tsx
src/views/                  MapOverview, TimelineView, PeopleView, WatchView, JourneyPanel
src/views/details/          Episode/Location/Character/Group/Connection detail
```

## Commands

`npm run typecheck` · `npm run build` · `npm run audit:atlas` · `npm run media:manifest` (after media edits) · `npm run test:journeys` · `npm run test:chronology` (story order) · `npm run test:share` (after build) · `npm run test:seo` (after build; head metadata + crawler files) · `npm run check:api-imports` (after any `api/*.ts` edit — every function must be self-contained, see journeys-and-sharing.md) · `npm run test:ui` (needs a running `vite preview` on :4173 and Playwright — see script header)
