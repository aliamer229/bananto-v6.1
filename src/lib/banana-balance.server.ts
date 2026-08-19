/**
 * Banana Balance & Transaction Engine.
 *
 * Single source of truth for banana balance management.
 * Canonical storage is `users.banana_balance` and `users.banana_locked`.
 * All modifications are logged to `banana_transactions` with optional idempotency keys.
 */

import { d1First, d1Run, d1BatchRun, d1Ready } from "./d1.server";

export interface BananaBalanceResult {
  balance: number;
  locked: number;
}

/**
 * Get user's current banana balance & locked balance from users table (canonical).
 */
export async function getUserBananaBalance(userId: string): Promise<BananaBalanceResult> {
  if (!userId) return { balance: 0, locked: 0 };
  if (!(await d1Ready())) {
    return { balance: 0, locked: 0 };
  }

  const row = await d1First<{ banana_balance: number; banana_locked: number }>(
    `SELECT banana_balance, banana_locked FROM users WHERE id = ? LIMIT 1`,
    userId,
  );

  return {
    balance: Number(row?.banana_balance ?? 0),
    locked: Number(row?.banana_locked ?? 0),
  };
}

/**
 * Credit bananas to a user with transaction logging and idempotency check.
 */
export async function creditBananaBalance(
  userId: string,
  amount: number,
  options: {
    reason: string;
    kind?: "grant" | "trade" | "reward" | "refund" | "admin";
    meta?: Record<string, unknown>;
    idempotencyKey?: string;
  },
): Promise<{ success: boolean; newBalance: number }> {
  if (amount <= 0 || !userId) {
    const current = await getUserBananaBalance(userId);
    return { success: false, newBalance: current.balance };
  }

  if (!(await d1Ready())) {
    return { success: true, newBalance: amount };
  }

  const now = new Date().toISOString();
  const txId =
    options.idempotencyKey || `tx_b_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const kind = options.kind || "grant";
  const metaJson = JSON.stringify({ reason: options.reason, ...options.meta });

  // Check idempotency if key provided
  if (options.idempotencyKey) {
    const existing = await d1First<{ id: string }>(
      `SELECT id FROM banana_transactions WHERE id = ? LIMIT 1`,
      options.idempotencyKey,
    );
    if (existing) {
      const current = await getUserBananaBalance(userId);
      return { success: true, newBalance: current.balance };
    }
  }

  await d1BatchRun([
    // 1. Canonical update in users table
    {
      sql: `UPDATE users SET banana_balance = banana_balance + ? WHERE id = ?`,
      binds: [amount, userId],
    },
    // 2. Keep banana_wallets in sync for backwards compatibility
    {
      sql: `UPDATE banana_wallets SET balance = balance + ?, updated_at = ? WHERE user_id = ?`,
      binds: [amount, now, userId],
    },
    // 3. Ledger record in banana_transactions
    {
      sql: `INSERT INTO banana_transactions (id, user_id, kind, amount, meta, created_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
      binds: [txId, userId, kind, amount, metaJson, now],
    },
  ]);

  const current = await getUserBananaBalance(userId);
  return { success: true, newBalance: current.balance };
}

/**
 * Debit bananas from a user if balance is sufficient.
 */
export async function debitBananaBalance(
  userId: string,
  amount: number,
  options: {
    reason: string;
    kind?: "spend" | "listing_fee" | "penalty" | "trade";
    meta?: Record<string, unknown>;
    idempotencyKey?: string;
  },
): Promise<{ success: boolean; newBalance: number; error?: string }> {
  if (amount <= 0 || !userId) {
    const current = await getUserBananaBalance(userId);
    return { success: false, newBalance: current.balance, error: "invalid_amount" };
  }

  if (!(await d1Ready())) {
    return { success: true, newBalance: 0 };
  }

  const current = await getUserBananaBalance(userId);
  if (current.balance < amount) {
    return { success: false, newBalance: current.balance, error: "insufficient_balance" };
  }

  const now = new Date().toISOString();
  const txId =
    options.idempotencyKey || `tx_b_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const kind = options.kind || "spend";
  const metaJson = JSON.stringify({ reason: options.reason, ...options.meta });

  await d1BatchRun([
    // 1. Canonical update in users table
    {
      sql: `UPDATE users SET banana_balance = CASE WHEN banana_balance >= ? THEN banana_balance - ? ELSE NULL END WHERE id = ?`,
      binds: [amount, amount, userId],
    },
    // 2. Keep banana_wallets in sync
    {
      sql: `UPDATE banana_wallets SET balance = MAX(0, balance - ?), updated_at = ? WHERE user_id = ?`,
      binds: [amount, now, userId],
    },
    // 3. Ledger record
    {
      sql: `INSERT INTO banana_transactions (id, user_id, kind, amount, meta, created_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
      binds: [txId, userId, kind, -amount, metaJson, now],
    },
  ]);

  const updated = await getUserBananaBalance(userId);
  return { success: true, newBalance: updated.balance };
}
