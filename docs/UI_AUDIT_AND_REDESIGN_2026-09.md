# UI Audit & Redesign — September 2026

A full audit of the Atlas interface as shipped at `166daa2`, measured on a production build at phone (390×844), tablet (820×1180), desktop (1440×900) and landscape-phone (844×390) viewports, followed by a ground-up redesign of the shell, views and stylesheet. The data layer, the 363-episode dataset and the map transform contract are unchanged.

## 1. What was wrong

### Layout & hierarchy
1. **Clipped content panel on phones.** Timeline, People and Guide rendered inside a fixed card that stopped ~70% down the screen, leaving a dead band of map colour beneath it. Content always felt cut off.
2. **Chrome ate the map.** A 100px header, a series rail, a layer rail (overlapping each other, with a floating "SWIPE" hint), a 3-button zoom stack, the time card and the bottom nav left the map under 45% of a phone screen. At launch the main story cluster sat half off the left edge.
3. **Two always-on filter rails.** Series and map-layer filters were both permanently visible, in low-contrast grey on a translucent strip.
4. **Tablet:** the side panel covered half the map; the timeline dock slid under it and truncated ("Drag the c…"); the series rail was clipped.
5. **Desktop:** the bottom nav floated alone in a corner; failed images rendered broken-image glyphs in list cards.

### Typography & legibility
6. Almost every label was uppercase monospace at 7–9px with wide tracking. With everything shouting at the same volume there was no hierarchy, and a large share of text was below phone-legible size.
7. The light "paper" map clashed with the dark UI, and series colours (TWD is off-white) had poor contrast on beige land. Markers were thin 18px outline glyphs — hard to see and hard to hit.

### Flow
8. **Instructions before content.** Timeline opened with three stacked explainer blocks before any data. People opened with a stats card, a "start with a person" note, a search box and a relationship graph pinned to Michonne; the character list started below the fold.
9. **Tracking was buried.** Watch progress — the one feature for keeping track — lived behind Guide → Watch order. Episode lists never showed watched state and an episode page could not be marked watched.
10. **No way back.** Tapping place → episode → character replaced the panel each time; closing lost the whole trail.
11. **Time control friction.** The scrubber used `step=.01` (fractional years leaked into labels), the native range input only moves from its thumb on iOS, and there was no sense of *how much story* each year holds.
12. **Map focus was blind to the UI.** Selecting a place centred it at 38% of the surface whatever the panel was doing, so markers regularly landed under the sheet. Four copy-pasted focus routines differed subtly (one clamped both axes with `max(limitX, limitY)`). Tapping a cluster opened a list instead of zooming in.
13. Developer-facing media audit lists were mixed into viewer content in Guide.

### Code health
14. `styles.css` was ~1,930 lines (106 KB) of layered overrides: 20+ `max-width:699px` blocks re-styling the same selectors.
15. Detail panels resolved ids with `Array.find` hundreds of times per render; the watch order was rebuilt with an O(n²) pass on every call; series metadata was duplicated; there were no React types, so `tsc` could not check the UI at all.

## 2. Principles applied

| Principle | How it shows up |
|---|---|
| Thumb zone first | Tabs, the time scrubber and the sheet live in the bottom half; the top is passive status + search. |
| One surface, progressive disclosure | A single bottom sheet with three detents (peek / half / full) — drag, tap or keyboard. Wide screens get one floating side panel. |
| Content before instructions | Every screen opens on data. Explanations became one-line notes at the bottom. |
| Most important first | People sorted by episode count; search suggests the most-featured people and most-visited places. |
| Legible by default | 15px body, ≥11px labels, 16px inputs (no iOS zoom), 44px touch targets, two typefaces with clear roles. |
| Feedback & delight | Fly-to camera moves, pulsing markers for places new this year, a stacked activity histogram you scrub with your thumb, instant watched checkmarks, an "undo last" on the watch tracker. |
| Never lose your place | Back stack with scroll restoration; the browser/Android back button walks it. |
| Respect the platform | Safe areas, `prefers-reduced-motion`, landscape layout, keyboard (`/` search, `Esc`, arrows on sliders). |
| Honest data | Certainty chips stay; unknown coordinates are listed as "not placed", never guessed. |

## 3. The new interface

**Navigation:** Map · Timeline · People · Watch. Guide's reference content (stats, data health, method, sources, media coverage) moved to a collapsible *About this atlas* at the bottom of Watch.

- **Map** — full-bleed dark map. Top: search pill, year/era chip, one series chip row (doubles as the legend). Right: layers popover, zoom, home. Bottom sheet peek = the time scrubber (year, era, episode/place counts, per-series activity histogram, play). Pull up for *This year*: era card, "Happening in {year}" episode carousel with watch toggles, "New in {year}" places, everything else on the map, unplaced places.
- **Timeline** — year stepper, a series×year heatmap you can drag across to scrub time, series filters, then every episode grouped by story year with sticky year headers and universe events inline.
- **People** — search + segmented People / Groups / Links. Portrait grid sorted by prominence, series dots, first year, and a per-person "seen" bar driven by your watch progress.
- **Watch** — progress ring, *Up next* hero with one-tap **Mark watched** (and undo), per-series progress bars that double as filters, To-watch / All / Watched list in story order.
- **Detail pages** (place, episode, character, community/faction, link) share one anatomy: hero → primary actions → stats → sections (long lists preview 4–6 rows with "Show all") → wiki → relationship graph (collapsed) → provenance note. Episodes gain *Before / After* in story order, "Who's in it" portraits and a watched toggle; characters gain *Trace journey* and "You've seen N%".

**Map behaviour:** markers are filled series-coloured badges; clusters are coloured by their dominant series and tapping one zooms to fit (co-located places open a list). The selected place and an episode's/link's places are always pulled out of clusters and other markers dim. Every focus action frames its targets inside the part of the map not covered by chrome (see the map contract).

## 4. Verification

- `npm run typecheck` (now real: React/d3 types added) and `npm run build` pass.
- `npm run audit:atlas` PASS — 363 episodes, 667 nodes, 5,997 edges.
- `npm run test:ui` — 27 browser checks with real touch input on a phone viewport: fixed SVG viewport, untransformed root, ocean outside `.mapWorld`, one-finger pan both directions (Europe/Asia and back to North America), pinch 1×→5× clamp and back to 1×, zoomed pan, reset returns to home, drag-from-marker does not select, tap acts, selected place framed above the sheet, marker moves exactly with a pan (attached to geography), search dialog traps focus and returns it on dismiss, all tabs render, 363-episode watch order, watch progress persists across reload, sheet drag expands/collapses, no runtime errors.
- Screenshots reviewed at all four viewports.
- **Still open:** a physical-device pass (real touch feel, VoiceOver/TalkBack), per `ROADMAP.md`.
