import {build} from "esbuild";
import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
const files=["characters","locations","episodes","communities","factions","connections","series","sources"];
const hash=createHash("sha256");
for(const name of files)hash.update(await readFile(new URL("../data/"+name+".json",import.meta.url)));
await build({entryPoints:[fileURLToPath(new URL("../workers/atlas-ai/src/index.mjs",import.meta.url))],outfile:fileURLToPath(new URL("../workers/atlas-ai/dist/index.mjs",import.meta.url)),bundle:true,format:"esm",platform:"browser",define:{ATLAS_DATA_REVISION:JSON.stringify(hash.digest("hex").slice(0,16))}});
console.log("Atlas AI Worker built from checked-in data.");
