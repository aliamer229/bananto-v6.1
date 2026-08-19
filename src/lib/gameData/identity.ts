export function normalizeTitle(title: string): string {
  if (!title) return "";
  return title
    .toLowerCase()
    .replace(/[™®©]/g, "")
    .replace(/&/g, " and ")
    .replace(/['’"`]/g, "")
    .replace(/[:.\-_—–]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function slugifyTitle(title: string): string {
  return normalizeTitle(title).replace(/\s+/g, "-");
}

export function normalizeName(name: string): string {
  if (!name) return "";
  return name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

export function matchTitles(t1: string, t2: string): boolean {
  if (!t1 || !t2) return false;
  return normalizeName(t1) === normalizeName(t2);
}

export function baseTitleOf(title: string): string {
  const norm = normalizeTitle(title);
  // Remove common edition/version suffixes
  return norm
    .replace(
      /\s(edition|deluxe|complete|ultimate|remastered|remake|dlc|pack|bundle|collection|digital|physical)\b.*/g,
      "",
    )
    .trim();
}

export interface MatchCandidate {
  game_id: string;
  canonical_name: string;
  normalized: string;
  switch_version: string | null;
  edition: string | null;
  region: string | null;
  alias: string | null;
}

export interface MatchResult extends MatchCandidate {
  confidence: number;
  match_type: "canonical" | "alias";
  matched_alias: string | null;
}

export const MATCH_ACCEPT_THRESHOLD = 0.85;

export function detectSignals(title: string) {
  const norm = title.toLowerCase();
  return {
    switchVersion: norm.includes("switch 2") || norm.includes("switch2") ? "switch2" : "switch1",
    edition: norm.match(/\b(deluxe|gold|ultimate|complete|remastered|remake)\b/)?.[0] || null,
    region: norm.match(/\b(usa|eur|jpn|pal|ntsc|middle east|mde)\b/)?.[0]?.toUpperCase() || null,
  };
}

export function rankCandidates(query: string, candidates: MatchCandidate[]): MatchResult[] {
  const normQuery = normalizeTitle(query);
  const cleanQuery = normalizeName(query);
  const qSignals = detectSignals(query);
  const qBase = normalizeName(baseTitleOf(query));

  return candidates
    .map((c) => {
      let confidence = 0;
      const cNorm = normalizeTitle(c.normalized || c.canonical_name);
      const cClean = normalizeName(c.normalized || c.canonical_name);
      const cSignals = detectSignals(c.canonical_name || c.normalized);
      const cBase = normalizeName(baseTitleOf(c.canonical_name || c.normalized));

      // Hard penalty for switch version mismatch
      if (
        qSignals.switchVersion &&
        cSignals.switchVersion &&
        qSignals.switchVersion !== cSignals.switchVersion
      ) {
        return {
          ...c,
          confidence: 0,
          match_type: c.alias ? "alias" : "canonical",
          matched_alias: c.alias,
        } as MatchResult;
      }

      if (cNorm === normQuery || cClean === cleanQuery) {
        confidence = 1.0;
      } else if (cBase && qBase && cBase === qBase && cSignals.edition === qSignals.edition) {
        confidence = 0.95;
      } else if (cNorm.length > 0 && normQuery.length > 0) {
        const qWords = new Set(normQuery.split(" ").filter((w) => w.length > 1));
        const cWords = new Set(cNorm.split(" ").filter((w) => w.length > 1));
        const intersection = [...qWords].filter((x) => cWords.has(x));
        const union = new Set([...qWords, ...cWords]);
        const jaccard = union.size > 0 ? intersection.length / union.size : 0;

        if (jaccard >= 0.9) {
          confidence = 0.9;
        } else if (jaccard >= 0.75) {
          confidence = 0.8;
        } else if (cNorm.includes(normQuery) || normQuery.includes(cNorm)) {
          confidence = 0.75;
        } else {
          confidence = Math.max(0, jaccard * 0.7);
        }
      }

      return {
        ...c,
        confidence,
        match_type: c.alias ? "alias" : "canonical",
        matched_alias: c.alias,
      } as MatchResult;
    })
    .sort((a, b) => b.confidence - a.confidence);
}
