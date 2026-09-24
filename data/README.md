# TWDU Data Layer

This directory will become the canonical source of truth for the atlas.

## Planned modules

```
series/
seasons/
episodes/
events/
locations/
characters/
communities/
factions/
connections/
sources/
```

## Data policy

Do not silently convert an inference into canon.

Every uncertain chronology or geographic assertion should carry a certainty value and, when practical, a source reference.

IDs should be stable and machine-readable, for example:

- `twd`
- `twd-s09`
- `twd-s09-e05`
- `loc-alexandria`
- `char-rick-grimes`
- `faction-crm`

## Cross-kind ID collisions

A place and the community/faction that lives there may intentionally share
one id (`alexandria`, `hilltop`, `civic-republic`, `burazi` — the settlement
and the group are the same canonical entity, tracked as separate `location`
and `community`/`faction` records). `scripts/audit-atlas.mjs` reports these
as a warning, not a failure — they are expected, not a data bug.

Any code that resolves such an id must carry an explicit kind. Never resolve
a bare id by scanning every registry in a fixed priority order (that always
picks the same kind for a colliding id, regardless of which one the caller
actually wanted); use `resolveConnectionEndpoint`/a graph node's `kind` when
available, or pass `entityName(id, kind)` its kind explicitly.

## Connection categories

Every `data/connections.json` record carries a `category`, classified from
its existing `label` (no new relationship facts — only a grouping of what's
already documented) so the relationship graph can filter by it:

- `family` — kinship by blood, marriage, or explicit shared parenting.
- `conflict` — adversarial: captures, destroys, targets, resists, "uneasy".
- `affiliation` — every other documented working/social/institutional bond.
- `crossover` — structural cross-series, lore, and location links that place
  a character/faction in another part of the universe, not a person-to-person
  bond.

`scripts/audit-atlas.mjs` fails the build if a connection is missing a
`category` or uses one outside this set.

## Universe event character links

`data/universeEvents.json` records carry `characterIds` only where the
event's own `title` already names the character (e.g. `daryl-france` →
"Daryl Dixon reaches France" → `daryl-dixon`) — never inferred from outside
knowledge. Most universe events are institutional or too broad to name a
person (`monument-day`, `crm-omaha-destruction`) and correctly have no
`characterIds`; leave those empty rather than guessing. `scripts/audit-atlas.mjs`
validates every `characterIds`/`locationIds` entry against the real registries.

## Character status & death provenance

Every `data/characters.json` record carries `status` (`alive`/`deceased`/`unknown`),
`statusCertainty` (`confirmed`), `statusSourceUrl`, and `statusSyncedAt` — sourced
directly from that character's own Walking Dead Wiki infobox `|status = ...` field
(fetched via the MediaWiki API, `action=parse&prop=wikitext`, not scraped or
guessed). A `deceased` character additionally carries `deathEpisodeId` when the
infobox's `|death episode = ...` wikilink matched a real `data/episodes.json`
title — resolved 39/39 for the 2026-09-24 sync; an unresolved match would be
left off rather than guessed.

`status: unknown` means the character's fate is itself the documented, unresolved
canon fact (e.g. Morgan Jones as of the synced revision) — not a data gap.

This is a point-in-time sync of the wiki's stated status, not a live feed: a
character's status can change as new episodes air. Re-running the same
MediaWiki API extraction and diffing against the stored `statusSyncedAt` is
how to refresh it — never hand-edit `status` without also updating
`statusSourceUrl`/`statusSyncedAt` to match.

`scripts/audit-atlas.mjs` validates the `status` enum and that `deathEpisodeId`
(when present) references a real episode.
