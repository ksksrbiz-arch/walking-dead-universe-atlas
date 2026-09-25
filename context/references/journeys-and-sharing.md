# Journeys & share links (reference)

Journeys are the atlas's "follow a character" mode: routes on the map, story-order playback, up to three characters compared, crossings, and a spoiler-safe filter. Share links carry any journey step, place, episode or character, with a rich preview card.

## Honesty rules (non-negotiable)
- The atlas has **no travel data**. A journey is derived only from: the episodes a character appears in (`getCharacterEpisodeIds`), those episodes' `locationIds`, and in-universe story order (`buildEpisodeWatchOrder`).
- A leg means "next recorded place". It is drawn as an arc from the **nearest place the character was just recorded at**. Distances are labelled **straight-line km**. Never draw roads, invent waypoints, or add dates.
- Episode place lists are episode-level. The panel note says so: not every place in an episode necessarily involves this character.
- Unplaced locations (`(0,0)` / non-finite) are skipped (`isPlaced`). A journey never routes through them.

## Model — `src/lib/journeys.ts` (pure: no React/DOM/`import.meta`)
| Export | What |
|---|---|
| `buildJourney(id, {onlyEpisodes})` | `{stops, legs, episodeIds, hiddenEpisodeCount, unplacedEpisodeCount, stats}` |
| `buildBeats(journeys)` | Merged story-order steps across compared characters (one beat = ≥1 character reaches a stop) |
| `positionsAt(journeys, beats, cursor)` | Each character's current stop index at a beat (-1 = not started) |
| `beatForYear` / `beatYear` | Year scrubber ↔ journey sync |
| `findCrossings(journeys)` | `together` (shared episode at that place) or same ground at different times |
| `journeyCandidates()` | Characters with ≥2 stops, most places first (compare picker, home strip) |
| `parseJourneyIds` | URL ids → known characters, max 3 |
| `JOURNEY_COLORS` | Slot colours `#f2b84b`, `#5ec8e0`, `#ef6f86`. Slot colours, not series colours, so two TWD characters stay distinguishable |

**Chapter rule.** Season-level place lists (a TWD S8 episode lists Alexandria, Sanctuary, Kingdom and Hilltop) would zig-zag once per episode. While an episode shares any place with the current chapter, only *newly reached* places become stops. An episode with no overlap starts a new chapter (a relocation). With this rule Daryl has 48 stops instead of 66. Stop fields:
- `place`: first-visit number
- `visit`: >1 means a return
- `rank`: story rank of the first evidencing episode. It is fractional when one episode yields several stops.
- `chapter`
- `from`

**Leg evidence.** Each leg carries `leaveEpisodeId` (the last episode at the origin so far) and `arriveEpisodeId` (the first at the destination). If both are the same episode, the panel shows "Both places in …".

## App wiring — `src/App.tsx`
- **State:**
  - `journeyIds` (≤3)
  - `journeyRank`: playback position as a story rank, so it survives compare/spoiler changes. `Infinity` = end.
  - `journeyPlaying`
  - `spoilerSafe` (localStorage `twdu-atlas-spoiler-safe`)
- **Derived:** `journeys`, `beats`, `journeyCursor`, `journeyPositions`, `journeyReached`, `journeyCurrent`.
- **Actions:** `startJourney(ids, {rank})` (also on `AtlasContext`) pushes the back stack, clears focus and opens the map at peek. `exitJourney()` returns via the stack. `stepJourney(i)` sets the rank and frames the beat's from/to places (`focusMapOn(..., "fit", maxZ 3.2)`). Playback ticks every 1.7 s (2.6 s under reduced motion).
- **Time sync:** the universe year follows the cursor (`beatYear`). Scrubbing the year moves the cursor (`beatForYear`).
- **Map:**
  - `JourneyRoutes` (under markers): done / latest (draw-in animation) / ahead (faint dashed)
  - `JourneyAvatars` (above markers): portrait pins, fanned out when characters share a place
  - Both live inside `.mapWorld` and use `scale(1/zoom)` for constant screen size.
  - Markers get `.ahead` (not reached yet) and `.here`. Current places are pulled out of clusters.
  - A single journey shows first-visit numbers.
- **Sheet layout:** `JourneyPlayer` replaces the scrubber in the sheet header, so it is usable at peek. **Panel layout:** the player sits sticky at the top of `JourneyPanel`.
- **Keys:** ←/→ or [ ] step; Space plays; Esc / browser Back exits.

## Panel — `src/views/JourneyPanel.tsx`
Header (faces, share, exit) → player → stats (single) or per-person rows (compare) → compare chips + picker → spoiler-safe switch → "Now" `StopCard`s (place photo, leg evidence, episodes with watch toggles) → Crossed paths → Same ground (collapsed) → Every stop (per character) → honesty `Note`. Spoiler-safe with nothing watched shows an explanatory empty state instead of an empty map.

## URL scheme (in and out)
| URL | Opens |
|---|---|
| `/?j=a,b&at=<rank×100>` | Journey (compare with `,`/`+`); `at` omitted = end |
| `/?place=` · `/?ep=` · `/?who=` | Location / episode (on map) / character |
| `/j/a+b?at=` · `/p/:id` · `/e/:id` · `/c/:id` | Short share paths (Vercel: preview HTML → redirect; elsewhere the SPA fallback reads them and normalises the URL) |

- `readDeepLink()` runs once and is applied after the first home framing.
- A `replaceState` effect keeps the URL in step with journey/focus, so reload and copy-paste reproduce the view.
- Share buttons (journey header, detail bar) use `navigator.share`, falling back to clipboard plus a toast.

## Preview cards (server)
- `src/lib/shareIndex.ts`: `buildShareIndex()` computes names, stats, journey stop coordinates, legs and beat ranks, and Fandom preview images (resized, `format=original` so they arrive as JPEG/PNG). `vite.config.ts` writes it to `dist/share-index.json` (≈225 KB) with 1:110m land.
- `api/og.ts` and `api/share.ts` each carry their own copy of the loader/resolver logic below — **duplicated on purpose, not imported.** Vercel runs every `api/*.ts` file individually; empirically its build does not reliably make a module imported from elsewhere under `api/` available at runtime (confirmed for a top-level `lib/`, an `api/_lib/` helper, and a plain sibling re-export — all threw `ERR_MODULE_NOT_FOUND` in production while working fine locally, since `tsc`/esbuild resolve across files and Vercel's actual runtime doesn't). `npm run check:api-imports` (`scripts/check-api-imports.mjs`) enforces this: no `api/*.ts` file may import another local file, and every one is actually `import()`-ed with plain Node (the same way Vercel runs them) to catch a syntax construct too — this is also how a stray backslash in `api/health.ts`'s regex literal, invisible to `tsc`, was caught. The shared logic itself:
  - loads the index (local `dist/` first, then the deployment's `/share-index.json`), then:
  - `resolveCard`: unknown ids → null
  - `shareHtml`: OG/Twitter meta, canonical URL, meta refresh + `location.replace`, everything HTML-escaped
  - `cardElement`: Satori tree built with `h()`. Single children are passed unwrapped; Satori demands `display:flex` for any children array.
  - `imageData`: 3.5 s timeout, JPEG/PNG/GIF only, else no image
- `api/share.ts`: HTML. Unknown → 302 to `/`.
- `api/og.ts`: 1200×630 PNG via `@vercel/og` **~0.11** (1.0.x fails to load its harfbuzz wasm outside Vercel's bundler). Cached 1 day at the browser, 7 days at the edge.
- `vercel.json` rewrites `/j/:ids`, `/p/:id`, `/e/:id`, `/c/:id` → `/api/share?kind=…&id=…`.
- Functions never import atlas data directly. Node ESM JSON imports without import attributes are not safe in unbundled functions, so the data arrives through the index.

## Tests
| Command | Covers |
|---|---|
| `npm run test:journeys` | 30 model invariants: story order, evidence episodes, chapter rule (no Virginia zig-zag), spoiler-safe, crossings, beats monotonic, no (0,0) |
| `npm run build && npm run test:share` | Share HTML/meta/escaping/redirects; OG PNGs 1200×630 for every card kind; 404s. `SHARE_OUT=dir` writes the PNGs |
| `npm run test:ui` | Deep link, drawn legs, step + URL, Home, playback, reload restores step, spoiler-safe, Esc exit, `/j/` path, `?place=`, marker glyph size |

## Change checklist
Model change → `test:journeys`, and update this file. Map layer change → map contract doc plus `test:ui`. Share/card change → `build` + `test:share`, and look at the PNGs.
