# Mobile Map Gesture & Rendering Contract

## Why this exists

The Atlas mobile map previously developed a recurring blank-region/pan-boundary bug. The failure was caused by applying transforms to the map viewport/root SVG or to a wrapper that also contained the ocean background.

The current implementation intentionally separates the fixed viewport/background from the movable geographic content.

## Required rendering structure

```
 .mapSurface
   └── SVG viewport (fixed)
        ├── MapBackground (fixed ocean/background)
        └── .mapWorld (movable)
             ├── MapGeography
             ├── map labels
             └── location markers
```

### Transform rule

Never translate or scale `.mapSurface` or the root SVG to implement map panning.

The root SVG is the viewport. The ocean/background must remain fixed inside it.

Pan/zoom transforms belong on `mapWorldRef`. The implementation converts CSS-pixel pan values into SVG viewBox units using the SVG's rendered scale and applies a centered SVG transform.

## Pan-limit rule

Pan limits must be derived from the actual projected geographic content and rendered SVG scale.

Do not introduce arbitrary mobile caps. Those caps previously prevented users from traversing far enough to reach North America.

Do not disable one-finger dragging at base zoom.

## Gesture behavior

- One finger: pan at 1× and above; clamp to geographic-content bounds.
- Two fingers: pinch from 1× to 5× and preserve the pinch midpoint.
- Wheel: zoom around the cursor.
- Reset: fly back to the home framing (the 2010 story cluster centred in the unobstructed area, at the smallest zoom that gives the pan limits enough slack to get it there).
- Marker / cluster selection: resolved from the pointer-down target and acted on at release only when the gesture moved less than 6px. Clusters carry `data-cluster-ids` and go through the same path as markers — they no longer stop propagation, so a pan can start on a cluster.
- Tapping empty map with the sheet raised collapses it to peek.
- Any pointer-down cancels an in-flight camera move.

## Unobstructed-area framing (Sept 2026 redesign)

The map surface is now full-bleed behind all chrome (top bar, series row, controls, bottom sheet or side panel). Anything that floats over the map declares the edge it obstructs:

```
data-map-chrome="top" | "bottom" | "left" | "right"
```

`getVisibleRect()` measures those elements where they actually are and returns the free rectangle. Home framing, zoom buttons, place focus, episode/link/journey framing and cluster zoom all target the centre of that rectangle — no hard-coded chrome offsets. On phones the sheet is mid-transition when a focus request runs, so callers pass the sheet's *target* top (`sheetTopFor(snap)`), computed from the same function that sizes the sheet.

Camera moves use `flyTo(x, y, z)`: a requestAnimationFrame tween that calls `applyMapTransform` directly (off the React render path) and commits `pan`/`zoom` state once at the end. Targets are computed from projected coordinates (`panFor`), not from DOM marker positions, and are clamped with `getMapPanLimits(z)` for the *target* zoom.

Cluster merge radius is `20 / zoom` viewBox units (≈ constant on screen), so clusters split as you zoom. The selected place and up to eight highlighted episode/link places are always rendered as individual markers.

## Mobile regression checklist

1. Initial map renders with no blank vertical strip.
2. Drag left far enough to bring North America fully into view.
3. Drag right far enough to traverse toward Europe/Asia.
4. Drag vertically without exposing an unintended viewport/background boundary.
5. Pinch from 1× to a higher zoom.
6. Pan while zoomed.
7. Zoom back to 1×.
8. Reset returns to normal home framing.
9. Location markers remain attached to geographic positions.
10. Series row remains independently horizontally scrollable.
11. Time scrubber / dock remains fixed and usable; dragging the sheet handle does not pan the map.
12. Selecting a place frames it above the sheet (phone) or left of the panel (wide).
13. No runtime error appears during gestures.

Items 1–3, 5–9, 12 and 13 are automated in `scripts/ui-smoke.mjs` (`npm run test:ui` against a running preview) using real CDP touch input. It does not replace a physical-device pass.

## Anti-regression rule

Before changing map transforms, inspect `mapSvgRef`, `mapWorldRef`, `applyMapTransform`, `getMapPanLimits`, pointer gesture handlers, and `.mapSurface` / `.mapSurface svg` CSS together.

## Current architectural state

As of September 24, 2026 (UI redesign): unchanged transform model; map surface is full-bleed behind chrome; framing uses the unobstructed-area model above; camera moves are tweened. As of September 20, 2026: root SVG is the gesture/measurement viewport; ocean/background is outside the movable world group; `mapWorldRef` owns geographic transforms; pan/zoom does not translate the map viewport itself; unknown `(0,0)` locations with unknown certainty are excluded from geographic rendering; the core episode dataset remains 363 episodes.