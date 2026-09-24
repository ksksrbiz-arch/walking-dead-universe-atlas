# Atlas Core Build Status

## Locked product direction

The Atlas experience is now defined as a synchronized **Map + Timeline + Connections** system.

- Timeline = structural spine.
- Map = cinematic centerpiece/window into time.
- Connections = cross-series connective tissue.
- Details = contextual layer.
- Dedicated Timeline / People / Guide views remain depth modes.

## Completed in this build session

- Added the architecture contract in `docs/ATLAS_ARCHITECTURE.md`.
- Added a persistent `AtlasTimelineDock` component.
- Added seven series chronology lanes with real chronology records.
- Added universe-year cursor and continuous year scrubber.
- Added episode/event markers and selected-episode state.
- Added chronology play/pause to the dock.
- Added mobile/desktop styling for the chronology dock.
- Kept map pan/zoom on the existing non-React gesture path.
- Enriched chronology records with location/character/community/faction/connection/source IDs.

## Next implementation blocks

### Block A — Timeline ↔ Geography
- [x] Episode selection identifies all linked locations.
- [x] Map highlights the episode's linked geography while preserving chronology context.
- [x] Location selection jumps the chronology to the location's configured earliest/relevant history.
- [x] Add a compact location-history indicator to location detail chronology context.

### Block B — Connections
- [x] Populate and consume curated episode connection evidence where source-backed.
- [x] Add visual contextual connection highlighting when an episode/person/location is selected.
- [x] Add a connection focus mode that keeps both endpoints visible.
- [x] Preserve certainty and provenance.

### Block C — Character journeys
- [x] Build a character journey timeline from episode appearances.
- [x] Synchronize character detail with its episode geography and location navigation.
- [x] Expose cross-series transitions as explicit chronology events.
- [x] Add direct map-context highlighting for the complete character journey.

### Episode geography precision pass
- [x] Remove blanket Fear season 2 geography links where episode-level evidence identifies a specific documented location.
- [x] Remove redundant broad/city geography links when a more specific documented episode location is already represented.
- [x] Align affected Dead City location chronology years with their earliest linked episode.
- [x] Regenerate and validate the reverse location index after geography changes.
- [x] Preserve episodes with no currently registered specific location rather than inventing geography.

### Fear geography refinement — seasons 2–3
- [x] Expand Fear season 2 episode geography with source-backed site-level locations, including Catrina Island, Flight 462 crash site, Valle de Guadalupe, Abigail Vineyard, La Colonia, Rosarito Beach Hotel, El Pelícano, Suarez Family Farm, and documented flashback sites.
- [x] Expand Fear season 3 episode geography with source-backed military, ranch, reservation, dam, trading-post, and site-level locations.
- [x] Keep site-level locations with unknown exact coordinates explicitly unplaced instead of inventing map precision.
- [x] Regenerate the reverse location index after both season passes and validate it against episode references.

### Chronology integrity pass
- [x] Align location chronology years with the earliest linked episode timeline anchor.
- [x] Validate the reverse location index against episode-level location references.
- [x] Preserve explicitly unknown/zero-coordinate locations as unplaced rather than inventing geography.

### Block D — Chronology depth
- [x] Replace series-level watch-order scaffolding with episode-level chronology where evidence supports it.
- [x] Integrate webisodes/specials as an optional secondary chronology layer.
- [x] Keep approximate/unknown dates explicitly marked.
- [x] Integrate the canonical universe-event registry into the chronology engine and expanded Timeline view.
- [x] Distinguish universe events visually from episode chronology records.

### Entity graph depth
- [x] Make community and faction registry entries interactive graph roots.
- [x] Allow relationship exploration to traverse from those entities into episodes, locations, characters, and documented connections.
- [x] Add evidence-backed episode-to-episode graph edges from curated connection evidence.
- [x] Audit episode-to-episode graph bridges so shared characters/locations alone never fabricate a narrative connection.

### Source registry & methodology
- [x] Expose the canonical source registry directly in the Guide.
- [x] Surface source type, provenance note, and methodology rules without hiding them in repository files.

### Block E — Media
- [x] Add a build-time local AMC media cache so production rendering does not depend on runtime third-party image proxying.
- [x] Add explicit series-art fallbacks for locations and characters without dedicated media assets.
- [x] Add an in-app media coverage audit surface with per-series coverage and unresolved episode visibility.
- Continue official AMC media ingestion with provenance.
- Do not claim an episode asset is verified unless the ingestion pipeline actually verified it.
- Use media as contextual storytelling, not as a replacement for chronology.

## Recent completion pass

- Added synchronized map location layers: all, settlements, facilities, landmarks, infrastructure, and regions.
- Expanded location marker icon aliases so the map uses distinct SVG glyphs for the registered location taxonomy instead of collapsing most types into the generic facility glyph.
- Added map-linked universe-event handling for any event record that carries documented locationIds; events without geography remain non-clickable rather than receiving invented placements.
- Fixed entity-graph root synchronization so community/faction focus selections actually replace the graph root instead of leaving the initial character root mounted.
- Completed search-to-graph navigation for community and faction results so search opens the selected entity relationship context.

### Character intelligence pass — follow, dossier, relationship categories
- [x] Character follow/favorites, persisted per-viewer (localStorage, mirrors watch progress) and surfaced as a filter + badge in People.
- [x] Character Hero surfaces verified status and aliases when the Fandom enrichment record carries them (display-only; no character in the current enrichment snapshot has these fields populated yet, so this is dormant until that data lands).
- [x] Fixed `entityName()` to resolve by kind when the caller already knows it, instead of always preferring `location` over `community`/`faction` for ids the two intentionally share (`alexandria`, `hilltop`, `civic-republic`, `burazi`, …). Documented the collision pattern in `data/README.md`.
- [x] Added a `category` (family/affiliation/conflict/crossover) to every connection, classified from its existing label — no new relationship facts. Documented in `data/README.md`, enforced by `scripts/audit-atlas.mjs`, exposed as a second filter row in the relationship graph.
- Not attempted this pass (real per-character research needed to avoid inventing data): death/disappearance/status-change provenance.

### Character intelligence pass — character-to-event navigation
- [x] Added `characterIds` to the 5 (of 9) `data/universeEvents.json` records whose own `title` already names a character (`daryl-france` → Daryl Dixon, `dead-city-manhattan` → Maggie Rhee + Negan Smith, …) — never inferred from outside knowledge. The other 4 events are institutional/too broad to name a person and correctly carry no `characterIds`.
- [x] `scripts/audit-atlas.mjs` now validates every event's `characterIds`/`locationIds` against the real registries (`events.json` and `universeEvents.json` alike).
- [x] Character → event: a new "Universe events" section on the character page lists linked events; each jumps the Timeline to that event's year (`jumpToTimelineYear`, a new `AtlasActions` method).
- [x] Event → character: the Timeline's universe-event rows now show a clickable chip per linked character, opening that character's page.
- Still open: the 4 institutional universe events, and all 18 `data/events.json` season/location markers, correctly have no character link — that's a data gap (real research), not a wiring gap.

## Validation

The repository has a data validator and a deployment-time AMC media ingestion step.

The assistant has not claimed a local production build or physical-device verification when network access is unavailable. Netlify is the production deployment target.

## Definition of done

A user can begin on the map, scrub through the universe, understand which series/story is active, select an episode, see its geography, follow a documented connection into another part of the universe, and return to the same point in chronology.

That loop is the core Atlas.
