import series from "../data/series.json";
import seasons from "../data/seasons.json";
import locations from "../data/locations.json";
import events from "../data/events.json";
import characters from "../data/characters.json";
import communities from "../data/communities.json";
import factions from "../data/factions.json";
import connections from "../data/connections.json";
import watchOrder from "../data/watchOrder.json";
import episodes from "../data/episodes.json";
import seasonMeta from "../data/seasonMeta.json";\nimport media from "../data/media.json";

export const atlasData={series,seasons,seasonMeta,locations,events,characters,communities,factions,connections,watchOrder,episodes,media};
export type SeriesKey="TWD"|"FTWD"|"TALES"|"WB"|"OWL"|"DARYL"|"DEAD";
export type Location=typeof locations[number];
export type Event=typeof events[number];
export type WatchOrderItem=typeof watchOrder[number];
