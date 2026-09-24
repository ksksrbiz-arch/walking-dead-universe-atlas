// Entry for scripts/test-journeys.mjs: the journey model plus the few data
// accessors the assertions need.
export * from "../../src/lib/journeys";
import {atlasData} from "../../src/data";
import {episodeById} from "../../src/lib/lookup";
export const episodeCount=atlasData.episodes.length;
export const episodeLocations=(id:string):string[]=>((episodeById.get(id) as any)?.locationIds??[]);
