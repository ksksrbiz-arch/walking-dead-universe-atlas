# The Walking Dead Universe Atlas

A mobile-first, data-driven atlas for the television **Walking Dead Universe (TWDU)**.

## Current architecture

The application is now deployed through **Vercel** with GitHub as the source of truth. The existing Netlify runtime/API layer remains temporarily available during the migration.

- **React**
- **TypeScript**
- **Vite**
- **Vercel**
- normalized JSON data registries

## Current application

The React app provides:

- **Map** — full-bleed dark world map with series-coloured markers, clusters that zoom on tap, a draggable bottom sheet, and a time scrubber with per-series activity for every universe year
- **Timeline** — series×year heatmap you scrub with a thumb, and all 363 episodes in story order grouped by year
- **People** — characters (sorted by prominence), communities, factions and documented links
- **Watch** — chronological watch tracker: progress ring, one-tap "up next", per-series progress, watched state on every episode list (stored in the browser)
- Detail pages for places, episodes, characters, groups and links with back navigation
- Global search (`/`), keyboard support, safe-area and reduced-motion aware, phone/tablet/desktop/landscape layouts

UI design rules: `context/references/ui-design-system.md`. Audit and rationale: `docs/UI_AUDIT_AND_REDESIGN_2026-09.md`.

## Data architecture

```
data/
  series.json
  seasons.json
  episodes.json
  events.json
  locations.json
  characters.json
  communities.json
  factions.json
  connections.json
  sources.json

src/
  App.tsx
  main.tsx
  data.ts
  lib/
    validateData.ts
  styles.css
```

The UI should consume these registries rather than becoming the source of canon facts.

## Canon precision

Each timeline/geographic entity can carry certainty metadata:

- `confirmed`
- `inferred`
- `approximate`
- `announced`
- `unknown`

The Atlas deliberately avoids inventing exact dates or fictional travel routes where the source material does not establish them.

## Build & checks

```
npm run typecheck     # TypeScript over src/
npm run build         # production build
npm run audit:atlas   # data/graph integrity
npm run test:ui       # browser regression (needs `vite preview` + Playwright; see scripts/ui-smoke.mjs)
```

For Vercel:

- Production branch: `main`
- Framework: **Vite**
- Build command: `npm run build`
- Output directory: `dist`
- Root directory: `/`

## Roadmap

### Phase 1 — Canonical data engine
1. Complete television series registry
2. Complete season registry
3. Complete episode registry
4. Episode-level timeline events
5. Location registry and geographic precision
6. Character registry
7. Community/faction registry
8. Cross-series connection graph
9. Source/provenance metadata
10. Automated continuity validation

### Phase 2 — Atlas engine
- map layers
- routes and movement events
- location pages
- episode pages
- timeline navigation
- character pages
- relationship graph

### Phase 3 — Watch-order engine
- chronological order
- release order
- series/season order
- anthology episode placement
- crossover-aware navigation
- alternate viewing modes

### Phase 4 — Production quality
- accessibility
- performance
- offline-friendly caching
- advanced search
- source auditing
- visual polish
- mobile/tablet optimization

This is a fan reference project and is not affiliated with AMC Networks or the creators of The Walking Dead.
