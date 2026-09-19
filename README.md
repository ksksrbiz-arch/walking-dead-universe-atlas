# The Walking Dead Universe Atlas

An interactive, data-driven atlas for the television **Walking Dead Universe (TWDU)**.

## Project goal

Build a canonical-feeling reference application that connects:

- chronological watch order
- episode-level chronology
- interactive geography
- characters
- locations
- communities
- factions
- cross-series connections
- major events
- confirmed vs inferred timeline information

The goal is to make the universe navigable as a connected graph rather than a simple list of shows.

## Current state

**Phase 0 — working prototype**

The repository currently contains the standalone Atlas v4 prototype. It has:

- self-contained SVG geographic map
- touch/pointer map panning
- zoom controls
- clickable locations
- series filtering
- geographic filtering
- chronology filtering
- chronology explorer
- schematic story routes
- mobile-friendly layout

The prototype is intentionally dependency-light so it works when opened directly from GitHub/Files.

## Planned architecture

The prototype will be migrated into a componentized application with a normalized data layer:

```
data/
  series/
  seasons/
  episodes/
  events/
  locations/
  characters/
  communities/
  factions/
  connections/

app/
  map/
  timeline/
  episodes/
  entities/
  watch-order/
  search/
```

Every episode/event should be able to link to its participating characters, locations, factions and adjacent chronology nodes.

## Continuity rules

The data model will distinguish:

- **confirmed** — directly established by the series
- **inferred** — strongly supported by chronology but not explicitly dated
- **approximate** — geographic/time estimate
- **announced** — future production information
- **unknown** — deliberately left unresolved

We will not manufacture exact dates or travel routes when canon does not establish them.

## Repository

GitHub: https://github.com/ksksrbiz-arch/walking-dead-universe-atlas

## Development roadmap

1. Preserve the working prototype.
2. Establish canonical entity schemas.
3. Import the complete series/season/episode catalog.
4. Build the episode-level master chronology.
5. Replace prototype map data with normalized location/event data.
6. Add character and faction relationship graph.
7. Add cross-show navigation.
8. Add continuity validation/tests.
9. Add source/uncertainty metadata.
10. Deploy a polished public atlas.

This is a fan reference project and is not affiliated with AMC Networks or the creators of The Walking Dead.
