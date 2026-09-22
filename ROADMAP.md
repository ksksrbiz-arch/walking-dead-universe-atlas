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

## Phase 6 — External data enrichment
- [x] Source registry with official/community/structured source tiers
- [x] Provenance and canonical-overwrite policy
- [x] External source health probing
- [x] Fandom MediaWiki category ingestion foundation
- [x] Character/location/episode candidate matching foundation
- [ ] Verify the standalone Walking Dead API endpoints and schema
- [ ] Verify API-TWD-Characters endpoint/repository and schema
- [ ] Fetch Fandom page-level structured metadata and media
- [ ] Build enrichment review queue
- [ ] Approve/promote enrichment patches into canonical data
- [ ] Add external IDs and entity reconciliation
- [ ] Enrich character dossiers
- [ ] Enrich location dossiers
- [ ] Enrich episode dossiers
- [ ] Add source/provenance UI
- [ ] Add character travel/journey enrichment
- [ ] Automate scheduled source snapshots and change detection

### Fandom full-TV-Universe validation results
- Full TV-Universe category ingestion was executed against the configured character, location and episode categories.
- Candidate set observed:
  - Characters: 2,319 source records
  - Locations: 686 source records
  - Episodes: 429 source records
- Current canonical-name matcher results:
  - Characters: 74 matched / 2,245 unmatched
  - Locations: 72 matched / 614 unmatched
  - Episodes: 0 matched / 429 unmatched
- The zero episode-match result is now treated as a data-model/matching gap rather than a source failure. Episode reconciliation needs series + season/episode context and title aliases instead of plain-name matching.
- Page-level Fandom enrichment is implemented for characters, locations and episodes. It retrieves page metadata/images, latest revisions by exact revision ID, raw wikitext, parsed infoboxes, normalized field hints, lead text and provenance hashes without mutating canonical data.
- Enrichment execution was validated in a successful branch deployment after fixing MediaWiki generator/revision constraints.

