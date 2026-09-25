#!/usr/bin/env node
import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const file = fileURLToPath(new URL("../data/enrichment/fandom-canonical.json", import.meta.url));
const fallback = {
  version: 1,
  generatedAt: null,
  source: "walking-dead-wiki",
  policy: "Matched Fandom enrichment is display-only enrichment. Canonical Atlas fields remain authoritative unless explicitly reconciled.",
  characters: {},
  locations: {},
  episodes: {}
};

try {
  await access(file);
  console.log("Fandom canonical snapshot present; using committed enrichment.");
} catch {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(fallback, null, 2) + "\n");
  console.warn("Fandom canonical snapshot is missing; created an empty fallback. Run the Fandom enrichment workflow to populate it.");
}
