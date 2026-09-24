# Workflow: UI change

| Input | Process | Output | Completion |
|---|---|---|---|
| A UI request (new screen, restyle, component) | Read `context/references/ui-design-system.md`; reuse `src/components/ui.tsx` primitives and tokens; route actions through `useAtlas()` | Changed `src/views/**`, `src/components/**`, `src/styles.css` | All checks below pass |

## Load
- `context/references/ui-design-system.md`
- The view/component being changed, `src/components/ui.tsx`
- `src/App.tsx` only if navigation or the sheet/panel shell changes

## Exclude
- Map gesture code in `App.tsx` unless the change touches the map (then switch to `map-change`)
- Data files and enrichment scripts

## Process
1. Find the closest existing pattern (row, section, hero, sheet) and extend it; do not add a parallel style.
2. New colours → tokens; series colours → `--c` from `seriesColor()`.
3. Keep 44px targets, 16px inputs, content before explanation, one primary button per screen.
4. Episode lists use `EpisodeRow`/`EpisodeCard` so watched state stays visible everywhere.

## Completion
- `npm run typecheck` and `npm run build` pass.
- `npm run test:ui` passes against `vite preview`.
- Screenshots checked at 390×844, 820×1180, 1440×900 and 844×390.
- `context/references/ui-design-system.md` updated if a rule or token changed.
