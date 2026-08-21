import { d1All, d1Execute, d1First, d1Ready } from "./d1.server";

/**
 * Erasing member activity while leaving the members themselves in place.
 *
 * This wipes what the store has done — orders, conversations, and wallet money
 * with its whole paper trail — and deliberately does not touch accounts,
 * identities, or banana balances. It is irreversible, so it names every table
 * it will empty rather than discovering them at runtime, counts before it
 * deletes, and can be asked for the counts alone.
 *
 * Anything not on these lists is left exactly as it is: the catalogue, the
 * banana economy, Telegram links, and every user row.
 */

/** Orders and everything that hangs off an order. */
const ORDER_TABLES = [
  "order_account_batch",
  "order_items_snapshot",
  "order_queue",
  "order_status_history",
  "order_status_history_v2",
  "orders",
] as const;

/** Conversations and their messages. */
const CHAT_TABLES = ["messages", "threads"] as const;

/**
 * Wallet money and its history. `recharge_requests` belongs here: a pending
 * top-up against a balance that no longer exists would credit money nobody
 * asked for the next time an operator approved it.
 */
const WALLET_TABLES = ["wallet_ledger", "wallet_transactions", "recharge_requests"] as const;

export type PurgeScope = "orders" | "chats" | "wallet";

export interface PurgeReport {
  /** Row counts per table, before anything was deleted. */
  counts: Record<string, number>;
  /** Members whose wallet balance was reset, and the total that was cleared. */
  walletsReset: number;
  walletTotalCleared: number;
  /** False when only counting. */
  applied: boolean;
}

function tablesFor(scopes: PurgeScope[]): string[] {
  const tables: string[] = [];
  if (scopes.includes("orders")) tables.push(...ORDER_TABLES);
  if (scopes.includes("chats")) tables.push(...CHAT_TABLES);
  if (scopes.includes("wallet")) tables.push(...WALLET_TABLES);
  return tables;
}

async function countRows(table: string): Promise<number> {
  try {
    const row = await d1First<{ total: number }>(`SELECT COUNT(*) AS total FROM ${table}`);
    return Number(row?.total ?? 0);
  } catch {
    // A table this deployment never created is not an error.
    return 0;
  }
}

/**
 * @param scopes  which kinds of data to remove
 * @param apply   false counts only and changes nothing
 */
export async function purgeMemberActivity(
  scopes: PurgeScope[],
  apply: boolean,
): Promise<PurgeReport> {
  if (!(await d1Ready())) {
    return { counts: {}, walletsReset: 0, walletTotalCleared: 0, applied: false };
  }

  const tables = tablesFor(scopes);
  const counts: Record<string, number> = {};
  for (const table of tables) {
    counts[table] = await countRows(table);
  }

  let walletsReset = 0;
  let walletTotalCleared = 0;
  if (scopes.includes("wallet")) {
    const rows = await d1All<{ total: number; funded: number }>(
      `SELECT COALESCE(SUM(wallet_balance), 0) AS total,
              COUNT(*) AS funded
         FROM users WHERE wallet_balance IS NOT NULL AND wallet_balance <> 0`,
    );
    walletTotalCleared = Number(rows[0]?.total ?? 0);
    walletsReset = Number(rows[0]?.funded ?? 0);
  }

  if (!apply) {
    return { counts, walletsReset, walletTotalCleared, applied: false };
  }

  for (const table of tables) {
    try {
      await d1Execute(`DELETE FROM ${table}`);
    } catch (error) {
      // Keep going: a missing table must not strand the rest half-deleted.
      console.error("[purge] failed to empty", table, error);
    }
  }

  if (scopes.includes("wallet")) {
    // Only the money. banana_balance and banana_locked are left untouched.
    await d1Execute(`UPDATE users SET wallet_balance = 0`);
  }

  return { counts, walletsReset, walletTotalCleared, applied: true };
}
