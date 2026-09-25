# Workflow: Data change

| Input | Process | Output | Completion |
|---|---|---|---|
| New/corrected episode, place, character or link relationship | Edit source JSON → regenerate derived indexes → audit → UI | Changed `data/*.json` | Audit PASS, 363 episodes intact |

## Load
- `data/README.md`, `data/EPISODE_SCHEMA.md`, the JSON being changed
- `scripts/audit-atlas.mjs` output

## Exclude
- `src/**` until the data passes audit
- `data/enrichment/fandom-canonical.json` unless the change is enrichment

## Process
1. Modify source data with provenance and certainty.
2. Regenerate derived indexes (`characterEpisodes`, `locationEpisodes`, `connectionEpisodes`) where relationships changed.
3. `npm run audit:atlas` — check reverse references, chronology and coordinates.
4. Unknown coordinates stay `(0,0)` (the UI treats `(0,0)` as unplaced regardless of certainty and lists it as "not placed").
5. Media changes (`data/media.json`, `data/episodeMedia.json`): `npm run media:manifest` must report 0 broken.
6. Timeline changes (`timelineStart` / `timelineEnd` / `timelinePrecision` on episodes): `npm run test:chronology`, then `npm run test:journeys`. Story order is a **total order**: earliest possible date, then earliest possible end, then catalog order; unanchored (`unknown`) episodes sort last and never get an invented position. Avoid wide placeholder windows (e.g. `owl-s01-e01` is 2014-2022): they sort at their start year. Do not reintroduce a pairwise "overlaps means catalog order" comparator; it is not transitive and mis-orders whole seasons.

## Completion
- Audit PASS; episode count still 363 unless the change is an intentional addition documented in `data/README.md`.
- `npm run build` passes; `npm run test:chronology` and `npm run test:journeys` pass after any timeline edit.
