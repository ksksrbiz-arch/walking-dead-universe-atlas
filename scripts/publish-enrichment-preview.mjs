#!/usr/bin/env node

import { mkdir, copyFile } from "node:fs/promises";

const ROOT = new URL("../", import.meta.url);
const SOURCE = new URL("data/enrichment/", ROOT);
const DEST = new URL("public/_enrichment/", ROOT);

const files = [
  "fandom-atlas-candidates.json",
  "fandom-page-enrichment-summary.json",
  "fandom-enrichment-audit.json"
];

await mkdir(DEST, { recursive: true });

for (const file of files) {
  await copyFile(new URL(file, SOURCE), new URL(file, DEST));
}

console.log(JSON.stringify({
  published: files.map((file) => "/_enrichment/" + file),
  omittedFromPreview: "fandom-page-enrichment.json (raw page payload retained as pipeline artifact; not published to avoid oversized public assets)"
}, null, 2));
