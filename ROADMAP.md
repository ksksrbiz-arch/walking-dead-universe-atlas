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
- [ ] Route/travel-path overlays (character/episode journeys expose geography today; not yet rendered as routes)

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

See `docs/QUALITY_AUDIT_2026-09-20.md` for the current ten-part quality audit and the remaining live-browser verification gate.
