# TWDU Atlas — Atlas Architecture Contract

## Product North Star

**The timeline is the spine. The map is the window into the timeline. Connections are the connective tissue.**

The Walking Dead Universe Atlas is a synchronized exploration system for the full TV universe.

The primary experience connects:

**Time → Story → Geography → Connections → Details**

The map remains the cinematic centerpiece. Chronology remains the structural backbone. Metadata is subordinate to exploration.

## Primary Atlas Mode

The default Atlas view combines:

1. **Cinematic geography** — the interactive world map is the primary visual surface.
2. **Persistent chronology** — a compact timeline dock stays attached to the map instead of hiding chronology inside a separate page.
3. **Cross-series lanes** — TWD, FEAR, TALES, WORLD BEYOND, TOWL, DARYL, and DEAD CITY are visually distinguishable.
4. **Episode/event objects** — real chronology records are represented on the spine; the UI must not replace the 363-episode dataset with summaries.
5. **Contextual detail** — selecting an episode, place, person, or connection opens only the detail needed for that selection.

### Synchronization rules

- Drag the timeline → the universe year changes and the map updates (places new in that year pulse).
- Mark an episode watched anywhere → every list, the People grid and the Watch tracker reflect it.
- Tap an episode → chronology position changes, its geography becomes relevant, and the episode can be opened.
- Tap a map location → chronology jumps to that location's history.
- Select a character → show appearances/journey across time and geography.
- Select a connection → highlight both endpoints and their relevant time/geography.
- Series filters affect timeline, map, and connection visibility together.
- The year scrubber represents the universe's temporal position, not merely a filter.

## Secondary Modes

- **Map** — synchronized Map + time scrubber; default.
- **Timeline** — series×year heatmap scrubber and the full story-order episode list.
- **People** — characters, communities/factions, and documented links.
- **Watch** — chronological watch tracker (progress, up next, per-series progress) plus *About this atlas* (methodology, sources, data health, media coverage).

These are depth modes, not replacements for the Atlas experience.

## Connections

Connections are a first-class data layer, not a decorative list.

The normalized connection registry should support endpoint entity IDs, connection type, label, certainty, relevant series, relevant time range, related locations, and source/provenance.

Render connections contextually. Avoid drawing every relationship permanently over the map.

## Chronology Data Contract

Chronology records retain stable ID, kind, series ID, season/episode when applicable, title, start/end, precision, certainty, location IDs, character IDs, community IDs, faction IDs, connection IDs, and sources.

Air date and in-universe chronology are separate fields. Uncertain chronology must remain explicitly labeled.

## Mobile Interaction Contract

Mobile is map-first but chronology-visible.

Target hierarchy:

1. Map: full-bleed; ~70% visible with the sheet at peek.
2. Time scrubber: the sheet's peek state — always one glance away, scrubbed with a thumb across the activity histogram.
3. Contextual detail: the same sheet at half height, expandable to full; Back walks the exploration trail.
4. Navigation: bottom tab bar (phones) / top-bar tabs (wide screens).

Avoid giant permanent sheets, redundant control stacks, and dashboard-style cards covering the geography. Design tokens, layout model and component rules: `context/references/ui-design-system.md`.

## Performance Contract

- Map gesture frames stay off the React render path.
- Prefer direct transform updates + requestAnimationFrame for pan/zoom.
- Do not run expensive SVG filters during gestures.
- Keep 50m geography until profiling proves a lower-resolution or Canvas/WebGL layer is necessary.
- Timeline interactions may use React state; map gestures should not.
- Do not introduce always-on animated connection graphs over the entire world.

## Data Scope

Current core episode dataset: **363 TV episodes**.

Current tracked layers include locations, characters, communities, factions, connections, universe events, webisodes/specials, watch-order scaffolding, and official-media provenance.

## Implementation Priority

1. Persistent synchronized Map + Timeline Atlas mode.
2. Episode → geography synchronization.
3. Location → chronology synchronization.
4. Contextual connection rendering.
5. Character journey synchronization.
6. Expanded episode-by-episode watch order.
7. Webisodes/specials chronology integration.
8. Media coverage expansion with provenance.
9. Performance profiling and geometry optimization if needed.

## Non-Negotiables

- Do not let visual polish replace chronology.
- Do not let the map become a decorative background.
- Do not reduce the universe to series-level cards.
- Do not flatten uncertain dates into false precision.
- Do not invent episode/location/media relationships.
- Preserve source/provenance for inferred or approximate data.

## Definition of Done for the Core Experience

A user should be able to start on the world map, scrub through the universe chronologically, see which series are active at that point, select an episode, see its relevant geography, follow a connection into another series, and return to the chronology without losing their place.

That loop is the product.
