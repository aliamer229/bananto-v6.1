import {
  d1All,
  d1First,
  d1Run,
  d1Batch,
  randomId,
  createAuditLog,
  createNotification,
} from "./db.server";
import type { BananaBot, BananaMarketOffer } from "./types";

/**
 * Worker function to process automated Banana Market trades by bots.
 * To be called by a Cloudflare Worker CRON.
 */
export async function processBotTrading() {
  const now = new Date().toISOString();

  // 1. Get active bots
  const bots = await d1All<BananaBot>(`SELECT * FROM banana_bots WHERE is_active = 1`);
  if (!bots.length) return;

  // 2. Get current market price
  const marketPriceRow = await d1First<{ new_price: number }>(
    `SELECT new_price FROM banana_price_history ORDER BY created_at DESC LIMIT 1`,
  );
  const marketPrice = marketPriceRow?.new_price || 0.005;

  for (const bot of bots) {
    // 3. Find cheap offers from users (Anti-Fraud: Check seller is not another bot)
    const offers = await d1All<BananaMarketOffer>(
      `SELECT o.* FROM banana_market_offers o
       LEFT JOIN banana_bots b ON o.user_id = b.id
       WHERE o.status = 'active' AND b.id IS NULL
       AND o.price_iqd <= ?`,
      marketPrice,
    );

    for (const offer of offers) {
      // Logic for price deviation and waiting period
      const deviation = (marketPrice - offer.priceIqd) / marketPrice;
      const waitingMinutes = Math.max(10, 60 - deviation * 100); // 50% less -> 10min, 10% less -> 50min

      const offerTime = new Date(offer.createdAt).getTime();
      const nowTime = Date.now();

      if (nowTime - offerTime > waitingMinutes * 60 * 1000) {
        // Atomic Trade Execution
        try {
          await executeBotPurchase(bot, offer, now);
        } catch (e) {
          console.error(`Bot ${bot.name} failed to buy offer ${offer.id}:`, e);
        }
      }
    }
  }
}

async function executeBotPurchase(bot: BananaBot, offer: BananaMarketOffer, now: string) {
  // Budget & Limit checks
  if (bot.budgetIqd < offer.priceIqd) return;
  if (bot.maxTradeBanana && offer.quantity > bot.maxTradeBanana) return;

  // 1. Atomically Claim the offer first for the bot
  const claimRes = await d1Run(
    `UPDATE banana_market_offers SET status = 'processing', updated_at = ? WHERE id = ? AND status = 'active'`,
    now,
    offer.id,
  );

  if (claimRes.meta.changes === 0) {
    return; // Already taken
  }

  try {
    await d1Batch([
      // Bot Deduct Budget
      {
        sql: `UPDATE banana_bots SET budget_iqd = budget_iqd - ?, updated_at = ? WHERE id = ? AND budget_iqd >= ?`,
        params: [offer.priceIqd, now, bot.id, offer.priceIqd],
      },
      // Seller Add IQD (Wallet)
      {
        sql: `UPDATE users SET wallet_balance = COALESCE(wallet_balance, 0) + ? WHERE id = ?`,
        params: [offer.priceIqd, offer.userId],
      },
      // Financial Ledger - Seller IQD
      {
        sql: `INSERT INTO wallet_transactions (id, user_id, kind, amount, description, created_at, reference_type, reference_id)
               VALUES (?, ?, 'deposit', ?, ?, ?, 'banana_market', ?)`,
        params: [
          randomId("wtx"),
          offer.userId,
          offer.priceIqd,
          `مبيعات سوق الموز: ${offer.quantity} موزة`,
          now,
          offer.id,
        ],
      },
      // Seller Deduct Locked Banana
      {
        sql: `UPDATE users SET banana_locked = CASE WHEN banana_locked >= ? THEN banana_locked - ? ELSE NULL END WHERE id = ?`,
        params: [offer.lockedBanana, offer.lockedBanana, offer.userId],
      },
      // Close Offer
      {
        sql: `UPDATE banana_market_offers SET status = 'sold', updated_at = ? WHERE id = ? AND status = 'processing'`,
        params: [now, offer.id],
      },
      // Bot Log
      {
        sql: `INSERT INTO bot_activity_logs (id, bot_id, action, details, created_at)
              VALUES (?, ?, 'purchase', ?, ?)`,
        params: [
          randomId("bal"),
          bot.id,
          JSON.stringify({ offerId: offer.id, price: offer.priceIqd, quantity: offer.quantity }),
          now,
        ],
      },
    ]);
  } catch (err) {
    // Revert claim on failure
    await d1Run(`UPDATE banana_market_offers SET status = 'active' WHERE id = ?`, offer.id);
    throw err;
  }

  await createNotification(
    offer.userId,
    "تم بيع الموز لبوت!",
    `قام ${bot.name} بشراء ${offer.quantity} موزة منك.`,
  );
}

/**
 * Worker function for automated reviews and delivery confirmations.
 */
export async function processAutoScheduledTasks() {
  const now = new Date().toISOString();

  // 1. Auto Review (Pending reviews due for auto-completion)
  const pendingReviews = await d1All<{ id: string }>(
    `SELECT id FROM product_reviews WHERE status = 'pending' AND review_due_at <= ? AND is_auto_review = 0`,
    now,
  );

  for (const rev of pendingReviews) {
    await d1Run(
      `UPDATE product_reviews SET status = 'approved', rating = 5, comment = 'Auto Review', is_auto_review = 1, approved_at = ?, approved_by = 'system', updated_at = ? WHERE id = ?`,
      now,
      now,
      rev.id,
    );
  }

  // 2. Disc Trade Inactivity (7d after creation if still pending/not shipped)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  await d1Run(
    `UPDATE disc_trades SET status = 'cancelled', updated_at = ? WHERE status = 'pending' AND created_at <= ?`,
    now,
    sevenDaysAgo,
  );
}
