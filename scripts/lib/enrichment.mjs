import { createHash } from "node:crypto";

export function normalizeName(value = "") {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[’'"]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function slugify(value = "") {
  return normalizeName(value).replace(/\s+/g, "-");
}

export function sha256(value) {
  return createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(value))
    .digest("hex");
}

export function sourceRecord({ sourceId, sourceRecordId, entityType, name, sourceUrl, fields = {}, raw = null }) {
  const retrievedAt = new Date().toISOString();
  return {
    sourceId,
    sourceRecordId: String(sourceRecordId),
    entityType,
    name: name ?? null,
    sourceUrl: sourceUrl ?? null,
    fields,
    raw,
    rawHash: sha256(raw ?? fields),
    retrievedAt
  };
}

export function matchCanonical(candidate, canonical, fields = ["name"]) {
  const candidateName = normalizeName(candidate.name);
  if (!candidateName) return { status: "unmatched", score: 0, reasons: ["missing-name"] };

  const aliases = Array.isArray(candidate.aliases) ? candidate.aliases : [];
  const keys = new Set([candidateName, ...aliases.map(normalizeName).filter(Boolean)]);

  for (const field of fields) {
    const value = canonical[field];
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      if (keys.has(normalizeName(item))) {
        return { status: "matched", score: 0.98, canonicalId: canonical.id, reasons: ["exact-" + field] };
      }
    }
  }

  if (slugify(candidate.name) && slugify(candidate.name) === slugify(canonical.name)) {
    return { status: "matched", score: 0.95, canonicalId: canonical.id, reasons: ["normalized-slug"] };
  }

  return { status: "unmatched", score: 0, reasons: ["no-exact-match"] };
}

export function summarizeMatches(candidates, canonicals, fields = ["name"]) {
  return candidates.map((candidate) => {
    let best = { status: "unmatched", score: 0, reasons: [] };
    for (const canonical of canonicals) {
      const match = matchCanonical(candidate, canonical, fields);
      if (match.score > best.score) best = match;
    }
    return { candidate, match: best };
  });
}
