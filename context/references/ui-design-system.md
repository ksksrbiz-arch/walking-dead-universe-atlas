# UI Design System (reference)

Living contract for the Atlas interface. Tokens live at the top of `src/styles.css`; components in `src/components/ui.tsx`. Background and rationale: `docs/UI_AUDIT_AND_REDESIGN_2026-09.md`.

## Tokens

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0a0d0c` | App background, full pages |
| `--surface` / `-2` / `-3` | `#121614` / `#181d1a` / `#222824` | Sheet → rows/cards → pressed/nested |
| `--line` / `--line-2` | 9% / 17% warm white | Hairlines / emphasised borders |
| `--text` / `-2` / `-3` | `#ecebe4` / `#b3bab4` / `#7f8983` | Primary / secondary / tertiary text |
| `--accent` / `-2` | `#d9502a` / `#f2794f` | Primary actions, current year, active tab. One accent only. |
| `--good` / `--warn` | `#7cc49a` / `#e0b057` | Watched + confirmed / approximate |
| `--font` | Inter | All running text and labels |
| `--display` | Barlow Condensed | Titles, years, big numbers — uppercase |

Series colours come only from `src/lib/series.ts` (`META`, `seriesColor`). Pass them to CSS as `--c` on the element; never hard-code a series colour in CSS.
Journey slot colours come only from `JOURNEY_COLORS` (`src/lib/journeys.ts`), passed as `--jc` (`.jdot`, `.journeyLeg`, stop cards) — see `context/references/journeys-and-sharing.md`.
Icons: app UI icons are lucide via `components/Icon.tsx` (app vocabulary → glyph); place/entity glyphs via `components/AtlasIcon.tsx` (`AtlasIconGlyph` for SVG markers). Never import lucide directly in a view.

## Type scale
Display: 44 (scrubber year) · 36 (page title) · 34/40 (detail hero) · 22–28 (stats, era, up-next). Text: 15 body/row titles · 13–14 secondary · 12 meta · 11 overline (uppercase, +.08em). Inputs are 16px minimum (prevents iOS zoom). Nothing below 10px.

## Layout model
- **Sheet layout** (`.layout-sheet`, phones + portrait tablets): full-bleed map; floating top bar; bottom tab bar; one bottom sheet (`.sheet.onMap`) with detents `peek` (204px overview / 112px detail), `half` (~52%), `full`. Non-map tabs render the same sheet as a full page (`.asPage`). Heights are computed in `App.tsx` (`sheetHeightFor`) so map framing knows where the sheet settles.
- **Panel layout** (`.layout-panel`, ≥900px wide or short landscape): one floating panel on the right (`--panel-w`), tabs in the top bar, time dock bottom-left (lane dock ≥1180×760, compact scrubber otherwise). The panel stays on the right because the story geography is on the left of the projection.
- Content max width 760px inside sheets/pages. Side gutters 16px (+ safe areas).

## Components (src/components/ui.tsx)
`Section` (optionally collapsible) · `ShowMore` (preview N rows) · `Hero` · `ActionBar` + `.btn` / `.btn.primary` · `Stats` (4-up) · `Chip` (+ `certaintyTone`) · `EpisodeRow` (thumb, code, story year, watch toggle) · `PlaceRow` · `PlaceChips` · `WatchToggle` · `ProgressRing` · `Note` · `Empty`. Detail-only helpers live in `src/views/details/shared.tsx` (`WikiSection`, `ConnectionRow/List`, `PortraitStrip`, `PortraitImage`, `Gallery`, `useEntityPhotos`, `useLightbox`, `GraphSection`). `Lightbox` (`components/Lightbox.tsx`) is the only fullscreen image viewer. Journey UI: `JourneyPanel` + `JourneyPlayer` (`views/JourneyPanel.tsx`), `.switchRow` for on/off settings, `.toast` for transient confirmations (share).

Rules:
- Every tappable thing is ≥44px in its smallest dimension. The only exception: compact watch toggles are 40px inside a 58px row; on episode cards they are 44px.
- Rows are `.row`; a row with two actions (open + watch) uses `.rowMain` + `WatchToggle` side by side, never nested buttons.
- Lists longer than ~6 use `ShowMore`; secondary blocks (wiki, sources, graph) are collapsible and closed unless they carry the page's main content.
- Episode rows always show the watched state. Any new episode list must use `EpisodeRow` or `EpisodeCard`.
- Images go through `AtlasImage` (sized via `width`/`sizes`, blurred placeholder, fade-in, credit via `Credit`/`Hero creditPage`); a failed image hides itself so the gradient placeholder shows. Never render a broken-image glyph.
- Explanatory copy is a single `Note` at the bottom — never a block above content.
- One primary (accent) button per screen.

## Navigation
`AtlasContext` (`src/lib/atlasContext.ts`) exposes `open*`, `show*OnMap`, year and watch state. Opening an entity pushes the previous `{view, focus, scroll}` onto the back stack; Back restores view, focus and scroll; ✕ clears the stack. Places always open on the map; other entities open in the current tab. A journey is a map mode, not a focus: `startJourney` pushes the stack and shows `JourneyPanel` while no detail is open; ✕ on the panel / Esc / browser Back leave it. The URL mirrors journey and focus state (`?j=`, `?place=`, `?ep=`, `?who=`).

## Motion
Sheet height 300ms `--ease`; map flights 520ms ease-in-out (skipped under reduced motion); marker pulse only for places new in the current year and the selection; the latest journey leg draws in (0.9s) and the avatar hops to its new stop. `prefers-reduced-motion` disables all animation.
