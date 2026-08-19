/**
 * Canonical game catalogue — the single source of truth for Nintendo Switch 1
 * and Nintendo Switch 2 games.
 *
 * Identity first: every lookup resolves to a permanent `game_id` before any
 * extraction, pricing or trade logic runs. Nothing here calls an AI model.
 */

import { d1All, d1First, d1Run } from "./d1.server";
import { randomId } from "./crypto.server";
import {
  MATCH_ACCEPT_THRESHOLD,
  baseTitleOf,
  detectSignals,
  normalizeTitle,
  rankCandidates,
  slugifyTitle,
  type MatchCandidate,
  type MatchResult,
} from "./gameData/identity";

export interface CatalogGame {
  game_id: string;
  title: string;
  canonical_name?: string | null;
  english_name?: string | null;
  japanese_name?: string | null;
  switch_version?: string | null;
  edition?: string | null;
  region?: string | null;
  base_game_id?: string | null;
  platform?: string | null;
  publisher?: string | null;
  developer?: string | null;
  franchise?: string | null;
  release_date?: string | null;
  genres?: string | null;
  description_ar?: string | null;
  description_en?: string | null;
  cover_url?: string | null;
  box_front_url?: string | null;
  box_back_url?: string | null;
  trailer_url?: string | null;
  official_url?: string | null;
  eshop_url?: string | null;
  nsuid?: string | null;
  title_id?: string | null;
  product_code?: string | null;
  players?: string | null;
  modes?: string | null;
  language_support?: string | null;
  age_rating?: string | null;
  trade_value_iqd?: number | null;
  store_offer_bonus_iqd?: number | null;
  trade_value_locked?: number | null;
  trade_enabled?: number | null;
  trade_value_source?: string | null;
  trade_value_updated_at?: string | null;
  ai_suggested_trade_iqd?: number | null;
  completeness?: number | null;
  is_active?: number | null;
  needs_review?: number | null;
  updated_at?: string | null;
}

const now = () => new Date().toISOString();

/* ------------------------------------------------------------------ */
/* Aliases                                                             */
/* ------------------------------------------------------------------ */

export async function addAlias(
  gameId: string,
  alias: string,
  kind = "user_variant",
  language: string | null = null,
): Promise<void> {
  const normalized = normalizeTitle(alias);
  if (!normalized) return;
  const existing = await d1First<{ game_id: string }>(
    `SELECT game_id FROM game_aliases WHERE normalized = ?`,
    normalized,
  );
  if (existing) return;
  await d1Run(
    `INSERT INTO game_aliases (id, game_id, alias, normalized, kind, language, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    randomId("gal"),
    gameId,
    alias,
    normalized,
    kind,
    language,
    now(),
  );
}

/* ------------------------------------------------------------------ */
/* Matching                                                            */
/* ------------------------------------------------------------------ */

async function candidatesFor(query: string): Promise<MatchCandidate[]> {
  const norm = normalizeTitle(query);
  const words = norm.split(" ").filter((w) => w.length > 1);
  const stopWords = new Set(["the", "and", "for", "with", "edition", "deluxe", "switch", "game"]);
  const significant = words.filter((w) => !stopWords.has(w));
  const keyword = significant[0] ?? words[0] ?? "";
  const like = `%${keyword}%`;

  const games = await d1All<Record<string, unknown>>(
    `SELECT game_id, title, canonical_name, normalized_name, switch_version, edition, region
     FROM game_catalog
     WHERE game_id IS NOT NULL AND (normalized_name LIKE ? OR title LIKE ? OR normalized_name = ?)
     LIMIT 400`,
    like,
    `%${keyword}%`,
    norm,
  );

  const aliases = await d1All<Record<string, unknown>>(
    `SELECT a.game_id, a.alias, a.normalized, g.title, g.canonical_name, g.switch_version, g.edition, g.region
     FROM game_aliases a JOIN game_catalog g ON g.game_id = a.game_id
     WHERE a.normalized LIKE ? OR a.normalized = ? LIMIT 400`,
    like,
    norm,
  );

  const out: MatchCandidate[] = [];
  for (const g of games) {
    out.push({
      game_id: String(g["game_id"]),
      canonical_name: String(g["canonical_name"] ?? g["title"] ?? ""),
      normalized: String(g["normalized_name"] ?? normalizeTitle(String(g["title"] ?? ""))),
      switch_version: (g["switch_version"] as string) ?? null,
      edition: (g["edition"] as string) ?? null,
      region: (g["region"] as string) ?? null,
      alias: null,
    });
  }
  for (const a of aliases) {
    out.push({
      game_id: String(a["game_id"]),
      canonical_name: String(a["canonical_name"] ?? a["title"] ?? ""),
      normalized: String(a["normalized"]),
      switch_version: (a["switch_version"] as string) ?? null,
      edition: (a["edition"] as string) ?? null,
      region: (a["region"] as string) ?? null,
      alias: String(a["alias"]),
    });
  }
  return out;
}

/** Resolves a raw name to a canonical game. Never invents a match. */
export async function matchGame(rawName: string): Promise<MatchResult | null> {
  const ranked = rankCandidates(rawName, await candidatesFor(rawName));
  const best = ranked[0];
  if (!best || best.confidence < MATCH_ACCEPT_THRESHOLD) return null;
  return best;
}

/** Suggestion list for search boxes (no threshold, ranked). */
export async function searchGames(query: string, limit = 12): Promise<MatchResult[]> {
  if (!query.trim()) {
    const rows = await d1All<Record<string, unknown>>(
      `SELECT game_id, title, canonical_name, normalized_name, switch_version, edition, region
       FROM game_catalog WHERE game_id IS NOT NULL ORDER BY updated_at DESC LIMIT ?`,
      limit,
    );
    return rows.map((g) => ({
      game_id: String(g["game_id"]),
      canonical_name: String(g["canonical_name"] ?? g["title"] ?? ""),
      normalized: String(g["normalized_name"] || ""),
      confidence: 1,
      match_type: "canonical" as const,
      matched_alias: null,
      switch_version: (g["switch_version"] as string) ?? null,
      edition: (g["edition"] as string) ?? null,
      region: (g["region"] as string) ?? null,
      alias: null,
    }));
  }
  const ranked = rankCandidates(query, await candidatesFor(query));
  const seen = new Set<string>();
  const unique: MatchResult[] = [];
  for (const r of ranked) {
    if (seen.has(r.game_id)) continue;
    seen.add(r.game_id);
    unique.push(r);
    if (unique.length >= limit) break;
  }
  return unique;
}

export async function getGame(gameId: string): Promise<CatalogGame | undefined> {
  return d1First<CatalogGame>(`SELECT * FROM game_catalog WHERE game_id = ?`, gameId);
}

/* ------------------------------------------------------------------ */
/* Canonical record creation                                           */
/* ------------------------------------------------------------------ */

/**
 * Resolves an existing canonical record or creates a stub for a genuinely new
 * release. Different editions / platforms always get their own record and are
 * linked through `base_game_id`.
 */
export async function ensureCanonicalGame(rawName: string): Promise<{
  game: CatalogGame;
  created: boolean;
  match: MatchResult | null;
}> {
  const match = await matchGame(rawName);
  if (match) {
    const game = await getGame(match.game_id);
    if (game) return { game, created: false, match };
  }

  const signals = detectSignals(rawName);
  const title = rawName.trim();
  const gameId = randomId("gme");
  const baseNorm = baseTitleOf(title);
  const baseRow = baseNorm
    ? await d1First<{ game_id: string }>(
        `SELECT game_id FROM game_catalog WHERE base_normalized = ? AND game_id IS NOT NULL LIMIT 1`,
        baseNorm,
      )
    : undefined;

  await d1Run(
    `INSERT INTO game_catalog
      (title, game_id, canonical_name, english_name, normalized_name, base_normalized, base_game_id,
       slug, switch_version, edition, region, platform, is_active, needs_review, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,1,?,?)
     ON CONFLICT(title) DO UPDATE SET
       game_id = COALESCE(game_catalog.game_id, excluded.game_id),
       normalized_name = excluded.normalized_name,
       base_normalized = excluded.base_normalized,
       updated_at = excluded.updated_at`,
    title,
    gameId,
    title,
    title,
    normalizeTitle(title),
    baseNorm,
    baseRow?.game_id ?? null,
    slugifyTitle(title),
    signals.switchVersion === "unknown" ? null : signals.switchVersion,
    signals.edition,
    signals.region,
    signals.switchVersion === "switch2" ? "switch-2" : "switch",
    now(),
    now(),
  );

  const game = await d1First<CatalogGame>(`SELECT * FROM game_catalog WHERE title = ?`, title);
  if (game?.game_id) await addAlias(game.game_id, title, "official_title");
  return { game: game as CatalogGame, created: true, match: null };
}

/* ------------------------------------------------------------------ */
/* Field persistence with provenance                                   */
/* ------------------------------------------------------------------ */

export const CATALOG_FIELDS = [
  "english_name",
  "japanese_name",
  "switch_version",
  "edition",
  "region",
  "release_date",
  "developer",
  "publisher",
  "franchise",
  "genres",
  "description_en",
  "description_ar",
  "players",
  "modes",
  "language_support",
  "age_rating",
  "official_url",
  "eshop_url",
  "nsuid",
  "title_id",
  "product_code",
  "trailer_url",
  "cover_url",
  "box_front_url",
  "box_back_url",
] as const;

export type CatalogField = (typeof CATALOG_FIELDS)[number];

export interface FieldSave {
  gameId: string;
  jobId?: string | null;
  field: string;
  value: unknown;
  sourceName?: string | null;
  sourceUrl?: string | null;
  confidence?: number | null;
  status: "verified" | "unverified" | "missing" | "conflict" | "rejected";
  attemptedSources?: string[];
  failureReason?: string | null;
  evidence?: string | null;
}

/** Writes the audit row and, when verified, the canonical column itself. */
export async function saveField(save: FieldSave): Promise<void> {
  const stamp = now();
  const serialized =
    save.value === null || save.value === undefined
      ? null
      : typeof save.value === "string"
        ? save.value
        : JSON.stringify(save.value);

  await d1Run(
    `INSERT INTO game_field_audits
      (id, job_id, game_id, field_name, field_value, source_name, source_url, confidence,
       verified, status, attempted_sources, failure_reason, evidence, last_verified)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    randomId("aud"),
    save.jobId ?? null,
    save.gameId,
    save.field,
    serialized,
    save.sourceName ?? null,
    save.sourceUrl ?? null,
    save.confidence == null ? null : String(save.confidence),
    save.status === "verified" ? 1 : 0,
    save.status,
    JSON.stringify(save.attemptedSources ?? []),
    save.failureReason ?? null,
    save.evidence ?? null,
    stamp,
  );

  if (
    save.status === "verified" &&
    serialized !== null &&
    (CATALOG_FIELDS as readonly string[]).includes(save.field)
  ) {
    await d1Run(
      `UPDATE game_catalog SET ${save.field} = ?, updated_at = ? WHERE game_id = ?`,
      serialized,
      stamp,
      save.gameId,
    );
  }
}

/** Fields still worth extracting: empty, previously missing, or stale. */
export async function missingFields(gameId: string, staleDays = 120): Promise<string[]> {
  const game = await getGame(gameId);
  if (!game) return [...CATALOG_FIELDS];
  const audits = await d1All<{ field_name: string; status: string; last_verified: string }>(
    `SELECT field_name, status, last_verified FROM game_field_audits WHERE game_id = ?`,
    gameId,
  );
  const latest = new Map<string, { status: string; at: number }>();
  for (const a of audits) {
    const at = Date.parse(a.last_verified ?? "") || 0;
    const prev = latest.get(a.field_name);
    if (!prev || at > prev.at) latest.set(a.field_name, { status: a.status, at });
  }
  const staleBefore = Date.now() - staleDays * 86_400_000;

  return CATALOG_FIELDS.filter((f) => {
    const value = (game as unknown as Record<string, unknown>)[f];
    const empty = value === null || value === undefined || value === "" || value === "[]";
    if (empty) return true;
    const audit = latest.get(f);
    if (!audit) return true;
    if (audit.status !== "verified") return true;
    return audit.at < staleBefore;
  });
}

export async function recomputeCompleteness(gameId: string): Promise<number> {
  const missing = await missingFields(gameId);
  const score = Math.round(
    ((CATALOG_FIELDS.length - missing.length) / CATALOG_FIELDS.length) * 100,
  );
  await d1Run(
    `UPDATE game_catalog SET completeness = ?, updated_at = ? WHERE game_id = ?`,
    score,
    now(),
    gameId,
  );
  return score;
}

/* ------------------------------------------------------------------ */
/* Images                                                              */
/* ------------------------------------------------------------------ */

export interface ImageCandidate {
  gameId: string;
  kind: string;
  url: string;
  sourceName: string;
  sourceUrl?: string | null;
  region?: string | null;
  platform?: string | null;
  edition?: string | null;
  confidence: number;
  evidence?: string | null;
}

export const IMAGE_ACCEPT = 0.85;
export const IMAGE_REJECT = 0.6;

/**
 * Stores an image candidate with its confidence. Only >= 0.85 may become the
 * primary cover; < 0.60 is rejected outright and never displayed.
 */
export async function saveImageCandidate(
  c: ImageCandidate,
): Promise<"primary" | "secondary" | "rejected"> {
  const verdict =
    c.confidence >= IMAGE_ACCEPT
      ? "primary"
      : c.confidence >= IMAGE_REJECT
        ? "secondary"
        : "rejected";
  const stamp = now();
  await d1Run(
    `INSERT INTO game_images
      (id, game_id, kind, url, source_name, source_url, region, platform, edition,
       confidence, verified, is_primary, evidence, created_at, verified_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    randomId("img"),
    c.gameId,
    c.kind,
    c.url,
    c.sourceName,
    c.sourceUrl ?? null,
    c.region ?? null,
    c.platform ?? null,
    c.edition ?? null,
    c.confidence,
    verdict === "primary" ? 1 : 0,
    verdict === "primary" ? 1 : 0,
    c.evidence ?? null,
    stamp,
    verdict === "primary" ? stamp : null,
  );

  if (verdict === "primary") {
    const column =
      c.kind === "box_back"
        ? "box_back_url"
        : c.kind === "box_front"
          ? "box_front_url"
          : "cover_url";
    await d1Run(
      `UPDATE game_catalog SET ${column} = ?, updated_at = ? WHERE game_id = ? AND (${column} IS NULL OR ${column} = '')`,
      c.url,
      stamp,
      c.gameId,
    );
  }
  return verdict;
}

/**
 * Deterministic image validation: the candidate must agree with the canonical
 * game on title, platform, edition and region, and come from a known registry.
 */
export function scoreImageCandidate(
  game: CatalogGame,
  candidate: {
    url: string;
    title?: string | null;
    platform?: string | null;
    edition?: string | null;
    region?: string | null;
    sourceName: string;
    kind: string;
  },
): { confidence: number; reasons: string[] } {
  const reasons: string[] = [];
  const trusted: Record<string, number> = {
    nintendo: 0.95,
    publisher: 0.92,
    gametdb: 0.9,
    julio: 0.92,
    "the cover project": 0.85,
    mobygames: 0.8,
    igdb: 0.78,
    rawg: 0.7,
    "archive.org": 0.65,
  };
  let confidence = trusted[candidate.sourceName.toLowerCase()] ?? 0.5;
  reasons.push(`source:${candidate.sourceName}`);

  const wantTitle = normalizeTitle(String(game.canonical_name ?? game.title ?? ""));
  if (candidate.title) {
    const sim = normalizeTitle(candidate.title) === wantTitle ? 1 : 0;
    if (!sim) {
      confidence -= 0.35;
      reasons.push("title-mismatch");
    } else reasons.push("title-match");
  }

  if (game.switch_version && candidate.platform && candidate.platform !== game.switch_version) {
    confidence -= 0.4;
    reasons.push("platform-mismatch");
  }
  const gameEdition = game.edition ?? null;
  if ((gameEdition ?? null) !== (candidate.edition ?? null)) {
    confidence -= 0.35;
    reasons.push("edition-mismatch");
  }
  if (game.region && candidate.region && game.region !== candidate.region) {
    confidence -= 0.1;
    reasons.push("region-mismatch");
  }
  if (!/^https?:\/\//i.test(candidate.url)) {
    confidence = 0;
    reasons.push("invalid-url");
  }
  if (/fan|deviantart|pinterest|ai-generated/i.test(candidate.url)) {
    confidence = 0;
    reasons.push("untrusted-artwork");
  }

  return { confidence: Math.max(0, Math.min(1, confidence)), reasons };
}

/* ------------------------------------------------------------------ */
/* Trade pricing                                                       */
/* ------------------------------------------------------------------ */

export async function setTradeValue(
  gameId: string,
  valueIqd: number,
  source: string,
  actor: string,
  bonusIqd?: number,
  options?: { locked?: boolean; tradeEnabled?: boolean },
): Promise<void> {
  const stamp = now();
  const before = await getGame(gameId);
  const newBase = Math.max(0, Math.round(valueIqd));
  const newBonus =
    bonusIqd !== undefined
      ? Math.max(0, Math.round(bonusIqd))
      : (before?.store_offer_bonus_iqd ?? 0);
  const locked =
    options?.locked !== undefined
      ? options.locked
        ? 1
        : 0
      : source.startsWith("admin")
        ? 1
        : (before?.trade_value_locked ?? 0);
  const tradeEnabled =
    options?.tradeEnabled !== undefined
      ? options.tradeEnabled
        ? 1
        : 0
      : (before?.trade_enabled ?? 1);

  await d1Run(
    `UPDATE game_catalog SET
       trade_value_iqd = ?,
       store_offer_bonus_iqd = ?,
       trade_value_locked = ?,
       trade_enabled = ?,
       trade_value_source = ?,
       trade_value_updated_at = ?,
       updated_at = ?
     WHERE game_id = ?`,
    newBase,
    newBonus,
    locked,
    tradeEnabled,
    source,
    stamp,
    stamp,
    gameId,
  );
  await d1Run(
    `INSERT INTO game_price_history (id, game_id, old_value_iqd, new_value_iqd, old_store_bonus_iqd, new_store_bonus_iqd, source, actor, created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    randomId("gph"),
    gameId,
    before?.trade_value_iqd ?? null,
    newBase,
    before?.store_offer_bonus_iqd ?? 0,
    newBonus,
    source,
    actor,
    stamp,
  );
}

/** AI may only ever suggest — never write the approved value. */
export async function setAiSuggestedTradeValue(gameId: string, valueIqd: number): Promise<void> {
  await d1Run(
    `UPDATE game_catalog SET ai_suggested_trade_iqd = ?, updated_at = ? WHERE game_id = ?`,
    Math.max(0, Math.round(valueIqd)),
    now(),
    gameId,
  );
}

/* ------------------------------------------------------------------ */
/* Trade rules                                                         */
/* ------------------------------------------------------------------ */

export const DEFAULT_TRADE_RULES: {
  category: string;
  key: string;
  label_ar: string;
  label_en: string;
  percent: number;
  sort_order: number;
}[] = [
  {
    category: "box_presence",
    key: "with_box",
    label_ar: "مع العلبة الأصلية",
    label_en: "With box",
    percent: 10,
    sort_order: 1,
  },
  {
    category: "box_presence",
    key: "no_box",
    label_ar: "بدون علبة",
    label_en: "No box",
    percent: -15,
    sort_order: 2,
  },
  {
    category: "box_condition",
    key: "box_like_new",
    label_ar: "علبة كالجديدة",
    label_en: "Box like new",
    percent: 5,
    sort_order: 1,
  },
  {
    category: "box_condition",
    key: "box_good",
    label_ar: "علبة جيدة",
    label_en: "Box good",
    percent: 0,
    sort_order: 2,
  },
  {
    category: "box_condition",
    key: "box_damaged",
    label_ar: "علبة متضررة",
    label_en: "Box damaged",
    percent: -8,
    sort_order: 3,
  },
  {
    category: "cartridge_condition",
    key: "cart_like_new",
    label_ar: "شريحة كالجديدة",
    label_en: "Cartridge like new",
    percent: 5,
    sort_order: 1,
  },
  {
    category: "cartridge_condition",
    key: "cart_good",
    label_ar: "شريحة جيدة",
    label_en: "Cartridge good",
    percent: 0,
    sort_order: 2,
  },
  {
    category: "cartridge_condition",
    key: "cart_scratched",
    label_ar: "شريحة بها خدوش",
    label_en: "Cartridge scratched",
    percent: -12,
    sort_order: 3,
  },
  {
    category: "extras",
    key: "with_extras",
    label_ar: "مع الملحقات والكتيب",
    label_en: "With extras",
    percent: 5,
    sort_order: 1,
  },
  {
    category: "extras",
    key: "no_extras",
    label_ar: "بدون ملحقات",
    label_en: "No extras",
    percent: 0,
    sort_order: 2,
  },
  {
    category: "cleanliness",
    key: "clean",
    label_ar: "نظيفة جداً",
    label_en: "Very clean",
    percent: 3,
    sort_order: 1,
  },
  {
    category: "cleanliness",
    key: "dirty",
    label_ar: "تحتاج تنظيف",
    label_en: "Needs cleaning",
    percent: -5,
    sort_order: 2,
  },
  {
    category: "region",
    key: "us",
    label_ar: "أمريكي (US)",
    label_en: "US",
    percent: 0,
    sort_order: 1,
  },
  {
    category: "region",
    key: "eu",
    label_ar: "أوروبي (EU)",
    label_en: "EU",
    percent: -5,
    sort_order: 2,
  },
  {
    category: "region",
    key: "jp",
    label_ar: "ياباني (JP)",
    label_en: "JP",
    percent: -25,
    sort_order: 3,
  },
  {
    category: "region",
    key: "asia",
    label_ar: "آسيوي",
    label_en: "Asia",
    percent: -20,
    sort_order: 4,
  },
  {
    category: "payout_method",
    key: "store_credit",
    label_ar: "رصيد في المحفظة",
    label_en: "Store credit",
    percent: 10,
    sort_order: 1,
  },
  {
    category: "payout_method",
    key: "cash",
    label_ar: "نقداً",
    label_en: "Cash",
    percent: 0,
    sort_order: 2,
  },
];

export async function listTradeRules() {
  const rows = await d1All(`SELECT * FROM trade_rules ORDER BY category, sort_order`);
  if (rows.length) return rows;
  const stamp = now();
  for (const r of DEFAULT_TRADE_RULES) {
    await d1Run(
      `INSERT INTO trade_rules (id, category, key, label_ar, label_en, percent, sort_order, active, created_at)
       VALUES (?,?,?,?,?,?,?,1,?)`,
      randomId("trl"),
      r.category,
      r.key,
      r.label_ar,
      r.label_en,
      r.percent,
      r.sort_order,
      stamp,
    );
  }
  return d1All(`SELECT * FROM trade_rules ORDER BY category, sort_order`);
}

/* ------------------------------------------------------------------ */
/* Legacy backfill                                                     */
/* ------------------------------------------------------------------ */

let backfilled = false;

/**
 * Older rows were keyed only by `title`. Gives each one a stable `game_id`,
 * normalized keys and an official-title alias so matching works everywhere.
 * Runs at most once per worker instance.
 */
export async function backfillCanonicalIds(): Promise<number> {
  if (backfilled) return 0;
  backfilled = true;
  const rows = await d1All<{ title: string }>(
    `SELECT title FROM game_catalog WHERE game_id IS NULL OR game_id = '' LIMIT 2000`,
  );
  let done = 0;
  for (const row of rows) {
    const rawTitle = String(row.title ?? "");
    const title = rawTitle.trim();
    if (!title) continue;
    const signals = detectSignals(title);
    const gameId = randomId("gme");
    await d1Run(
      `UPDATE game_catalog SET
         game_id = ?, canonical_name = COALESCE(canonical_name, ?), english_name = COALESCE(english_name, ?),
         normalized_name = ?, base_normalized = ?, slug = COALESCE(slug, ?),
         switch_version = COALESCE(switch_version, ?), edition = COALESCE(edition, ?), region = COALESCE(region, ?),
         is_active = COALESCE(is_active, 1), updated_at = ?
       WHERE title = ? AND (game_id IS NULL OR game_id = '')`,
      gameId,
      title,
      title,
      normalizeTitle(title),
      baseTitleOf(title),
      slugifyTitle(title),
      signals.switchVersion === "unknown" ? null : signals.switchVersion,
      signals.edition,
      signals.region,
      now(),
      rawTitle,
    );
    try {
      await addAlias(gameId, title, "official_title");
    } catch {
      /* alias already claimed by another record */
    }
    done++;
  }
  return done;
}
