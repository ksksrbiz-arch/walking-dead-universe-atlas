# Walker herds

The map layer uses `data/hordes.json`, with independent TV herd sequences rather than an invented herd drifting every year. Each event cites a Fandom page and an existing episode anchor. The year comes from Atlas story chronology, not broadcast dates. Events within a year can be selected individually; no speed or precise date is inferred.

The initial registry covers the Atlanta/farm herd, the quarry branch diverted to Alexandria, and the Whisperer horde at Alexandria and the hospital. The quarry, convoy path, and final cliff have no established Atlas coordinates and are deliberately unpinned. Existing location coordinates remain approximate. A cleared event shows a cleared marker only when its location is known.

Dashed straight segments link adjacent recorded locations only. They are schematic, clipped to the land shape, and never bridge unknown or hidden events. Walker glyphs are symbols, not population estimates. All marker geometry counter-scales together, so zoom does not scatter walkers away from their anchor.

Year, series, and watched-episode filters apply before rendering. In spoiler-safe mode, the full herd summary is hidden; only watched event details appear. Herd taps use the map's pointer capture and movement threshold, so a drag starting on a herd pans the map instead of opening its details. Keyboard activation remains available. The event panel marks the viewport edge it occupies for the existing camera system.

Run `npm run test:hordes`, `npm run typecheck`, and `npm run build`. With the preview on port 4173, run `npm run test:horde-ui` and `npm run test:ui`. Browser automation is not a substitute for a physical touch-device check.
