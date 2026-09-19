# Atlas Architecture

## Core entities

The canonical data model will use stable IDs for:

- Series
- Season
- Episode
- Timeline Event
- Location
- Character
- Community
- Faction
- Relationship
- Source

## Timeline model

Each event should contain:

- `id`
- `title`
- `seriesId`
- `episodeId` when applicable
- `timeStart`
- `timeEnd` when known
- `timePrecision`
- `locationIds`
- `characterIds`
- `communityIds`
- `factionIds`
- `connectionIds`
- `certainty`
- `sources`

### Certainty values

`confirmed`, `inferred`, `approximate`, `announced`, `unknown`.

This is essential because TWDU chronology frequently overlaps and some dates are only inferable from episode context.

## UI layers

### Map
Geographic locations, communities and verified/schematic routes.

### Timeline
Chronological event stream with year/era/series filters.

### Episode explorer
Episode-by-episode watch order and event breakdown.

### Entity explorer
Characters, factions, communities and locations.

### Connection graph
Cross-series relationships and crossover paths.

## Data-first rule

UI components must consume normalized data. Do not encode canon facts directly into visual components once the migration begins.

## Validation

Continuity data should eventually be tested for:

- duplicate IDs
- broken references
- impossible year ranges
- episodes without series
- events without an episode/source where one is required
- locations without coordinates or explicit geographic uncertainty
