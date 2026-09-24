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

## Media delivery — what is actually live

There are two separate media systems in this repo. Only one of them renders images on the site today.

**Live path (this is what actually serves every character/location/episode image):**

`data/media.json` (characters/places/series) and `data/episodeMedia.json` (episodes) hold curated,
manually-verified image URLs — checked first. `fandomEntityImage()` in `src/App.tsx` is the fallback:
it scores every image candidate in `data/enrichment/fandom-canonical.json` against the entity name and
picks the best match. Series key art is the last-resort fallback for locations/characters with no
curated or Fandom match. Whatever URL comes out of that chain goes through `atlasImageUrl()`
(`src/lib/media.ts`), which proxies any Fandom (`static.wikia.nocookie.net`) or AMC
(`images.cds.amcn.com`) URL through a Supabase Edge Function
(`https://qflqfvoxdzkibpzfrwop.supabase.co/functions/v1/atlas-media`) for resizing/caching, and passes
`/media/...` static paths straight through to Vercel's static file serving from `public/`.
`src/generated/media-local.json` (an in-repo cache of already-downloaded assets) is currently empty, so
every Fandom/AMC image is fetched live through the proxy on every load.

**Dormant path (built, deployed, but not wired to anything that renders images):**

`scripts/sync-vercel-atlas.mjs` uploads `data/*.json` and `public/media*` files to Vercel Blob under
`twdu-atlas-data/` and `twdu-atlas-media/`. `api/media/[...path].ts` and `api/entity/[...path].ts` can
serve that Blob content back out, and `api/cron/media-sync.ts` / `api/cron/fandom-sync.ts` are meant to
keep it fresh. **Nothing in `src/` calls `/api/media` or `/api/entity`.** A green Vercel deployment or a
passing `/api/health` check only confirms that this Blob-backed API layer is reachable — it says
nothing about whether character portraits, episode stills or location images actually render, because
that rendering never touches this system. Before investing further in this path (recursive uploads,
an `ATLAS_MEDIA_INDEX_URL`, etc.), decide whether it's actually needed — e.g. to stop depending on the
Supabase proxy — rather than building it out on the assumption that it's already part of image delivery.

**Verifying media end-to-end:** `npm run media:manifest` (`scripts/build-media-manifest.mjs`) rebuilds
`data/enrichment/media-manifest.json`. For every character, location and episode it replicates the live
resolution order above and makes a real HTTP request through the same delivery path the browser uses
(the Supabase proxy for Fandom/AMC sources, a `public/` file check for local static assets), recording a
per-entity `resolutionMethod` and `verificationStatus`. Re-run it after touching `data/media.json`,
`data/episodeMedia.json`, or the Fandom canonical data — a deployment being READY does not mean these
URLs still resolve; AMC's CDN assets and Fandom's proxy size limits have both broken previously-verified
entries in practice (see the manifest's `broken` counts and the console output listing which ones).

**Closing the location image-coverage gap:** `npm run media:fill-locations`
(`scripts/fill-location-fandom-images.mjs`) targets locations the manifest reports as
`series-keyart-fallback` (no curated image, no confident Fandom heuristic match). For each one it asks
the Fandom MediaWiki API directly for that page's own designated lead/infobox image (`prop=pageimages`)
using a short list of title guesses, verifies the result loads through the live delivery path, and
writes it into `data/media.json` as curated data — never a raw gallery grab, so it never guesses at
which image on a page is the right one. It deliberately does not fall back to "any image referenced on
the page" for locations MediaWiki has no page image for (e.g. a page whose only image turned out to be
an unrelated character photo) — showing the wrong photo for an entity is worse than the generic series
key art fallback. Re-run `npm run media:manifest` afterward to confirm the new entries verify, and rerun
`fill-locations` again later as more Fandom pages gain a proper lead image; it's idempotent and only
touches locations still on the fallback tier.
