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
4. Unknown coordinates stay `(0,0)` + `certainty: "unknown"`; the UI lists them as "not placed".

## Completion
- Audit PASS; episode count still 363 unless the change is an intentional addition documented in `data/README.md`.
- `npm run build` passes.
