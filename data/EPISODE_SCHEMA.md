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

For anthology episodes, the event layer will allow each episode to be positioned independently rather than forcing the entire anthology into one chronological block.
