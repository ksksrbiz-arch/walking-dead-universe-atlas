# AGENTS.md — Walking Dead Universe Atlas

## Project intent

Walking Dead Universe Atlas is a chronology-first, map-centered exploration application for the television Walking Dead Universe.

The core product loop is: **Time → Story → Geography → Connections → Details**.

## Critical mobile map architecture

The mobile map rendering contract is documented in `docs/MOBILE_MAP_GESTURE_ARCHITECTURE.md`. Do not casually change the map transform architecture.

Required hierarchy:

```
 .mapSurface
   └── fixed SVG viewport
        ├── fixed MapBackground / ocean
        └── .mapWorld
             ├── geography
             ├── labels
             └── markers
```

### Hard rule

Never apply the pan/zoom transform to `.mapSurface` or the root SVG. The root SVG is the viewport. Transforming it moves the viewport itself and causes the blank-region regression previously observed on mobile.

Apply transforms to `mapWorldRef` only.

## Map gesture rules

- One-finger panning must work at base zoom.
- Do not solve pan bugs by disabling base-zoom dragging.
- Do not introduce arbitrary mobile pan caps.
- Pan limits must be derived from actual geographic content and rendered SVG scale.
- Pinch zoom must remain functional from 1× through 5×.
- Reset must restore the intended home framing.
- Marker taps must not trigger after a meaningful drag.

## Before modifying map code

Inspect these together: `src/App.tsx` (`mapSvgRef`, `mapWorldRef`, `applyMapTransform`, `getMapPanLimits`, `getVisibleRect`, `flyTo`, `focusMapOn`, pointer handlers, map JSX hierarchy) and `src/styles.css` (`.mapSurface`, `.mapSurface svg`, marker rules). Floating UI over the map must declare `data-map-chrome` so framing avoids it.

## Regression testing

After map changes: verify fixed SVG viewport, movable `.mapWorld`, ocean outside `.mapWorld`, root SVG not transformed, base-zoom dragging, full traversal to North America and back toward Europe/Asia, pinch zoom, zoomed panning, reset, marker attachment, and data/index integrity.

`npm run test:ui` automates most of this with real touch input against `vite preview`. Static validation and scripted checks do not replace a live mobile device test when one is available.

## Data integrity

Current core dataset: **363 episodes**.

When episode/location relationships change: modify source data, regenerate derived indexes, run the structural audit, check reverse references, chronology, and coordinates, then proceed to UI changes.

Unknown geographic coordinates must not silently render at `(0,0)`.

## Bug-prevention principle

Prefer fixing the underlying coordinate-space, DOM, or rendering-model problem over increasingly restrictive clamps or UI exceptions. When a mobile map regression occurs, reproduce the geometry first.

## Documentation

Maintain the mobile map contract in `docs/MOBILE_MAP_GESTURE_ARCHITECTURE.md`, the broader product architecture in `docs/ATLAS_ARCHITECTURE.md`, and UI tokens/layout/component rules in `context/references/ui-design-system.md`. Update documentation when changing the map rendering model or the design system. Task routing: `CLAUDE.md`.