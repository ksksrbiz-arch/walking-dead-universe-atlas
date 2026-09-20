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
- Reset: return to the intended home position at 1×.
- Marker selection: a marker tap only selects when the gesture did not meaningfully move the map.

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
10. Series rail remains independently horizontally scrollable.
11. Timeline dock remains fixed and usable.
12. No runtime error appears during gestures.

## Anti-regression rule

Before changing map transforms, inspect `mapSvgRef`, `mapWorldRef`, `applyMapTransform`, `getMapPanLimits`, pointer gesture handlers, and `.mapSurface` / `.mapSurface svg` CSS together.

## Current architectural state

As of September 20, 2026: root SVG is the gesture/measurement viewport; ocean/background is outside the movable world group; `mapWorldRef` owns geographic transforms; pan/zoom does not translate the map viewport itself; unknown `(0,0)` locations with unknown certainty are excluded from geographic rendering; the core episode dataset remains 363 episodes.