#!/usr/bin/env node
import { spawn } from "node:child_process";
import { access, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const OUT = fileURLToPath(new URL("../data/enrichment/", import.meta.url));
const statusFile = fileURLToPath(new URL("../data/enrichment/fandom-netlify-run.json", import.meta.url));

const steps = [
  ["enrich:fandom-atlas", "Discover Fandom candidate records"],
  ["enrich:fandom-pages", "Fetch and enrich Fandom pages"],
  ["enrich:fandom-galleries", "Exhaustively crawl Fandom character, location, episode and promo galleries"],
  ["reconcile:fandom", "Reconcile Fandom records to canonical Atlas entities"],
  ["publish:fandom-canonical", "Publish the matched canonical enrichment snapshot"],
  ["promote:fandom-media", "Promote approved Fandom media with provenance"]
];

function run(command) {
  return new Promise((resolve) => {
    const child = spawn("npm", ["run", command], {
      cwd: ROOT,
      stdio: "inherit",
      env: process.env
    });
    child.on("error", (error) => resolve({ code: 1, error: error.message }));
    child.on("exit", (code, signal) => resolve({ code: code ?? 1, signal }));
  });
}

async function main() {
  await mkdir(OUT, { recursive: true });

  const startedAt = new Date().toISOString();
  const results = [];
  let failed = false;

  for (const [command, label] of steps) {
    console.log("\n=== FANDOM NETLIFY STEP: " + label + " ===");
    const result = await run(command);
    results.push({ command, label, ...result, completedAt: new Date().toISOString() });

    if (result.code !== 0) {
      failed = true;
      console.warn(
        "\nFandom step failed: " + command +
        ". The existing canonical snapshot will be preserved; Netlify will continue with the last known-good enrichment."
      );
      break;
    }
  }

  let snapshotPresent = false;
  try {
    await access(fileURLToPath(new URL("../data/enrichment/fandom-canonical.json", import.meta.url)));
    snapshotPresent = true;
  } catch {}

  const status = {
    version: 1,
    startedAt,
    completedAt: new Date().toISOString(),
    status: failed ? "degraded" : "ok",
    snapshotPresent,
    failedStep: results.find((result) => result.code !== 0)?.command || null,
    results
  };

  await writeFile(statusFile, JSON.stringify(status, null, 2) + "\n");

  console.log("\nFandom Netlify enrichment status:");
  console.log(JSON.stringify(status, null, 2));

  // Fandom is enrichment, not a runtime/build prerequisite. A transient
  // upstream failure must not take down the Atlas when a prior snapshot exists.
  if (failed && !snapshotPresent) {
    console.error("No Fandom snapshot exists after an enrichment failure.");
    process.exitCode = 0;
    return;
  }
}

main().catch((error) => {
  console.error("Fandom Netlify runner failed unexpectedly:", error);
  process.exitCode = 0;
});
