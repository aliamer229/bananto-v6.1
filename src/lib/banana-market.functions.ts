import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  d1All,
  d1First,
  d1Run,
  d1Batch,
  randomId,
  createAuditLog,
  createNotification,
  findUserById,
} from "./db.server";
import { requireAppAuth, requireAdmin } from "./auth.middleware";
import type {
  BananaLedgerEntry,
  BananaMarketOffer,
  BananaRedemptionOffer,
  BananaBot,
} from "./types";

/**
 * Get user's Banana balance and ledger history.
 */
export const getBananaMarketData = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .handler(async ({ context }) => {
    const userId = context.userId;

    const user = await findUserById(userId);
    if (!user) throw new Error("User not found");

    const ledger = await d1All<BananaLedgerEntry>(
      `SELECT * FROM banana_ledger WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
      userId,
    );

    const myOffers = await d1All<BananaMarketOffer>(
      `SELECT * FROM banana_market_offers WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC`,
      userId,
    );

    return {
      availableBalance: user.bananaBalance || 0,
      lockedBalance: user.bananaLocked || 0,
      ledger,
      myOffers,
    };
  });

/**
 * Create a new sell offer in the Banana Marketplace.
 * Locks the bananas from Available to Locked.
 */
export const createBananaSellOffer = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(
    z.object({
      quantity: z.number().int().positive(),
      priceIqd: z.number().positive(),
    }),
  )
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const now = new Date().toISOString();

    const user = await findUserById(userId);
    if (!user || (user.bananaBalance || 0) < data.quantity) {
      throw new Error("Insufficient available banana balance");
    }

    const offerId = randomId("bmo");

    // Atomic: Lock Banana + Create Offer
    await d1Batch([
      {
        sql: `UPDATE users SET banana_balance = CASE WHEN banana_balance >= ? THEN banana_balance - ? ELSE NULL END, banana_locked = banana_locked + ? WHERE id = ?`,
        params: [data.quantity, data.quantity, data.quantity, userId],
      },
      {
        sql: `INSERT INTO banana_market_offers (id, user_id, quantity, price_iqd, locked_banana, status, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`,
        params: [offerId, userId, data.quantity, data.priceIqd, data.quantity, now, now],
      },
      {
        sql: `INSERT INTO banana_ledger (id, user_id, amount, type, direction, balance_before, balance_after, reference_type, reference_id, created_at)
              VALUES (?, ?, ?, 'market_sell', 'out', ?, ?, 'market_offer', ?, ?)`,
        params: [
          randomId("blg"),
          userId,
          data.quantity,
          user.bananaBalance,
          (user.bananaBalance || 0) - data.quantity,
          offerId,
          now,
        ],
      },
    ]);

    await createAuditLog(userId, "create_banana_offer", "banana_offer", offerId, null, data);
    return { success: true, offerId };
  });

/**
 * Cancel a sell offer and unlock the bananas.
 */
export const cancelBananaSellOffer = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(
    z.object({
      offerId: z.string(),
    }),
  )
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const now = new Date().toISOString();

    const offer = await d1First<BananaMarketOffer>(
      `SELECT * FROM banana_market_offers WHERE id = ? AND user_id = ? AND status = 'active'`,
      data.offerId,
      userId,
    );

    if (!offer) throw new Error("Offer not found or not active");

    const user = await findUserById(userId);
    if (!user) throw new Error("User not found");

    // Atomic: Unlock Banana + Update Offer Status
    await d1Batch([
      {
        sql: `UPDATE users SET banana_balance = banana_balance + ?, banana_locked = CASE WHEN banana_locked >= ? THEN banana_locked - ? ELSE NULL END WHERE id = ?`,
        params: [offer.lockedBanana, offer.lockedBanana, offer.lockedBanana, userId],
      },
      {
        sql: `UPDATE banana_market_offers SET status = 'cancelled', updated_at = ? WHERE id = ?`,
        params: [now, data.offerId],
      },
      {
        sql: `INSERT INTO banana_ledger (id, user_id, amount, type, direction, balance_before, balance_after, reference_type, reference_id, created_at)
              VALUES (?, ?, ?, 'adjustment', 'in', ?, ?, 'market_offer_cancel', ?, ?)`,
        params: [
          randomId("blg"),
          userId,
          offer.lockedBanana,
          user.bananaBalance,
          (user.bananaBalance || 0) + offer.lockedBanana,
          data.offerId,
          now,
        ],
      },
    ]);

    await createAuditLog(userId, "cancel_banana_offer", "banana_offer", data.offerId);
    return { success: true };
  });

/**
 * Purchase a Banana Offer from another user.
 * Atomic: Wallet IQD Transfer + Banana Transfer.
 */
export const purchaseBananaOffer = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(
    z.object({
      offerId: z.string(),
    }),
  )
  .handler(async ({ data, context }) => {
    const buyerId = context.userId;
    const now = new Date().toISOString();

    const offer = await d1First<BananaMarketOffer>(
      `SELECT * FROM banana_market_offers WHERE id = ? AND status = 'active'`,
      data.offerId,
    );

    if (!offer) throw new Error("Offer is no longer active");
    if (offer.userId === buyerId) throw new Error("You cannot buy your own offer");

    const buyer = await findUserById(buyerId);
    const seller = await findUserById(offer.userId);

    if (!buyer || !seller) throw new Error("User not found");
    if (buyer.walletBalance < offer.priceIqd) throw new Error("Insufficient wallet balance");

    // 1. Atomically Claim the offer first
    const claimRes = await d1Run(
      `UPDATE banana_market_offers SET status = 'processing', buyer_id = ?, updated_at = ? WHERE id = ? AND status = 'active'`,
      buyerId,
      now,
      data.offerId,
    );

    if (claimRes.meta.changes === 0) {
      throw new Error("OFFER_ALREADY_TAKEN");
    }

    try {
      // 2. Process Settlement Atomically
      await d1Batch([
        // Financials
        {
          sql: `UPDATE users SET wallet_balance = CASE WHEN wallet_balance >= ? THEN wallet_balance - ? ELSE NULL END WHERE id = ?`,
          params: [offer.priceIqd, offer.priceIqd, buyerId],
        },
        {
          sql: `UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?`,
          params: [offer.priceIqd, seller.id],
        },
        // Banana Transfer
        {
          sql: `UPDATE users SET banana_locked = CASE WHEN banana_locked >= ? THEN banana_locked - ? ELSE NULL END WHERE id = ?`,
          params: [offer.lockedBanana, offer.lockedBanana, seller.id],
        },
        {
          sql: `UPDATE users SET banana_balance = banana_balance + ? WHERE id = ?`,
          params: [offer.quantity, buyerId],
        },
        // Offer Close
        {
          sql: `UPDATE banana_market_offers SET status = 'sold', updated_at = ? WHERE id = ? AND status = 'processing'`,
          params: [now, data.offerId],
        },
        // Ledger - Buyer
        {
          sql: `INSERT INTO banana_ledger (id, user_id, amount, type, direction, balance_before, balance_after, reference_type, reference_id, created_at)
                VALUES (?, ?, ?, 'market_buy', 'in', ?, ?, 'market_purchase', ?, ?)`,
          params: [
            randomId("blg"),
            buyerId,
            offer.quantity,
            buyer.bananaBalance,
            (buyer.bananaBalance || 0) + offer.quantity,
            data.offerId,
            now,
          ],
        },
        // Financial Ledger - Seller IQD
        {
          sql: `INSERT INTO wallet_transactions (id, user_id, kind, amount, description, created_at, reference_type, reference_id)
                 VALUES (?, ?, 'deposit', ?, ?, ?, 'banana_market', ?)`,
          params: [
            randomId("wtx"),
            seller.id,
            offer.priceIqd,
            `مبيعات سوق الموز: ${offer.quantity} موزة`,
            now,
            data.offerId,
          ],
        },
        // Financial Ledger - Buyer IQD
        {
          sql: `INSERT INTO wallet_transactions (id, user_id, kind, amount, description, created_at, reference_type, reference_id)
                 VALUES (?, ?, 'payment', ?, ?, ?, 'banana_market', ?)`,
          params: [
            randomId("wtx"),
            buyerId,
            -offer.priceIqd,
            `شراء من سوق الموز: ${offer.quantity} موزة`,
            now,
            data.offerId,
          ],
        },
        // Ledger - Seller (Already recorded 'out' when created, now just completing)
        {
          sql: `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details, created_at)
                VALUES (?, ?, 'banana_sold', 'banana_offer', ?, ?, ?)`,
          params: [
            randomId("aud"),
            seller.id,
            data.offerId,
            JSON.stringify({ buyerId, price: offer.priceIqd }),
            now,
          ],
        },
      ]);
    } catch (err: any) {
      // Revert claim on failure
      await d1Run(
        `UPDATE banana_market_offers SET status = 'active', buyer_id = NULL WHERE id = ?`,
        data.offerId,
      );
      throw err;
    }

    await createNotification(
      seller.id,
      "تم بيع الموز!",
      `تم بيع ${offer.quantity} موزة بنجاح. أضيف ${offer.priceIqd} دينار لمحفظتك.`,
    );
    return { success: true };
  });

/**
 * Redeem a Banana Reward.
 */
export const redeemBananaReward = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(
    z.object({
      rewardId: z.string(),
    }),
  )
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const now = new Date().toISOString();

    const reward = await d1First<BananaRedemptionOffer>(
      `SELECT * FROM banana_redemption_offers WHERE id = ? AND is_active = 1`,
      data.rewardId,
    );

    if (!reward) throw new Error("Reward offer not found or inactive");
    if (reward.stock === 0) throw new Error("Out of stock");

    const user = await findUserById(userId);
    if (!user || (user.bananaBalance || 0) < reward.bananaPrice) {
      throw new Error("Insufficient banana balance");
    }

    // Atomic: Deduct Banana + Deduct Stock + Create Ledger
    await d1Batch([
      {
        sql: `UPDATE users SET banana_balance = CASE WHEN banana_balance >= ? THEN banana_balance - ? ELSE NULL END WHERE id = ?`,
        params: [reward.bananaPrice, reward.bananaPrice, userId],
      },
      {
        sql: `UPDATE banana_redemption_offers SET stock = CASE WHEN stock > 0 THEN stock - 1 ELSE stock END WHERE id = ? AND (stock > 0 OR stock = -1)`,
        params: [data.rewardId],
      },
      {
        sql: `INSERT INTO banana_ledger (id, user_id, amount, type, direction, balance_before, balance_after, reference_type, reference_id, created_at)
              VALUES (?, ?, ?, 'redemption', 'out', ?, ?, 'redemption', ?, ?)`,
        params: [
          randomId("blg"),
          userId,
          reward.bananaPrice,
          user.bananaBalance,
          (user.bananaBalance || 0) - reward.bananaPrice,
          data.rewardId,
          now,
        ],
      },
    ]);

    await createAuditLog(userId, "redeem_banana", "banana_reward", data.rewardId, null, {
      cost: reward.bananaPrice,
    });

    // Note: In a real system, we'd also trigger order creation here
    return { success: true };
  });
