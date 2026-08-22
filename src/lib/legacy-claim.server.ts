/**
 * Legacy Account Staging & Claim Engine.
 *
 * Implements idempotent, checkpointed claiming of legacy user profiles, orders, chats,
 * reviews, and balances once identity verification (Phone OTP or OAuth) is established.
 */

import { d1All, d1First, d1BatchRun, d1Run, d1Ready, d1RunChanges } from "./d1.server";
import { normalizePhone } from "./phone";
import { creditBananaBalance } from "./banana-balance.server";

export interface LegacyUserRow {
  id: string;
  legacy_id: string;
  name: string;
  username: string | null;
  email: string | null;
  normalized_email: string | null;
  phone: string | null;
  normalized_phone: string | null;
  banana_balance: number;
  store_credit_iqd: number;
  claim_state: "unclaimed" | "claiming" | "claimed";
  claimed_by_user_id: string | null;
  claimed_at: string | null;
  legacy_created_at: string | null;
  raw_json: string | null;
}

export interface LegacyClaimResult {
  claimed: boolean;
  legacyUserId?: string;
  bananaTransferred?: number;
  ordersLinked?: number;
  threadsLinked?: number;
  reviewsLinked?: number;
  reason?: string;
}

export function normalizeEmail(email?: string | null): string | null {
  if (!email) return null;
  const trimmed = email.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizePhoneHelper(phone?: string | null): string | null {
  if (!phone) return null;
  return normalizePhone(phone) ?? null;
}

/**
 * Atomically claims a legacy user matching verified phone or OAuth email.
 * Guarantees strict identifier separation and collision handling.
 */
/** Legacy `raw_json` payloads are untrusted text; a bad one must not abort a claim. */
function safeJson<T>(raw: string | null): T | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as T) : undefined;
  } catch {
    return undefined;
  }
}

export async function claimLegacyAccount(params: {
  userId: string;
  phone?: string | null;
  email?: string | null;
  claimType: "phone_otp" | "telegram_otp" | "oauth_google" | "oauth_apple" | "admin_manual";
}): Promise<LegacyClaimResult> {
  const { userId, claimType } = params;
  const normPhone = normalizePhoneHelper(params.phone);
  const normEmail = normalizeEmail(params.email);

  // 1. Channel Specific Identifier Filtering
  let targetPhone: string | null = null;
  let targetEmail: string | null = null;

  if (claimType === "phone_otp" || claimType === "telegram_otp") {
    targetPhone = normPhone;
  } else if (claimType === "oauth_google" || claimType === "oauth_apple") {
    targetEmail = normEmail;
  } else if (claimType === "admin_manual") {
    targetPhone = normPhone;
    targetEmail = normEmail;
  }

  if (!targetPhone && !targetEmail) {
    return { claimed: false, reason: "no_verified_identifier" };
  }

  if (!(await d1Ready())) {
    return { claimed: false, reason: "d1_not_enabled" };
  }

  // 2. Conflict Detection
  let legacyByPhone: LegacyUserRow | null = null;
  let legacyByEmail: LegacyUserRow | null = null;

  if (targetPhone) {
    legacyByPhone =
      (await d1First<LegacyUserRow>(
        `SELECT * FROM legacy_users WHERE normalized_phone = ? LIMIT 1`,
        targetPhone,
      )) ?? null;
  }

  if (targetEmail) {
    legacyByEmail =
      (await d1First<LegacyUserRow>(
        `SELECT * FROM legacy_users WHERE normalized_email = ? LIMIT 1`,
        targetEmail,
      )) ?? null;
  }

  if (legacyByPhone && legacyByEmail && legacyByPhone.legacy_id !== legacyByEmail.legacy_id) {
    return { claimed: false, reason: "claim_conflict" };
  }

  const legacyUser = legacyByPhone || legacyByEmail;
  if (!legacyUser) {
    return { claimed: false, reason: "no_unclaimed_legacy_record" };
  }

  const legacyId = legacyUser.legacy_id;

  // 3. Status Check & CAS Acquisition
  if (legacyUser.claim_state === "claimed" && legacyUser.claimed_by_user_id !== userId) {
    return { claimed: false, reason: "claimed_by_other_user" };
  }

  // Idempotent start
  const now = new Date().toISOString();
  if (legacyUser.claim_state === "unclaimed") {
    const changes = await d1RunChanges(
      `UPDATE legacy_users 
       SET claim_state = 'claiming', 
           claimed_by_user_id = ?, 
           claim_started_at = ? 
       WHERE legacy_id = ? AND claim_state = 'unclaimed'`,
      userId,
      now,
      legacyId,
    );
    if (changes === 0) {
      return { claimed: false, reason: "acquisition_failed_concurrent" };
    }
  }

  // Ensure legacy_claims entry exists (Checkpoint tracker).
  // `claimed_at` is NOT NULL with no default and was previously omitted, so
  // this INSERT never created a row; the SELECT below then returned nothing and
  // every claim bailed out with `checkpoint_not_found` — after already flipping
  // legacy_users.claim_state to 'claiming', which permanently blocked retries.
  await d1Run(
    `INSERT INTO legacy_claims (
      id, legacy_user_id, claimed_by_user_id, claim_type, claim_identifier, status,
      claimed_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'claiming', ?, ?, ?)
    ON CONFLICT(legacy_user_id) DO NOTHING`,
    `lcm_${legacyId}`,
    legacyId,
    userId,
    claimType,
    String(targetPhone || targetEmail),
    now,
    now,
    now,
  );

  const claim = await d1First<{
    banana_done: number;
    orders_done: number;
    threads_done: number;
    reviews_done: number;
    media_done: number;
    status: string;
  }>(`SELECT * FROM legacy_claims WHERE legacy_user_id = ?`, legacyId);

  if (!claim) return { claimed: false, reason: "checkpoint_not_found" };
  if (claim.status === "completed") {
    return { claimed: true, legacyUserId: legacyId, reason: "already_completed" };
  }

  // 4. Checkpointed Materialization

  // A. Banana Transfer
  let bananaTransferred = 0;
  if (!claim.banana_done) {
    const amount = Math.round(Number(legacyUser.banana_balance) || 0);
    if (amount > 0) {
      await creditBananaBalance(userId, amount, {
        reason: "legacy_claim",
        idempotencyKey: `legacy_claim_banana:${legacyId}`,
        meta: { legacyUserId: legacyId },
      });
      bananaTransferred = amount;
    }
    await d1Run(
      `UPDATE legacy_claims SET banana_done = 1, banana_transferred = ?, updated_at = ? WHERE legacy_user_id = ?`,
      bananaTransferred,
      now,
      legacyId,
    );
  }

  // B. Orders & Items: link archive in legacy_orders without polluting active store orders
  if (!claim.orders_done) {
    const legacyOrders = await d1All<{
      legacy_id: string;
      order_no: string | null;
      total_iqd: number;
      created_at: string;
      raw_json: string | null;
    }>(`SELECT * FROM legacy_orders WHERE legacy_user_id = ?`, legacyId);

    await d1Run(
      `UPDATE legacy_orders SET claimed_by_user_id = ? WHERE legacy_user_id = ?`,
      userId,
      legacyId,
    );

    await d1Run(
      `UPDATE legacy_claims SET orders_done = 1, orders_linked = ?, updated_at = ? WHERE legacy_user_id = ?`,
      legacyOrders.length,
      now,
      legacyId,
    );
  }

  // C. Threads & Messages: link archive in legacy_threads without polluting active store threads
  if (!claim.threads_done) {
    const legacyThreads = await d1All<{
      legacy_id: string;
      subject: string | null;
      created_at: string;
    }>(`SELECT * FROM legacy_threads WHERE legacy_user_id = ?`, legacyId);

    await d1Run(
      `UPDATE legacy_threads SET claimed_by_user_id = ? WHERE legacy_user_id = ?`,
      userId,
      legacyId,
    );

    await d1Run(
      `UPDATE legacy_claims SET threads_done = 1, threads_linked = ?, updated_at = ? WHERE legacy_user_id = ?`,
      legacyThreads.length,
      now,
      legacyId,
    );
  }

  // D. Reviews
  if (!claim.reviews_done) {
    const legacyReviews = await d1All<{
      legacy_id: string;
      product_id: string | null;
      rating: number;
      comment: string | null;
      status: string;
      unresolved: number;
      created_at: string;
    }>(`SELECT * FROM legacy_reviews WHERE legacy_user_id = ?`, legacyId);

    for (const rev of legacyReviews) {
      if (rev.product_id && !rev.unresolved) {
        const liveReviewId = `legacy_rev_${rev.legacy_id}`;
        await d1Run(
          `INSERT INTO product_reviews (
            id, product_id, user_id, rating, comment, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET user_id = excluded.user_id`,
          liveReviewId,
          rev.product_id,
          userId,
          rev.rating || 5,
          rev.comment || "",
          rev.status || "approved",
          rev.created_at || now,
          rev.created_at || now,
        );
      }
    }
    await d1Run(
      `UPDATE legacy_claims SET reviews_done = 1, reviews_linked = ?, updated_at = ? WHERE legacy_user_id = ?`,
      legacyReviews.length,
      now,
      legacyId,
    );
  }

  // E. Finalize
  await d1BatchRun([
    {
      sql: `UPDATE legacy_users SET claim_state = 'claimed', claimed_at = ? WHERE legacy_id = ?`,
      binds: [now, legacyId],
    },
    {
      sql: `UPDATE legacy_claims SET status = 'completed', completed_at = ?, updated_at = ? WHERE legacy_user_id = ?`,
      binds: [now, now, legacyId],
    },
    {
      sql: `UPDATE legacy_orders SET claimed_by_user_id = ? WHERE legacy_user_id = ?`,
      binds: [userId, legacyId],
    },
    {
      sql: `UPDATE legacy_threads SET claimed_by_user_id = ? WHERE legacy_user_id = ?`,
      binds: [userId, legacyId],
    },
    {
      sql: `UPDATE legacy_reviews SET claimed_by_user_id = ? WHERE legacy_user_id = ?`,
      binds: [userId, legacyId],
    },
    {
      sql: `UPDATE legacy_media SET claimed_by_user_id = ? WHERE legacy_user_id = ?`,
      binds: [userId, legacyId],
    },
  ]);

  const finalClaim = await d1First<{
    banana_transferred: number;
    orders_linked: number;
    threads_linked: number;
    reviews_linked: number;
  }>(`SELECT * FROM legacy_claims WHERE legacy_user_id = ?`, legacyId);

  return {
    claimed: true,
    legacyUserId: legacyId,
    bananaTransferred: finalClaim?.banana_transferred || 0,
    ordersLinked: finalClaim?.orders_linked || 0,
    threadsLinked: finalClaim?.threads_linked || 0,
    reviewsLinked: finalClaim?.reviews_linked || 0,
  };
}

export async function getClaimedLegacyOrders(userId: string) {
  if (!(await d1Ready())) return [];
  return d1All<{
    id: string;
    legacy_id: string;
    order_no: string;
    status: string;
    total_iqd: number;
    total_usd: number;
    payment_method: string;
    created_at: string;
    raw_json: string;
  }>(`SELECT * FROM legacy_orders WHERE claimed_by_user_id = ? ORDER BY created_at DESC`, userId);
}

export async function getClaimedLegacyThreads(userId: string) {
  if (!(await d1Ready())) return [];
  return d1All<{
    id: string;
    legacy_id: string;
    subject: string;
    order_id: string;
    status: string;
    mode: string;
    created_at: string;
  }>(`SELECT * FROM legacy_threads WHERE claimed_by_user_id = ? ORDER BY created_at DESC`, userId);
}
