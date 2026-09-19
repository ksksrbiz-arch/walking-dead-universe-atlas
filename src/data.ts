import series from "../data/series.json";
import seasons from "../data/seasons.json";
import locations from "../data/locations.json";
import events from "../data/events.json";
import characters from "../data/characters.json";
import communities from "../data/communities.json";
import factions from "../data/factions.json";
import connections from "../data/connections.json";

export const atlasData={series,seasons,locations,events,characters,communities,factions,connections};
export type SeriesKey="TWD"|"FTWD"|"TALES"|"WB"|"OWL"|"DARYL"|"DEAD";
export type Location=typeof locations[number];
export type Event=typeof events[number];