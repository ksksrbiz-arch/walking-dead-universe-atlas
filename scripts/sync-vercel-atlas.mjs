#!/usr/bin/env node
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { put } from "@vercel/blob";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "data");
const MEDIA_DIR = path.join(ROOT, "public", "media-cache");
const DATA_ALLOW = new Set([
  "characters.json","locations.json","episodes.json","series.json","seasons.json",
  "communities.json","factions.json","connections.json","characterEpisodes.json",
  "locationEpisodes.json","connectionEpisodes.json","chronology.json","search-index.json"
]);

async function uploadFile(filePath, pathname, contentType, access) {
  const body = await readFile(filePath);
  const result = await put(pathname, body, { access, contentType, addRandomSuffix: false });
  console.log(result.url);
}

async function main() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error("BLOB_READ_WRITE_TOKEN is required");
  const dataFiles = (await readdir(DATA_DIR)).filter(name => DATA_ALLOW.has(name));
  for (const name of dataFiles) await uploadFile(path.join(DATA_DIR, name), "twdu-atlas-data/" + name, "application/json", "private");

  let mediaFiles = [];
  try { mediaFiles = await readdir(MEDIA_DIR); } catch {}
  for (const name of mediaFiles) {
    const ext = path.extname(name).toLowerCase();
    const type = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : ext === ".avif" ? "image/avif" : "image/jpeg";
    await uploadFile(path.join(MEDIA_DIR, name), "twdu-atlas-media/" + name, type, "public");
  }
  console.log(JSON.stringify({ ok:true, dataFiles:dataFiles.length, mediaFiles:mediaFiles.length }));
}

main().catch(error => { console.error(error); process.exit(1); });
