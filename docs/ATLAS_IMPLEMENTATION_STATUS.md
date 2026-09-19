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
- Episode selection should identify all linked locations.
- Map should center/highlight relevant episode locations without hiding chronology.
- Location selection should jump the chronology to its earliest/relevant history.
- Add a compact location-history indicator to the timeline.

### Block B — Connections
- Populate episode connection IDs where source-backed.
- Add contextual connection highlighting when an episode/person/location is selected.
- Add a connection focus mode that keeps both endpoints visible.
- Preserve certainty and provenance.

### Block C — Character journeys
- Build a character journey timeline from episode appearances.
- Synchronize character selection with map locations and series crossings.
- Expose cross-series transitions as explicit chronology events.

### Block D — Chronology depth
- Replace series-level watch-order scaffolding with episode-level chronology where evidence supports it.
- Integrate webisodes/specials as an optional secondary chronology layer.
- Keep approximate/unknown dates explicitly marked.

### Block E — Media
- Continue official AMC media ingestion with provenance.
- Do not claim an episode asset is verified unless the ingestion pipeline actually verified it.
- Use media as contextual storytelling, not as a replacement for chronology.

## Validation

The repository has a data validator and a deployment-time AMC media ingestion step.

The assistant has not claimed a local production build or physical-device verification when network access is unavailable. Cloudflare Pages remains the deployment target.

## Definition of done

A user can begin on the map, scrub through the universe, understand which series/story is active, select an episode, see its geography, follow a documented connection into another part of the universe, and return to the same point in chronology.

That loop is the core Atlas.
