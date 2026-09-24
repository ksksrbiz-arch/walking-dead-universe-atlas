# Build Roadmap

## Phase 0 — Prototype
- [x] Repository created
- [x] Self-contained interactive map
- [x] Series filters
- [x] Year filter
- [x] Search
- [x] Chronology panel

## Phase 1 — Canonical data
- [x] Complete television series catalog (8 series, incl. More Tales)
- [x] Season metadata
- [x] Episode catalog (363 episodes)
- [x] Location registry (typed, layered: settlements/facilities/landmarks/infrastructure/regions)
- [x] Character registry
- [x] Community/faction registry
- [x] Source registry
- [x] Certainty metadata (confirmed/source-derived/approximate throughout)

## Phase 2 — Episode chronology
- [x] Episode-level chronological ordering
- [x] Timeline event model (episodes + universe events, visually distinguished)
- [x] Tales/webisode/special placement (secondary chronology layer)
- [x] Cross-series crossover links
- [x] Time-jump handling
- [ ] Day-level precision where canon supports it; deeper flashback/flash-forward/concurrent-storyline distinction (depth work, not foundational)

## Phase 3 — Atlas engine
- [x] Componentized map
- [x] Location detail panels
- [x] Event overlays (universe events with documented geography)
- [x] Geographic filters (map layers: all/settlements/facilities/landmarks/infrastructure/regions)
- [x] Mobile interaction model — pan/zoom/tap verified via scripted touch-gesture + hit-testing regression across phone, tablet portrait/landscape, and desktop (see PR #14)
- [x] Character journey overlays — story-order playback, per-leg evidence episodes, compare up to 3, crossings, spoiler-safe (routes are "next recorded place", never invented travel paths)
- [x] Shareable deep links with preview cards (`/j/`, `/p/`, `/e/`, `/c/`)

## Phase 4 — Universe graph
- [x] Character graph
- [x] Community graph
- [x] Faction graph
- [x] Episode-to-episode connections
- [x] Cross-show navigation

## Phase 5 — Quality
- [x] Continuity validation
- [x] Broken-reference tests
- [x] Source auditing
- [x] Performance instrumentation and optimization pass
- [x] Accessibility source audit
- [x] Production deployment
- [x] Scripted production-build browser regression — pan/pinch/tap gesture dispatch + hit-testing across phone, tablet, and desktop viewports (PR #14); not a substitute for the item below
- [ ] Physical-device verification (real touch hardware, screen reader, actual gesture feel) — still open

- [x] UI audit and full mobile-first redesign (sheet detents, time scrubber, watch tracker, back navigation, design system) — `docs/UI_AUDIT_AND_REDESIGN_2026-09.md`
- [x] Automated browser regression for the map contract and core loop (`npm run test:ui`)

See `docs/QUALITY_AUDIT_2026-09-20.md` for the current ten-part quality audit and the remaining live-browser verification gate.

## Phase 6 — External data enrichment
- [x] Source registry with official/community/structured source tiers
- [x] Provenance and canonical-overwrite policy
- [x] External source health probing
- [x] Fandom MediaWiki category ingestion foundation
- [x] Character/location/episode candidate matching foundation
- [x] Verify the standalone Walking Dead API endpoints — the four tested paths (root, `/api`, `/characters`, `/swagger`) are all unavailable (404); no schema was ever returned to verify (`data/enrichment/sourceRegistry.json` id `walking-dead-api`)
- [x] Verify API-TWD-Characters endpoint — its advertised Railway deployment is unavailable (404 on every tested path); no schema was ever returned to verify (`sourceRegistry.json` id `api-twd-characters`)
- [x] Fetch Fandom page-level structured metadata and media — `data/enrichment/fandom-canonical.json` (per-entity pages) + `public/data/fandom-galleries/*` (per-entity galleries, 77/77 characters, 75/79 locations, 360/363 episodes)
- [x] Enrich character dossiers — aliases, wiki status, Fandom portraits/galleries, journeys (#49/#50, Journeys v2)
- [x] Enrich location dossiers — Fandom images/galleries, map-layer typing
- [x] Enrich episode dossiers — Fandom stills (354/363 episode-specific), AMC frames, per-episode galleries
- [x] Add character travel/journey enrichment — reconsidered: Journeys v2 derives routes from episode/place data at render time rather than writing travel data into the dataset, specifically so nothing is invented (see `context/references/journeys-and-sharing.md`). Done under that constraint; revisit only if a real source of travel dates/routes ever exists.
- [ ] Build enrichment review queue
- [ ] Approve/promote enrichment patches into canonical data
- [ ] Add external IDs and entity reconciliation (start with Wikidata, currently `planned` in `sourceRegistry.json`)
- [ ] Add source/provenance UI
- [ ] Automate scheduled source snapshots and change detection — partially built (`.github/workflows/fandom-enrichment.yml` runs on push to enrichment scripts/manual dispatch; `api/cron/fandom-sync.ts` + `api/cron/media-sync.ts` are wired to daily Vercel crons but forward to a `FANDOM_SYNC_ENDPOINT`/`MEDIA_SYNC_ENDPOINT` that isn't configured, so they 503 today) — not a real timer-based schedule yet
