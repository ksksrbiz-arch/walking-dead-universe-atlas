# Chronology research notes

The atlas distinguishes broadcast order from in-universe chronology.

## Primary chronology reference

The Walking Dead Wiki's TV Universe Timeline states that the outbreak begins in 2010 and gives episode/day-level chronology across The Walking Dead, Fear the Walking Dead, World Beyond, Tales, Dead City, Daryl Dixon and The Ones Who Live.

For the flagship series, the published timeline places:
- TWD S1–S2: October–November 2010 (both seasons occur in the same year; the 7–8 month gap to S3 is the first real time skip)
- TWD S3: June–July 2011
- TWD S4–S8: January–June 2012 (the wiki's own notes walk through minimal/no time skips between S4–S8, compressing all five seasons into one six-month window)
- TWD S9 E1–E5 (Rick's disappearance / bridge explosion): February–March 2014
- TWD S9 E6–E16 (post time-jump, Whisperer war): October 2020–January 2021
- TWD S10: August–September 2021
- TWD S11: September 2021–June 2023

Fear's timeline source places S1–S3 within the initial Aug–Oct 2010 outbreak window, S4 in Oct–Nov 2012, S5–S6 across Oct 2013–Apr 2014, S7 in mid-2014, and S8 after a large ~7-year jump into Jan–Mar 2022. Note: the wiki's own dating for Morgan's Fear S4 material (Oct–Nov 2012) sits chronologically *before* his confirmed TWD departure (2014, see below) — this is a known unresolved wrinkle in the source's own chronology, not something this atlas has tried to resolve; the affected event carries `certainty: "approximate"`.

World Beyond's entire two-season story (S1–S2) occurs within a single window: August–October 2020.

Dead City's main season 1 story ("Old Acquaintances" through "Doma Smo") occurs in 2027 (June–December), continuing into season 2 which crosses into January–February 2028. Season 3 (aired 2026) is placed at 2028 in-universe on the strength of the two episode titles the wiki timeline has documented so far (`certainty: "approximate"`, subject to revision as more episode-level detail is published).

Daryl Dixon's seasons 1–3 (France, then Spain) all occur within a single continuous day-count inside 2023 — the wiki timeline never rolls the header year over, despite the seasons airing in 2023/2024/2025. Broadcast year should not be read as story year here.

The Ones Who Live's framing/flashback material runs 1980–2021, but the present-day A-plot (Rick and Michonne's CRM storyline) is 2022, with the finale epilogue (return to Alexandria) landing in summer 2023.

Tales is handled episode-by-episode because it is an anthology. Known anchors include Blair/Gina at the initial outbreak (2010), Evie/Joe in late 2011, Dee in 2012–2013, Amy/Dr. Everett around 2020, Davon in August–October 2025 (~15 years post-outbreak), and La Doña as unresolved/uncertain (absent from the wiki's published timeline entirely).

## 2026-09 cross-check against timelinetwd.com / Nerdist / Fandom TV Series Timeline

Re-verified against https://www.timelinetwd.com/the-walking-dead-universe-locations-and-maps/, the Nerdist "entire timeline explained by season" article, and the Fandom TV Series Timeline family of pages (fetched directly via the Fandom API's wikitext export, since both timelinetwd.com and the rendered wiki pages return partial/blocked content to simple fetches). This pass found several in-universe years in `events.json`, `universeEvents.json`, and `locations.json` that had drifted to match each show's *broadcast* year instead of its researched story year (the exact anti-pattern this data policy exists to prevent) — e.g. Alexandria/Hilltop/Kingdom/Sanctuary tagged 2014–2016 instead of the compressed 2012 window; Dead City's Manhattan tagged 2024 instead of 2027; Daryl Dixon's Spain season tagged 2025 instead of 2023; The Ones Who Live's Philadelphia arc tagged 2024 instead of 2022; Rick's CRM capture tagged 2018 instead of 2014. These have been corrected in the data files. `episodes.json`'s TWD/FTWD season-level anchors were already correct and were used as the cross-reference baseline for fixing the rest; `episodes.json` itself needed the same broadcast-year-drift fix applied to TWD S10, World Beyond S2, Dead City S1–S3, Daryl Dixon S2–S3, and The Ones Who Live S1 (which previously used one blanket 2019–2024 range for all six episodes).

Known gap: `grady-memorial`, `oceanside`, `cumberland`, `clark-home`, `mexico-baja`, `truck-stop`, `campus-colony`, `philadelphia-crm`, and `marseille` are not yet wired into any episode's `locationIds` (only some are covered by curated historical associations in `locationEpisodes.json`). Their `year` values are researched but not yet episode-anchored; backfilling that linkage is future work.

## Data policy

- airDate is release metadata and is never treated as in-universe chronology.
- timelineStart / timelineEnd represent the best researched anchor currently available.
- timelinePrecision identifies year/range/unknown precision.
- certainty prevents uncertain placements from being presented as fact.
- The interactive Watch Next engine uses these normalized anchors and explicitly treats ties/ranges as approximate until episode/day-level anchors are added.

## Current scope

The current episode registry contains 363 TV episodes across the seven primary TV series. Webisodes/specials are intentionally a separate ingestion layer so they can be inserted between TV episodes without corrupting the TV episode IDs.

## References

- https://walkingdead.fandom.com/wiki/TV_Series_Timeline
- https://walkingdead.fandom.com/wiki/Television_Universe_Timeline
- https://walkingdead.fandom.com/wiki/Fear_the_Walking_Dead_Timeline
- https://walkingdead.fandom.com/wiki/World_Beyond_Timeline
- https://walkingdead.fandom.com/wiki/Dead_City_Timeline
- https://walkingdead.fandom.com/wiki/Daryl_Series_Timeline
- https://walkingdead.fandom.com/wiki/The_Ones_Who_Live_Timeline
- https://walkingdead.fandom.com/wiki/Tales_of_the_Walking_Dead_Timeline
- https://walkingdead.fandom.com/wiki/Chronological_Episode_Order
- https://www.timelinetwd.com/the-walking-dead-universe-locations-and-maps/
- https://nerdist.com/article/the-walking-dead-and-upcoming-spinoffs-entire-timeline-explained-by-season/
- https://www.amc.com/episodes
