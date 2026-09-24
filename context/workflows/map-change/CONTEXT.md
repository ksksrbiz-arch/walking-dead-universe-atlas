# Workflow: Map change

| Input | Process | Output | Completion |
|---|---|---|---|
| A map bug or feature (pan, zoom, markers, framing, clusters) | Reproduce the geometry first; change transform math only on `.mapWorld`; keep limits derived from projected content | Changed `src/App.tsx` map section (+ `styles.css` marker rules) | Contract checks pass |

## Load
- `docs/MOBILE_MAP_GESTURE_ARCHITECTURE.md` (contract + checklist)
- `src/App.tsx`: `applyMapTransform`, `getMapPanLimits`, `getVisibleRect`, `panFor`, `flyTo`, `focusMapOn`, `computeHomePan`, pointer handlers, marker JSX
- `src/styles.css`: `.mapSurface`, marker rules

## Exclude
- Views and detail pages; data files

## Never
- Transform `.mapSurface` or the root SVG.
- Add arbitrary pan caps or disable base-zoom dragging.
- Hard-code chrome offsets — declare `data-map-chrome` on new floating UI instead.

## Completion
- `npm run test:ui` passes (pan both ways, pinch 1–5×, reset, tap vs drag, framing above sheet).
- Manual check on a phone viewport; physical device when available.
- Contract doc updated if behaviour changed.
