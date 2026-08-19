import fs from "fs";
import path from "path";
import bundledTradePrices from "../../data/nintendo-switch-trade-prices-iraq.json";
import { d1All, d1First, d1Run, ensureSchema } from "./d1.server";
import {
  ensureCanonicalGame,
  getGame,
  matchGame,
  addAlias,
  setTradeValue,
  CatalogGame,
} from "./game-catalog.server";
import { normalizeTitle } from "./gameData/identity";

export interface TradeJsonEntry {
  name?: string;
  game_title?: string;
  title?: string;
  trade_price_iqd?: number;
  base_trade_value_iqd?: number;
  store_offer_bonus_iqd?: number;
  store_offer_total_iqd?: number;
  edition?: string;
  category?: string;
  switch_version?: string;
  notes?: string;
  [key: string]: unknown;
}

export interface ImportResult {
  success: boolean;
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  nextOffset: number;
  totalProcessed: number;
  matchedExisting: number;
  createdNew: number;
  updatedPrices: number;
  skippedLocked: number;
  errors: string[];
  items: Array<{
    game_id: string;
    title: string;
    base_iqd: number;
    bonus_iqd: number;
    total_iqd: number;
    action: "updated" | "created" | "skipped_locked";
  }>;
}

/**
 * Loads and parses the Nintendo Switch trade pricing JSON.
 *
 * The dataset is bundled at build time so the Worker runtime (which has no real
 * filesystem) can read it. A `customPath` still reads from disk for scripts.
 */
export function loadTradePricesJson(customPath?: string): TradeJsonEntry[] {
  let parsed: unknown = bundledTradePrices;

  if (customPath) {
    const targetPath = path.isAbsolute(customPath)
      ? customPath
      : path.join(process.cwd(), customPath);
    if (!fs.existsSync(targetPath)) {
      throw new Error(`Nintendo switch trade prices file not found at: ${targetPath}`);
    }
    parsed = JSON.parse(fs.readFileSync(targetPath, "utf-8"));
  }

  if (Array.isArray(parsed)) return parsed as TradeJsonEntry[];
  const obj = parsed as { games?: unknown; items?: unknown } | null;
  if (obj && Array.isArray(obj.games)) return obj.games as TradeJsonEntry[];
  if (obj && Array.isArray(obj.items)) return obj.items as TradeJsonEntry[];
  throw new Error("Invalid trade prices JSON format: expected an array of games");
}

/**
 * Imports trade catalog prices into D1 database idempotently.
 * Uses game_id and canonical matching, never creates duplicate entries.
 * Supports batching (offset & limit) so requests complete smoothly within Cloudflare Workers execution limits.
 */
export async function importNintendoTradeCatalog(options?: {
  customPath?: string;
  overwriteLocked?: boolean;
  actor?: string;
  offset?: number;
  limit?: number;
}): Promise<ImportResult> {
  await ensureSchema();

  const allEntries = loadTradePricesJson(options?.customPath);
  const total = allEntries.length;
  const offset = Math.max(0, Number(options?.offset) || 0);
  const limit = options?.limit !== undefined ? Math.max(1, Number(options.limit)) : total;
  const entries = allEntries.slice(offset, offset + limit);
  const hasMore = offset + entries.length < total;
  const nextOffset = offset + entries.length;

  const actor = options?.actor || "trade_catalog_import";
  const overwriteLocked = options?.overwriteLocked ?? false;

  const result: ImportResult = {
    success: true,
    total,
    offset,
    limit,
    hasMore,
    nextOffset,
    totalProcessed: 0,
    matchedExisting: 0,
    createdNew: 0,
    updatedPrices: 0,
    skippedLocked: 0,
    errors: [],
    items: [],
  };

  for (let idx = 0; idx < entries.length; idx++) {
    const entry = entries[idx];
    const absoluteIndex = offset + idx + 1;
    result.totalProcessed++;
    const title = (entry.game_title || entry.name || entry.title || "").trim();
    if (!title) {
      result.errors.push(`Row ${absoluteIndex}: Missing title`);
      continue;
    }

    const baseIqd = Math.max(
      0,
      Math.round(Number(entry.trade_price_iqd ?? entry.base_trade_value_iqd) || 0),
    );
    const bonusIqd = Math.max(0, Math.round(Number(entry.store_offer_bonus_iqd) || 0));
    const totalIqd = baseIqd + bonusIqd;

    try {
      // 1. Try to match against existing canonical records
      let matchedGame: CatalogGame | undefined;
      const match = await matchGame(title);

      if (match) {
        matchedGame = await getGame(match.game_id);
      }

      let gameId: string;
      let action: "updated" | "created" | "skipped_locked" = "updated";

      if (matchedGame) {
        gameId = matchedGame.game_id;
        result.matchedExisting++;

        // Check if locked by manual admin override
        if (matchedGame.trade_value_locked && !overwriteLocked) {
          result.skippedLocked++;
          action = "skipped_locked";
        } else {
          await setTradeValue(gameId, baseIqd, "official_nintendo_iraq_sheet", actor, bonusIqd, {
            locked: false,
            tradeEnabled: true,
          });
          result.updatedPrices++;
        }
      } else {
        // 2. Not matched: Create new canonical game record
        const ensured = await ensureCanonicalGame(title);
        gameId = ensured.game.game_id;
        if (ensured.created) {
          result.createdNew++;
        } else {
          result.matchedExisting++;
        }

        await setTradeValue(gameId, baseIqd, "official_nintendo_iraq_sheet", actor, bonusIqd, {
          locked: false,
          tradeEnabled: true,
        });
        result.updatedPrices++;
      }

      // Add alias if title differs from canonical title
      await addAlias(gameId, title, "import_sheet_title");

      result.items.push({
        game_id: gameId,
        title,
        base_iqd: baseIqd,
        bonus_iqd: bonusIqd,
        total_iqd: totalIqd,
        action,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`Error importing "${title}": ${msg}`);
    }
  }

  return result;
}

/**
 * Resolves trade-in pricing for a game from D1 database by game_id or title.
 */
export async function getGameTradePricing(gameIdentifier: {
  game_id?: string;
  title?: string;
}): Promise<{
  game_id: string;
  title: string;
  base_iqd: number;
  store_offer_bonus_iqd: number;
  store_offer_total_iqd: number;
  trade_enabled: boolean;
  source: string | null;
  updated_at: string | null;
} | null> {
  await ensureSchema();

  let game: CatalogGame | undefined;

  if (gameIdentifier.game_id) {
    game = await getGame(gameIdentifier.game_id);
  }

  if (!game && gameIdentifier.title) {
    const match = await matchGame(gameIdentifier.title);
    if (match) {
      game = await getGame(match.game_id);
    }
    if (!game) {
      const norm = normalizeTitle(gameIdentifier.title);
      game = await d1First<CatalogGame>(
        `SELECT * FROM game_catalog WHERE normalized_name = ? OR title = ? LIMIT 1`,
        norm,
        gameIdentifier.title,
      );
    }
  }

  if (!game) return null;

  const baseIqd = Number(game.trade_value_iqd) || 0;
  const bonusIqd = Number(game.store_offer_bonus_iqd) || 0;
  const tradeEnabled = game.trade_enabled !== 0;

  return {
    game_id: game.game_id,
    title: game.canonical_name || game.title,
    base_iqd: baseIqd,
    store_offer_bonus_iqd: bonusIqd,
    store_offer_total_iqd: baseIqd + bonusIqd,
    trade_enabled: tradeEnabled,
    source: game.trade_value_source ?? null,
    updated_at: game.trade_value_updated_at ?? game.updated_at ?? null,
  };
}
