# TWDU Atlas — Data Enrichment Architecture

## Purpose

External Walking Dead databases and APIs are ingestion sources, not runtime dependencies. The Atlas keeps a canonical local dataset and records provenance for every imported proposal.

## Source tiers

1. Official — AMC / AMC Networks. Preferred for series, episode and official media metadata.
2. Structured community — Walking Dead Wiki. High-value secondary source for character, location, episode, relationship and chronology enrichment.
3. Community APIs — The Walking Dead API and API-TWD-Characters. Experimental until endpoint health, schema and provenance are verified.
4. Entity reconciliation — Wikidata. Useful for external IDs, actors and disambiguation; not a primary TWDU canon authority.

## Pipeline

External source -> Fetch / snapshot -> Normalize -> Entity matching -> Validation -> Canonical Atlas data -> Derived indexes -> Map / Timeline / People / Guide

High-confidence matches become proposed enrichment. Ambiguous matches go to review. Conflicts go to the conflict queue.

## Non-negotiable rules

- External sources never write directly into the client dataset.
- Every proposal carries source ID, source record ID, source URL, retrieval time and payload hash.
- Existing canonical fields are not silently overwritten.
- Unknown coordinates remain null; 0,0 is never a valid fallback.
- Chronology changes require explicit validation.
- Character identities are TV-Universe entities, not merely name strings.
- Comic, game and non-canon pages must not enter the TV-Universe dataset through category leakage.
- Build jobs consume checked-in canonical data only. Network enrichment is a separate ingestion job.

## Matching

The matcher first uses exact canonical IDs/external IDs, then normalized names and aliases. Name-only matches are never allowed to silently overwrite an existing entity.

Match outcomes: matched, review, unmatched, conflict.

## Proposed enriched entities

### Character
- aliases, actor, status, first/last appearance
- series and episode appearances
- communities, factions and relationships
- image/media, external IDs and provenance

### Location
- aliases, type/layer, region/state/country
- coordinates, coordinate precision and certainty
- episode appearances and character associations
- community/faction associations and provenance

### Episode
- title and series/season/episode number
- original air date and in-universe date/range
- chronology position
- locations, characters, communities and factions
- events, crossover relationships and official media
- source provenance

## Operational commands

npm run enrich:probe
npm run enrich:fandom

These commands create diagnostic/candidate files under data/enrichment/. They do not mutate canonical data.

## Future automation

1. Probe source health.
2. Snapshot source responses.
3. Calculate hashes.
4. Compare against the last snapshot.
5. Create enrichment proposals.
6. Run structural validation.
7. Require review for ambiguous/conflicting changes.
8. Regenerate indexes.
9. Run the full Atlas audit.
10. Deploy only after validation passes.

## Deployment trigger

This branch uses Netlify deploy previews for enrichment validation; pushing a new commit to the branch triggers the configured preview build.
