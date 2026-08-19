import { d1All, d1Batch, d1Execute, d1First, d1Ready, d1RunChanges, getD1 } from "@/lib/d1.server";
import { findUserById } from "@/lib/db.server";
import { fetchBinancePayTransactions } from "./client.server";
import {
  ALLOWED_BINANCE_PAY_ORDER_TYPES,
  getBinanceConfig,
  getPublicBinanceConfig,
} from "./config.server";
import { generateSecureId, hashString, maskTransactionId } from "./crypto.server";
import { formatAtomicToUsdt, parseUsdtToAtomic } from "./decimal";
import type {
  BinanceTopUpIntent,
  BinanceTopUpRecord,
  BinanceVerificationLog,
  BinanceVerifyErrorCode,
} from "./types";

const COOLDOWN_SECONDS_BY_ATTEMPT = [0, 15, 30, 60, 120];

export function getCooldownMs(attempts: number): number {
  const index = Math.min(Math.max(0, attempts), COOLDOWN_SECONDS_BY_ATTEMPT.length - 1);
  return (COOLDOWN_SECONDS_BY_ATTEMPT[index] ?? 0) * 1000;
}

let binanceSchemaBootstrapped = false;

/**
 * Ensures Binance Pay tables and unique constraints exist in D1.
 */
export async function ensureBinanceSchema(): Promise<void> {
  if (binanceSchemaBootstrapped) return;
  const db = getD1();
  if (!db) return;

  try {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS binance_topup_intents (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expected_amount_atomic INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USDT',
      status TEXT NOT NULL CHECK (
        status IN ('pending', 'verifying', 'credited', 'expired', 'cancelled', 'failed')
      ),
      bound_transaction_id TEXT UNIQUE,
      verify_attempts INTEGER NOT NULL DEFAULT 0,
      last_verify_at INTEGER,
      verify_started_at INTEGER,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      credited_at INTEGER
    )`,
      )
      .run();

    await db
      .prepare(
        `CREATE INDEX IF NOT EXISTS idx_binance_intent_user ON binance_topup_intents(user_id)`,
      )
      .run();
    await db
      .prepare(
        `CREATE INDEX IF NOT EXISTS idx_binance_intent_status ON binance_topup_intents(status)`,
      )
      .run();
    await db
      .prepare(
        `CREATE INDEX IF NOT EXISTS idx_binance_intent_expiry ON binance_topup_intents(expires_at)`,
      )
      .run();

    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS binance_topups (
      id TEXT PRIMARY KEY,
      intent_id TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL,
      binance_transaction_id TEXT NOT NULL UNIQUE,
      amount_atomic INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USDT',
      transaction_time INTEGER NOT NULL,
      order_type TEXT,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      credited_at INTEGER NOT NULL
    )`,
      )
      .run();

    await db
      .prepare(`CREATE INDEX IF NOT EXISTS idx_binance_topups_user ON binance_topups(user_id)`)
      .run();
    await db
      .prepare(
        `CREATE INDEX IF NOT EXISTS idx_binance_topups_tx ON binance_topups(binance_transaction_id)`,
      )
      .run();

    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS binance_verification_logs (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      intent_id TEXT,
      masked_tx_id TEXT,
      result TEXT NOT NULL,
      attempt_number INTEGER NOT NULL DEFAULT 1,
      upstream_status INTEGER,
      rejection_code TEXT,
      client_ip_hash TEXT,
      created_at INTEGER NOT NULL
    )`,
      )
      .run();

    await db
      .prepare(
        `CREATE INDEX IF NOT EXISTS idx_binance_logs_user ON binance_verification_logs(user_id, created_at DESC)`,
      )
      .run();
    await db
      .prepare(
        `CREATE INDEX IF NOT EXISTS idx_binance_logs_intent ON binance_verification_logs(intent_id)`,
      )
      .run();
    await db
      .prepare(
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_ledger_unique_ref ON wallet_ledger (reference_type, reference_id)`,
      )
      .run();

    binanceSchemaBootstrapped = true;
  } catch (err) {
    console.error("[BinancePay] Schema ensure error:", err);
  }
}

/**
 * Creates a new Top-Up Intent for the authenticated user.
 */
export async function createTopUpIntent(params: {
  userId: string;
  amountUsdt: string | number;
  clientIp?: string;
}) {
  await ensureBinanceSchema();
  const config = getBinanceConfig();

  if (!config.topupEnabled || !config.isConfigured) {
    throw new Error("BINANCE_TOPUP_UNAVAILABLE");
  }

  const user = await findUserById(params.userId);
  if (!user) {
    throw new Error("USER_NOT_FOUND");
  }

  // Parse and defensively validate atomic USDT amount (strictly positive, no zero/negatives/NaN/overflow)
  let atomicAmount: number;
  try {
    atomicAmount = parseUsdtToAtomic(params.amountUsdt);
    if (atomicAmount <= 0) {
      throw new Error("AMOUNT_MUST_BE_POSITIVE");
    }
  } catch (err: any) {
    throw new Error(err?.message || "INVALID_AMOUNT");
  }

  const now = Date.now();

  // Check for active pending intent
  const existingActive = await d1First<BinanceTopUpIntent>(
    `SELECT * FROM binance_topup_intents 
     WHERE user_id = ? AND status IN ('pending', 'verifying') AND expires_at > ?
     ORDER BY created_at DESC LIMIT 1`,
    params.userId,
    now,
  );

  if (existingActive) {
    // If the user already has an active pending intent for the exact same amount, return it
    if (existingActive.expected_amount_atomic === atomicAmount) {
      return {
        intent: existingActive,
        config: getPublicBinanceConfig(),
        isExisting: true,
      };
    }

    // Otherwise, expire/cancel previous pending intent so user can start with new amount
    await d1Execute(
      `UPDATE binance_topup_intents SET status = 'cancelled' WHERE id = ? AND status = 'pending'`,
      existingActive.id,
    );
  }

  // Rate-limit intent creations: max 12 per hour per user
  const recentIntents = await d1All<{ count: number }>(
    `SELECT COUNT(*) as count FROM binance_topup_intents 
     WHERE user_id = ? AND created_at > ?`,
    params.userId,
    now - 3600_000,
  );

  if ((recentIntents[0]?.count ?? 0) >= 12) {
    throw new Error("TOO_MANY_INTENT_CREATIONS_RATE_LIMIT");
  }

  const intentId = generateSecureId("bti");
  const expiresAt = now + config.intentTtlMs;

  await d1Execute(
    `INSERT INTO binance_topup_intents (
      id, user_id, expected_amount_atomic, currency, status,
      verify_attempts, created_at, expires_at
    ) VALUES (?, ?, ?, ?, 'pending', 0, ?, ?)`,
    intentId,
    params.userId,
    atomicAmount,
    config.allowedAsset,
    now,
    expiresAt,
  );

  const intent: BinanceTopUpIntent = {
    id: intentId,
    user_id: params.userId,
    expected_amount_atomic: atomicAmount,
    currency: config.allowedAsset,
    status: "pending",
    bound_transaction_id: null,
    verify_attempts: 0,
    last_verify_at: null,
    verify_started_at: null,
    created_at: now,
    expires_at: expiresAt,
    credited_at: null,
  };

  return {
    intent,
    config: getPublicBinanceConfig(),
    isExisting: false,
  };
}

/**
 * Retrieves the currently active intent for a user (if any).
 */
export async function getActiveTopUpIntent(userId: string): Promise<BinanceTopUpIntent | null> {
  await ensureBinanceSchema();
  const now = Date.now();

  const intent = await d1First<BinanceTopUpIntent>(
    `SELECT * FROM binance_topup_intents 
     WHERE user_id = ? AND (
       (status IN ('pending', 'verifying') AND expires_at > ?) OR 
       (status = 'credited' AND credited_at > ?)
     )
     ORDER BY created_at DESC LIMIT 1`,
    userId,
    now,
    now - 120_000, // Show recently credited intent for 2 minutes
  );

  if (!intent) return null;

  // Auto-mark expired if past expiry and still pending
  if (intent.status === "pending" && intent.expires_at <= now) {
    await d1Execute(
      `UPDATE binance_topup_intents SET status = 'expired' WHERE id = ? AND status = 'pending'`,
      intent.id,
    );
    return null;
  }

  return intent;
}

/**
 * Cancels an active pending intent.
 */
export async function cancelTopUpIntent(userId: string, intentId: string): Promise<boolean> {
  const res = await d1RunChanges(
    `UPDATE binance_topup_intents SET status = 'cancelled' WHERE id = ? AND user_id = ? AND status = 'pending'`,
    intentId,
    userId,
  );
  return res > 0;
}

export interface VerifyTopUpResult {
  success: boolean;
  status?: string;
  amount?: string;
  currency?: string;
  transactionId?: string;
  code?: BinanceVerifyErrorCode;
  message?: string;
  retryAfter?: number;
  attemptsLeft?: number;
}

/**
 * Verifies a Binance Transaction ID and atomically credits the user wallet once.
 */
export async function verifyTopUp(params: {
  userId: string;
  intentId: string;
  transactionId: string;
  clientIp?: string;
}): Promise<VerifyTopUpResult> {
  await ensureBinanceSchema();
  const config = getBinanceConfig();

  if (!config.topupEnabled || !config.isConfigured) {
    return {
      success: false,
      code: "BINANCE_TOPUP_UNAVAILABLE",
      message: "التعبئة عبر Binance متوقفة مؤقتًا.",
    };
  }

  const cleanTxId = (params.transactionId || "").trim();

  // Validate transaction ID format (letters, digits, underscores, dashes; 5 to 64 chars)
  if (!cleanTxId || !/^[A-Za-z0-9_-]{5,64}$/.test(cleanTxId)) {
    return {
      success: false,
      code: "INVALID_TRANSACTION_ID",
      message: "رقم العملية غير صالح. تأكد من نسخه بدقة من تفاصيل المعاملة في Binance.",
    };
  }

  const now = Date.now();
  const clientIpHash = params.clientIp ? await hashString(params.clientIp) : null;
  const requestId = generateSecureId("vrq");

  // User-level rolling verification limit: max 20 verify calls in 10 minutes across all intents
  const userRecentVerifications = await d1All<{ count: number }>(
    `SELECT COUNT(*) as count FROM binance_verification_logs 
     WHERE user_id = ? AND created_at > ?`,
    params.userId,
    now - 10 * 60_000,
  );

  if ((userRecentVerifications[0]?.count ?? 0) >= 20) {
    return {
      success: false,
      code: "TOO_MANY_ATTEMPTS",
      message: "يرجى الانتظار بضع دقائق قبل تكرار محاولات التحقق.",
    };
  }

  // Fetch intent
  const intent = await d1First<BinanceTopUpIntent>(
    `SELECT * FROM binance_topup_intents WHERE id = ? AND user_id = ?`,
    params.intentId,
    params.userId,
  );

  if (!intent) {
    return {
      success: false,
      code: "INTENT_NOT_FOUND",
      message: "طلب التعبئة غير موجود أو انتهت صلاحيته.",
    };
  }

  // Idempotency check: If already credited for this exact transaction, return success immediately
  if (intent.status === "credited") {
    if (intent.bound_transaction_id === cleanTxId) {
      return {
        success: true,
        status: "credited",
        amount: formatAtomicToUsdt(intent.expected_amount_atomic),
        currency: intent.currency,
        transactionId: cleanTxId,
      };
    }
    return {
      success: false,
      code: "TOPUP_ALREADY_CREDITED",
      message: "تم إكمال هذا الطلب وإضافة الرصيد مسبقًا.",
    };
  }

  // Check expiration
  if (now > intent.expires_at) {
    await d1Execute(
      `UPDATE binance_topup_intents SET status = 'expired' WHERE id = ? AND status IN ('pending', 'verifying')`,
      intent.id,
    );
    return {
      success: false,
      code: "TOPUP_EXPIRED",
      message: "انتهت صلاحية طلب التعبئة. أنشئ طلبًا جديدًا للمتابعة.",
    };
  }

  if (intent.status === "failed" || intent.status === "cancelled") {
    return {
      success: false,
      code: "TOPUP_FAILED",
      message: "طلب التعبئة ملغى أو مغلق. يرجى إنشاء طلب جديد.",
    };
  }

  // Check max attempts per intent
  if (intent.verify_attempts >= config.maxVerifyAttempts) {
    await d1Execute(
      `UPDATE binance_topup_intents SET status = 'failed' WHERE id = ? AND status IN ('pending', 'verifying')`,
      intent.id,
    );
    return {
      success: false,
      code: "TOO_MANY_ATTEMPTS",
      message: "تم استنفاد الحد الأقصى لمحاولات التحقق. أنشئ طلبًا جديدًا للمتابعة.",
    };
  }

  // Check progressive cooldown
  const cooldownMs = getCooldownMs(intent.verify_attempts);
  if (intent.last_verify_at && now - intent.last_verify_at < cooldownMs) {
    const remainingSeconds = Math.ceil((cooldownMs - (now - intent.last_verify_at)) / 1000);
    return {
      success: false,
      code: "COOLDOWN_ACTIVE",
      retryAfter: remainingSeconds,
      message: `يرجى الانتظار ${remainingSeconds} ثانية قبل محاولة التحقق مرة أخرى.`,
    };
  }

  // Check concurrent verification lock
  if (
    intent.status === "verifying" &&
    intent.verify_started_at &&
    now - intent.verify_started_at < config.lockTtlMs
  ) {
    return {
      success: false,
      code: "VERIFICATION_IN_PROGRESS",
      message: "جاري التحقق من العملية حاليًا، يرجى الانتظار بضع ثوانٍ.",
    };
  }

  // Acquire atomic lock conditionally
  const lockAcquired = await d1RunChanges(
    `UPDATE binance_topup_intents 
     SET status = 'verifying', verify_started_at = ?, verify_attempts = verify_attempts + 1, last_verify_at = ?
     WHERE id = ? AND (
       status = 'pending' OR 
       (status = 'verifying' AND (verify_started_at IS NULL OR verify_started_at < ?))
     )`,
    now,
    now,
    intent.id,
    now - config.lockTtlMs,
  );

  if (lockAcquired !== 1) {
    return {
      success: false,
      code: "VERIFICATION_IN_PROGRESS",
      message: "التحقق قيد المعالجة، الرجاء الانتظار.",
    };
  }

  const currentAttempt = intent.verify_attempts + 1;
  const attemptsLeft = Math.max(0, config.maxVerifyAttempts - currentAttempt);

  // Check if transaction ID was already used globally anywhere in our database
  const alreadyUsed = await d1First<{ id: string }>(
    `SELECT id FROM binance_topups WHERE binance_transaction_id = ?`,
    cleanTxId,
  );

  if (alreadyUsed) {
    // Release lock
    await d1Execute(
      `UPDATE binance_topup_intents SET status = 'pending' WHERE id = ? AND status = 'verifying'`,
      intent.id,
    );

    await logVerification({
      requestId,
      userId: params.userId,
      intentId: intent.id,
      maskedTxId: maskTransactionId(cleanTxId),
      result: "rejected",
      attemptNumber: currentAttempt,
      rejectionCode: "TRANSACTION_ALREADY_USED",
      clientIpHash,
    });

    return {
      success: false,
      code: "TRANSACTION_ALREADY_USED",
      message: "تم استخدام هذه المعاملة مسبقًا ولا يمكن استخدامها مرة أخرى.",
      attemptsLeft,
    };
  }

  // Query Binance API with strictly bounded window
  const startTime = Math.max(0, intent.created_at - 60_000);
  const endTime = Math.min(now + 60_000, intent.expires_at + 60_000);

  let binanceTxs;
  try {
    binanceTxs = await fetchBinancePayTransactions(startTime, endTime);
  } catch (err: any) {
    console.error("[BinancePay] API query error during verify:", err?.message || err);

    // Release lock on upstream failure
    await d1Execute(
      `UPDATE binance_topup_intents SET status = 'pending' WHERE id = ? AND status = 'verifying'`,
      intent.id,
    );

    await logVerification({
      requestId,
      userId: params.userId,
      intentId: intent.id,
      maskedTxId: maskTransactionId(cleanTxId),
      result: "upstream_error",
      attemptNumber: currentAttempt,
      rejectionCode: "UPSTREAM_FETCH_FAILED",
      clientIpHash,
    });

    return {
      success: false,
      code: "VERIFICATION_TEMPORARILY_UNAVAILABLE",
      message: "تعذر الاتصال بخدمة التحقق حاليًا. لم يتم إضافة أي رصيد. حاول مرة أخرى بعد قليل.",
      attemptsLeft,
    };
  }

  // Find matching incoming transaction
  const matchingTx = binanceTxs.find((tx) => {
    // 1. Exact transaction ID match
    if (tx.transactionId !== cleanTxId) return false;

    // 2. Exact currency/asset match from config source of truth
    const txCurrency = (tx.currency || "").trim().toUpperCase();
    if (txCurrency !== config.allowedAsset) return false;

    // 3. Exact amount match using atomic integer units
    try {
      const txAtomic = parseUsdtToAtomic(tx.amount);
      if (txAtomic !== intent.expected_amount_atomic) return false;
    } catch {
      return false;
    }

    // 4. Order type check: allow only approved incoming order types
    const orderType = (tx.orderType || "").toUpperCase();
    if (
      orderType &&
      !ALLOWED_BINANCE_PAY_ORDER_TYPES.some((t) => orderType.includes(t.toUpperCase()))
    ) {
      return false;
    }

    // 5. Time window check (must be within intent window and not older than 20 minutes)
    const txTime = Number(tx.transactionTime);
    if (!Number.isFinite(txTime)) return false;
    if (txTime < intent.created_at - 60_000 || txTime > intent.expires_at + 60_000) return false;
    if (now - txTime > config.maxTransactionAgeMs) return false;

    // 6. Binance Receiver check (exact comparison with BINANCE_RECEIVER_ID)
    if (config.receiverId) {
      const receiverBinanceId = (
        tx.receiverInfo?.binanceId ||
        tx.receiverInfo?.accountId ||
        ""
      ).trim();
      if (receiverBinanceId && receiverBinanceId !== config.receiverId) {
        return false;
      }
    }

    return true;
  });

  if (!matchingTx) {
    const nextStatus = currentAttempt >= config.maxVerifyAttempts ? "failed" : "pending";
    await d1Execute(
      `UPDATE binance_topup_intents SET status = ? WHERE id = ? AND status = 'verifying'`,
      nextStatus,
      intent.id,
    );

    await logVerification({
      requestId,
      userId: params.userId,
      intentId: intent.id,
      maskedTxId: maskTransactionId(cleanTxId),
      result: "rejected",
      attemptNumber: currentAttempt,
      rejectionCode: "TRANSACTION_NOT_VALID_FOR_THIS_TOPUP",
      clientIpHash,
    });

    // Anti-enumeration message: generic so attacker cannot guess transaction state
    return {
      success: false,
      code: "TRANSACTION_NOT_VALID_FOR_THIS_TOPUP",
      message: "لم نتمكن من التحقق من هذه المعاملة حتى الآن. تأكد من رقم المعاملة وحاول مرة أخرى.",
      attemptsLeft,
    };
  }

  // ATOMIC CREDIT BATCH EXECUTION: Exactly Once Credit
  const topupRecordId = generateSecureId("btu");
  const ledgerId = generateSecureId("wld");
  const walletTxId = generateSecureId("wtx");
  const amountUsdtStr = formatAtomicToUsdt(intent.expected_amount_atomic);
  const amountUsdtNum = Number(amountUsdtStr);
  const isoNow = new Date().toISOString();

  const user = await findUserById(params.userId);
  const balanceBefore = user?.walletBalance ?? 0;
  const balanceAfter = balanceBefore + amountUsdtNum;

  try {
    const batchStatements = [
      // 1. Insert into binance_topups (enforces UNIQUE on binance_transaction_id and intent_id)
      {
        sql: `INSERT INTO binance_topups (
          id, intent_id, user_id, binance_transaction_id, amount_atomic,
          currency, transaction_time, order_type, status, created_at, credited_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'credited', ?, ?)`,
        params: [
          topupRecordId,
          intent.id,
          params.userId,
          cleanTxId,
          intent.expected_amount_atomic,
          intent.currency,
          matchingTx.transactionTime,
          matchingTx.orderType || "C2C",
          now,
          now,
        ],
      },
      // 2. Insert into wallet_ledger (enforces UNIQUE on reference_type + reference_id)
      {
        sql: `INSERT INTO wallet_ledger (
          id, user_id, amount, type, balance_before, balance_after,
          reference_type, reference_id, description, created_at
        ) VALUES (?, ?, ?, 'deposit', ?, ?, 'BINANCE_TRANSACTION', ?, ?, ?)`,
        params: [
          ledgerId,
          params.userId,
          amountUsdtNum,
          balanceBefore,
          balanceAfter,
          cleanTxId,
          `Binance Pay Top-Up (${cleanTxId})`,
          isoNow,
        ],
      },
      // 3. Insert into wallet_transactions
      {
        sql: `INSERT INTO wallet_transactions (
          id, user_id, kind, amount, description, order_id, created_at
        ) VALUES (?, ?, 'deposit', ?, ?, '', ?)`,
        params: [
          walletTxId,
          params.userId,
          amountUsdtNum,
          `Binance Top-Up +$${amountUsdtStr} (${cleanTxId})`,
          isoNow,
        ],
      },
      // 4. Increment user wallet balance
      {
        sql: `UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?`,
        params: [amountUsdtNum, params.userId],
      },
      // 5. Finalize intent state to 'credited'
      {
        sql: `UPDATE binance_topup_intents 
              SET status = 'credited', credited_at = ?, bound_transaction_id = ? 
              WHERE id = ? AND status = 'verifying'`,
        params: [now, cleanTxId, intent.id],
      },
    ];

    await d1Batch(batchStatements);

    await logVerification({
      requestId,
      userId: params.userId,
      intentId: intent.id,
      maskedTxId: maskTransactionId(cleanTxId),
      result: "credited",
      attemptNumber: currentAttempt,
      rejectionCode: null,
      clientIpHash,
    });

    return {
      success: true,
      status: "credited",
      amount: amountUsdtStr,
      currency: intent.currency,
      transactionId: cleanTxId,
      message: `تم التحقق بنجاح وتمت إضافة ${amountUsdtStr} $ إلى رصيدك.`,
    };
  } catch (creditErr: any) {
    console.error("[BinancePay] Batch credit failed:", creditErr?.message || creditErr);

    // Release lock back so user can retry safely
    await d1Execute(
      `UPDATE binance_topup_intents SET status = 'pending' WHERE id = ? AND status = 'verifying'`,
      intent.id,
    );

    return {
      success: false,
      code: "VERIFICATION_TEMPORARILY_UNAVAILABLE",
      message: "حدث خطأ أثناء قيد الرصيد. لم يتم خصم أو تكرار العملية. يرجى المحاولة مرة أخرى.",
      attemptsLeft,
    };
  }
}

async function logVerification(log: {
  requestId: string;
  userId: string;
  intentId: string | null;
  maskedTxId: string | null;
  result: string;
  attemptNumber: number;
  upstreamStatus?: number;
  rejectionCode: string | null;
  clientIpHash: string | null;
}) {
  if (!(await d1Ready())) return;
  try {
    await d1Execute(
      `INSERT INTO binance_verification_logs (
        id, request_id, user_id, intent_id, masked_tx_id, result,
        attempt_number, upstream_status, rejection_code, client_ip_hash, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      generateSecureId("bvl"),
      log.requestId,
      log.userId,
      log.intentId,
      log.maskedTxId,
      log.result,
      log.attemptNumber,
      log.upstreamStatus ?? 200,
      log.rejectionCode,
      log.clientIpHash,
      Date.now(),
    );
  } catch (err) {
    console.error("[BinancePay] Failed to write verification log:", err);
  }
}

/**
 * Admin queries for Binance Top-Ups and audit tracking.
 */
export async function getAdminBinanceTopups(
  limit = 50,
  filter?: string,
): Promise<BinanceTopUpRecord[]> {
  await ensureBinanceSchema();
  if (filter && filter !== "all") {
    return d1All<BinanceTopUpRecord>(
      `SELECT * FROM binance_topups WHERE status = ? ORDER BY created_at DESC LIMIT ?`,
      filter,
      limit,
    );
  }
  return d1All<BinanceTopUpRecord>(
    `SELECT * FROM binance_topups ORDER BY created_at DESC LIMIT ?`,
    limit,
  );
}

export async function getAdminBinanceIntents(
  limit = 50,
  filter?: string,
): Promise<BinanceTopUpIntent[]> {
  await ensureBinanceSchema();
  if (filter && filter !== "all") {
    return d1All<BinanceTopUpIntent>(
      `SELECT * FROM binance_topup_intents WHERE status = ? ORDER BY created_at DESC LIMIT ?`,
      filter,
      limit,
    );
  }
  return d1All<BinanceTopUpIntent>(
    `SELECT * FROM binance_topup_intents ORDER BY created_at DESC LIMIT ?`,
    limit,
  );
}

export async function getAdminBinanceLogs(limit = 50): Promise<BinanceVerificationLog[]> {
  await ensureBinanceSchema();
  return d1All<BinanceVerificationLog>(
    `SELECT * FROM binance_verification_logs ORDER BY created_at DESC LIMIT ?`,
    limit,
  );
}
