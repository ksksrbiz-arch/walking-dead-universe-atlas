# Episode registry schema

The episode registry is intentionally being built separately from the UI so chronology can be audited before it drives the map.

Each episode should use:

- `id` — stable ID such as `twd-s01-e01`
- `seriesId` — foreign key into `series.json`
- `seasonId` — foreign key into `seasons.json`
- `episodeNumber`
- `title`
- `airDate`
- `timelineStart`
- `timelineEnd`
- `timelinePrecision` — `day`, `week`, `month`, `season`, `year`, or `unknown`
- `locationIds`
- `characterIds`
- `communityIds`
- `factionIds`
- `connectionIds`
- `certainty`
- `sources`

Chronology is deliberately modeled separately from air date. An episode's release date is not automatically its in-universe date.

Unknown chronology requires null timelineStart/timelineEnd, unknown precision and unknown certainty. Do not reuse a release year or extrapolate a previous season.

Reviewed placements may include chronologyBasis (main-story), chronologySources (IDs of chronology sources also listed in sources), chronologyCheckedAt, chronologyNote (flashbacks/epilogues or evidence limits), and chronologyOrder (a sourced integer sequence resolving matching-year ties). Fan calendar interpretations use approximate certainty. Release indexes alone do not establish story chronology.

For anthology episodes, the event layer will allow each episode to be positioned independently rather than forcing the entire anthology into one chronological block.

Optional appearanceTypes maps character IDs to archive or flashback for explicitly reviewed appearances. These remain discoverable episode appearances but are excluded from main-story journey evidence. Optional characterLocationIds overrides episode-level places for a specific character; an empty list means no main-location association is established. Overrides must reference a listed character and a subset of locationIds.
