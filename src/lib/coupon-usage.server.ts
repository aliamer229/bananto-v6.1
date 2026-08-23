/**
 * Who has used a coupon, and how many times.
 *
 * ## The rule, stated once
 *
 * A coupon has two independent limits, and confusing them is what made a
 * one-per-customer coupon die for everybody the moment the first customer used
 * it:
 *
 * - **`per_user_limit`** — how many times *each* member may use it. Defaults to
 *   1. Member A redeeming it has no effect whatsoever on member B.
 * - **`usage_limit`** — how many times it may be used *in total, by anyone*.
 *   Optional. `NULL`/`0`/absent means unlimited, and in that case no amount of
 *   redeeming by anyone can ever exhaust the coupon.
 *
 * ## Why a counter table and not `COUNT(*)`
 *
 * Counting `coupon_redemptions` answers the question, but only between the read
 * and the write. Two checkouts a few milliseconds apart both count zero, both
 * pass, and a one-per-customer coupon gets used twice. So the limits are
 * enforced by *claiming* rather than counting:
 *
 * - per-user: an upsert into `coupon_user_usage`, whose primary key is exactly
 *   the `(coupon_id, user_id)` pair the rule is about, with the increment
 *   guarded by `WHERE uses < ?`.
 * - global: a guarded `UPDATE coupons SET total_uses = total_uses + 1` that
 *   refuses when the cap is reached — and that is skipped entirely when no cap
 *   is set.
 *
 * Each claim reports whether it actually changed a row, so a loser sees the
 * refusal rather than a double discount. `coupon_redemptions` stays as the
 * per-order audit trail.
 */
import { d1First, d1Run, d1RunChanges } from "./d1.server";

export interface CouponUsageCounts {
  /** Times this member has used this coupon. */
  userUses: number;
  /** Times anyone has used this coupon. */
  globalUses: number;
}

/**
 * Reads both counters.
 *
 * Falls back to counting `coupon_redemptions` when a counter row does not exist
 * yet, so a database whose backfill has not run — or a coupon redeemed by an
 * older build — still reports the truth instead of zero.
 */
export async function readCouponUsage(
  couponId: string,
  userId: string,
): Promise<CouponUsageCounts> {
  const [userRow, couponRow] = await Promise.all([
    d1First<{ uses: number }>(
      `SELECT uses FROM coupon_user_usage WHERE coupon_id = ? AND user_id = ?`,
      couponId,
      userId,
    ),
    d1First<{ total_uses: number | null }>(`SELECT total_uses FROM coupons WHERE id = ?`, couponId),
  ]);

  let userUses = Number(userRow?.uses ?? 0);
  let globalUses = Number(couponRow?.total_uses ?? 0);

  if (!userRow) {
    const legacy = await d1First<{ total: number }>(
      `SELECT COUNT(*) as total FROM coupon_redemptions WHERE coupon_id = ? AND user_id = ?`,
      couponId,
      userId,
    );
    userUses = Number(legacy?.total ?? 0);
  }
  if (!couponRow || couponRow.total_uses === null || couponRow.total_uses === undefined) {
    const legacy = await d1First<{ total: number }>(
      `SELECT COUNT(*) as total FROM coupon_redemptions WHERE coupon_id = ?`,
      couponId,
    );
    globalUses = Number(legacy?.total ?? 0);
  }

  return { userUses, globalUses };
}

/** How many distinct lifetime uses a member has of any coupon flagged lifetime-only. */
export async function readLifetimeCouponUses(
  couponId: string,
  userId: string,
): Promise<number> {
  const row = await d1First<{ total: number }>(
    `SELECT COUNT(*) as total FROM coupon_redemptions WHERE coupon_id = ? AND user_id = ?`,
    couponId,
    userId,
  );
  return Number(row?.total ?? 0);
}

export type CouponClaimFailure = "per_user_limit" | "usage_limit";

export interface CouponClaim {
  ok: boolean;
  reason?: CouponClaimFailure;
}

/**
 * Takes one use of `couponId` for `userId`, atomically.
 *
 * `perUserLimit` defaults to 1. `totalLimit` is only enforced when it is a
 * positive number — `undefined`, `null` and `0` all mean unlimited, which is
 * the behaviour an empty "total uses" field in the admin form must produce.
 *
 * On failure nothing has been consumed and the caller must refuse the coupon.
 * The per-user claim is released if the global claim then fails, so a member is
 * never charged a use for a coupon they did not get.
 */
export async function claimCouponUse(options: {
  couponId: string;
  userId: string;
  perUserLimit?: number | undefined;
  totalLimit?: number | undefined;
  now?: string;
}): Promise<CouponClaim> {
  const { couponId, userId } = options;
  const now = options.now ?? new Date().toISOString();
  const perUser =
    options.perUserLimit !== undefined &&
    options.perUserLimit !== null &&
    Number(options.perUserLimit) > 0
      ? Number(options.perUserLimit)
      : 1;
  const hasTotalCap =
    options.totalLimit !== undefined &&
    options.totalLimit !== null &&
    Number(options.totalLimit) > 0;

  // Per-user claim. The ON CONFLICT target is the (coupon_id, user_id) primary
  // key, so concurrent checkouts serialise on the same row and the WHERE clause
  // decides which one wins.
  const userClaimed = await d1RunChanges(
    `INSERT INTO coupon_user_usage (coupon_id, user_id, uses, first_used_at, last_used_at)
     VALUES (?, ?, 1, ?, ?)
     ON CONFLICT(coupon_id, user_id) DO UPDATE SET
       uses = coupon_user_usage.uses + 1,
       last_used_at = excluded.last_used_at
     WHERE coupon_user_usage.uses < ?`,
    couponId,
    userId,
    now,
    now,
    perUser,
  );
  if (userClaimed < 1) return { ok: false, reason: "per_user_limit" };

  if (!hasTotalCap) {
    // Unlimited globally: still record the total so the admin can see real
    // usage, but never let it refuse.
    await d1Run(
      `UPDATE coupons SET total_uses = COALESCE(total_uses, 0) + 1 WHERE id = ?`,
      couponId,
    );
    return { ok: true };
  }

  const globalClaimed = await d1RunChanges(
    `UPDATE coupons SET total_uses = COALESCE(total_uses, 0) + 1
     WHERE id = ? AND COALESCE(total_uses, 0) < ?`,
    couponId,
    Number(options.totalLimit),
  );
  if (globalClaimed < 1) {
    await releaseCouponUse({ couponId, userId });
    return { ok: false, reason: "usage_limit" };
  }

  return { ok: true };
}

/**
 * Gives a claimed use back.
 *
 * Used when a later step of checkout fails after the claim, so an abandoned
 * order does not permanently consume a member's only use of a coupon.
 */
export async function releaseCouponUse(options: {
  couponId: string;
  userId: string;
  releaseGlobal?: boolean;
}): Promise<void> {
  await d1Run(
    `UPDATE coupon_user_usage SET uses = MAX(0, uses - 1)
     WHERE coupon_id = ? AND user_id = ?`,
    options.couponId,
    options.userId,
  );
  if (options.releaseGlobal) {
    await d1Run(
      `UPDATE coupons SET total_uses = MAX(0, COALESCE(total_uses, 0) - 1) WHERE id = ?`,
      options.couponId,
    );
  }
}
