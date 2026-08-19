import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  d1All,
  d1First,
  d1Run,
  randomId,
  createAuditLog,
  createNotification,
  findUserById,
  getStore,
} from "./db.server";
import { requireAppAuth, requireAdmin } from "./auth.middleware";
import type { GameRequest, DiscTrade, DiscTradeStatus } from "./types";

/**
 * Submit a request for a game not in the catalog.
 */
export const submitGameRequest = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(
    z.object({
      gameName: z.string().min(2),
      edition: z.string().optional(),
      platform: z.string().optional(),
      imageUrl: z.string().optional(),
      notes: z.string().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const now = new Date().toISOString();

    // Check if game exists in catalog already
    const store = await getStore();
    const existing = store.products.find((p) =>
      p.title.toLowerCase().includes(data.gameName.toLowerCase()),
    );

    if (existing) {
      return {
        success: false,
        existingGameId: String(existing.id),
      };
    }

    const requestId = randomId("grq");
    await d1Run(
      `INSERT INTO game_requests (id, user_id, game_name, edition, platform, image_url, notes, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
      requestId,
      userId,
      data.gameName,
      data.edition || null,
      data.platform || "Nintendo Switch",
      data.imageUrl || null,
      data.notes || null,
      now,
      now,
    );

    // Notify Admins
    await createAuditLog(userId, "game_request", "game_request", requestId);

    return { success: true, requestId };
  });

/**
 * Submit a disc trade-in request.
 */
export const submitDiscTrade = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(
    z.object({
      gameName: z.string(),
      platform: z.string(),
      condition: z.string(),
      boxCondition: z.string().optional(),
      region: z.string().optional(),
      accessories: z.array(z.string()).optional(),
      damage: z.string().optional(),
      photoUrl: z.string().optional(),
      notes: z.string().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const now = new Date().toISOString();
    const tradeId = randomId("trd");

    // Simple estimation logic (could be more complex)
    const estimatedPrice = 25000; // Placeholder base price

    const statusHistory = [
      { status: "pending" as DiscTradeStatus, at: now, note: "تم تقديم الطلب" },
    ];

    await d1Run(
      `INSERT INTO disc_trades (id, user_id, game_name, platform, condition, box_condition, region, accessories, damage, photo_url, notes, status, base_iqd, status_history, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
      tradeId,
      userId,
      data.gameName,
      data.platform,
      data.condition,
      data.boxCondition || null,
      data.region || null,
      JSON.stringify(data.accessories || []),
      data.damage || null,
      data.photoUrl || null,
      data.notes || null,
      estimatedPrice,
      JSON.stringify(statusHistory),
      now,
      now,
    );

    await createAuditLog(userId, "submit_disc_trade", "disc_trade", tradeId);
    return { success: true, tradeId, estimatedPrice };
  });

/**
 * Admin: Send an offer for a disc trade.
 */
export const sendTradeOffer = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(
    z.object({
      tradeId: z.string(),
      valuationIqd: z.number().positive(),
      adminNotes: z.string().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const adminId = context.userId;
    const now = new Date().toISOString();

    const trade = await d1First<DiscTrade>(
      `SELECT * FROM disc_trades WHERE id = ? AND status = 'pending'`,
      data.tradeId,
    );

    if (!trade) throw new Error("Trade request not found or already processed");

    const history =
      typeof trade.statusHistory === "string"
        ? JSON.parse(trade.statusHistory)
        : trade.statusHistory;
    history.push({ status: "offer_sent", at: now, note: "تم إرسال عرض سعري من قبل الإدارة" });

    await d1Run(
      `UPDATE disc_trades SET status = 'offer_sent', admin_valuation_iqd = ?, admin_notes = ?, status_history = ?, updated_at = ? WHERE id = ?`,
      data.valuationIqd,
      data.adminNotes || null,
      JSON.stringify(history),
      now,
      data.tradeId,
    );

    await createNotification(
      trade.userId,
      "عرض سعري جديد",
      `لقد استلمت عرضاً بقيمة ${data.valuationIqd} IQD لمقايضة قرصك.`,
    );
    await createAuditLog(
      adminId,
      "send_trade_offer",
      "disc_trade",
      data.tradeId,
      { oldStatus: "pending" },
      { newStatus: "offer_sent", price: data.valuationIqd },
    );

    return { success: true };
  });

/**
 * User: Accept or reject a trade offer.
 */
export const respondToTradeOffer = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(
    z.object({
      tradeId: z.string(),
      accept: z.boolean(),
      shippingOption: z.enum(["dropoff", "courier"]).optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const now = new Date().toISOString();

    const trade = await d1First<DiscTrade>(
      `SELECT * FROM disc_trades WHERE id = ? AND user_id = ? AND status = 'offer_sent'`,
      data.tradeId,
      userId,
    );

    if (!trade) throw new Error("Trade offer not found or expired");

    const nextStatus = data.accept ? "user_approved" : "cancelled_by_user";
    const history =
      typeof trade.statusHistory === "string"
        ? JSON.parse(trade.statusHistory)
        : trade.statusHistory;
    history.push({
      status: nextStatus,
      at: now,
      note: data.accept ? "وافق المستخدم على العرض" : "رفض المستخدم العرض",
    });

    await d1Run(
      `UPDATE disc_trades SET status = ?, shipping_option = ?, status_history = ?, updated_at = ? WHERE id = ?`,
      nextStatus,
      data.shippingOption || null,
      JSON.stringify(history),
      now,
      data.tradeId,
    );

    await createAuditLog(userId, "respond_to_trade", "disc_trade", data.tradeId, {
      accept: data.accept,
    });
    return { success: true };
  });
