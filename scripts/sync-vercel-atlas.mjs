#!/usr/bin/env node
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { put } from "@vercel/blob";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "data");
const MEDIA_DIR = path.join(ROOT, "public", "media-cache");
const DATA_ALLOW = new Set([
  "characters.json", "locations.json", "episodes.json", "series.json", "seasons.json",
  "communities.json", "factions.json", "connections.json", "characterEpisodes.json",
  "locationEpisodes.json", "connectionEpisodes.json", "chronology.json", "search-index.json"
]);
const MIME = new Map([
  [".png", "image/png"], [".jpg", "image/jpeg"], [".jpeg", "image/jpeg"],
  [".webp", "image/webp"], [".avif", "image/avif"], [".gif", "image/gif"],
  [".svg", "image/svg+xml"], [".json", "application/json"]
]);

async function walkFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walkFiles(fullPath));
    else if (entry.isFile()) files.push(fullPath);
  }
  return files;
}

async function uploadFile(filePath, pathname, contentType, access) {
  const body = await readFile(filePath);
  const result = await put(pathname, body, {
    access, contentType, addRandomSuffix: false,
    allowOverwrite: true,
  });
  return { pathname, size: body.byteLength, url: result.url };
}

async function main() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error("BLOB_READ_WRITE_TOKEN is required");

  const dataFiles = (await readdir(DATA_DIR, { withFileTypes: true }))
    .filter(entry => entry.isFile() && DATA_ALLOW.has(entry.name))
    .map(entry => entry.name)
    .sort();

  const required = ["characters.json", "locations.json", "episodes.json", "series.json", "chronology.json", "search-index.json"];
  const missing = required.filter(name => !dataFiles.includes(name));
  if (missing.length) throw new Error("Required atlas data missing from data/: " + missing.join(", "));

  const uploadedData = [];
  for (const name of dataFiles) {
    uploadedData.push(await uploadFile(
      path.join(DATA_DIR, name),
      "twdu-atlas-data/" + name,
      "application/json",
      "private"
    ));
  }

  let mediaPaths = [];
  try { mediaPaths = await walkFiles(MEDIA_DIR); }
  catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const uploadedMedia = [];
  for (const filePath of mediaPaths.sort()) {
    const relative = path.relative(MEDIA_DIR, filePath).split(path.sep).join("/");
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME.get(ext);
    if (!contentType) continue;
    const info = await stat(filePath);
    if (!info.isFile() || info.size === 0) continue;
    uploadedMedia.push(await uploadFile(
      filePath,
      "twdu-atlas-media/" + relative,
      contentType,
      "public"
    ));
  }

  console.log(JSON.stringify({
    ok: true,
    dataFiles: uploadedData.length,
    dataBytes: uploadedData.reduce((sum, item) => sum + item.size, 0),
    mediaFiles: uploadedMedia.length,
    mediaBytes: uploadedMedia.reduce((sum, item) => sum + item.size, 0),
    skippedUnsupportedMedia: mediaPaths.length - uploadedMedia.length
  }, null, 2));
}

main().catch(error => {
  console.error("Vercel Blob sync failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
