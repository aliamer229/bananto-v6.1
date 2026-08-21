import { createFileRoute } from "@tanstack/react-router";
import { body, guard, json } from "@/lib/http.server";
import { requireAdmin, requireUser } from "@/lib/session.server";
import { d1All, d1First, d1Run, ensureSchema } from "@/lib/d1.server";
import { d1Batch } from "@/lib/db.server";
import { randomId } from "@/lib/crypto.server";
import {
  computeTradeValue,
  canTransition,
  normalizeTradeStatus,
  type TradeRule,
  type TradeStatus,
} from "@/lib/trade-calc";
import {
  backfillCanonicalIds,
  getGame,
  listTradeRules,
  matchGame,
} from "@/lib/game-catalog.server";
import { redactDiscTradeForMember } from "@/lib/redaction";

interface TradeBody extends Record<string, unknown> {
  action?: string;
}

const now = () => new Date().toISOString();

async function notify(text: string, userId?: string) {
  try {
    const { sendTelegramMessage } = await import("@/lib/telegram.server");
    const { d1First } = await import("@/lib/d1.server");

    let chatId: string | undefined;
    if (userId) {
      const link = await d1First<{ telegram_chat_id: number }>(
        "SELECT telegram_chat_id FROM telegram_links WHERE user_id = ?",
        userId,
      );
      if (link) chatId = String(link.telegram_chat_id);
    }

    if (chatId) {
      await sendTelegramMessage(chatId, text);
    }
  } catch {
    // Notifications must never break the trade lifecycle.
  }
}

async function appendStatus(tradeId: string, status: string, actor: string, note?: string) {
  const normStatus = normalizeTradeStatus(status);
  const row = await d1First<{ status_history: string | null }>(
    `SELECT status_history FROM disc_trades WHERE id = ?`,
    tradeId,
  );
  let history: unknown[] = [];
  try {
    history = JSON.parse(row?.status_history || "[]");
  } catch {
    history = [];
  }
  history.push({ status: normStatus, at: now(), actor, note: note ?? null });
  await d1Run(
    `UPDATE disc_trades SET status = ?, status_history = ?, updated_at = ? WHERE id = ?`,
    normStatus,
    JSON.stringify(history),
    now(),
    tradeId,
  );
  await d1Run(
    `INSERT INTO delivery_events (id, context_kind, context_id, event, actor, note, created_at)
     VALUES (?,?,?,?,?,?,?)`,
    randomId("dev"),
    "trade",
    tradeId,
    `status:${normStatus}`,
    actor,
    note ?? null,
    now(),
  );
}

export const Route = createFileRoute("/api/disc-trade")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        guard(async () => {
          await ensureSchema();
          const url = new URL(request.url);
          const scope = url.searchParams.get("scope") || "mine";

          if (scope === "rules") return json({ rules: await listTradeRules() });

          if (scope === "admin") {
            await requireAdmin(request);
            const rawStatus = url.searchParams.get("status") || "";
            const filterStatus = rawStatus ? normalizeTradeStatus(rawStatus) : "";
            const rows = filterStatus
              ? await d1All<Record<string, any>>(
                  `SELECT * FROM disc_trades WHERE status = ? OR (status = 'pending' AND ? = 'waiting_review') ORDER BY created_at DESC LIMIT 200`,
                  filterStatus,
                  filterStatus,
                )
              : await d1All<Record<string, any>>(
                  `SELECT * FROM disc_trades ORDER BY created_at DESC LIMIT 200`,
                );

            const normalizedRows = rows.map((r) => ({
              ...r,
              status: normalizeTradeStatus(r.status),
            }));
            return json({ items: normalizedRows });
          }

          const user = await requireUser(request);
          const trades = await d1All<Record<string, any>>(
            `SELECT dt.*, gc.title AS catalog_title, gc.trade_value_iqd AS official_valuation, gc.store_offer_bonus_iqd AS catalog_bonus_iqd, gc.cover_url
             FROM disc_trades dt
             LEFT JOIN game_catalog gc ON gc.game_id = dt.game_id
             WHERE dt.user_id = ? ORDER BY dt.created_at DESC`,
            user.id,
          );
          const normalizedTrades = trades.map((t) => ({
            ...redactDiscTradeForMember(t),
            status: normalizeTradeStatus(t.status),
          }));
          return json({ items: normalizedTrades });
        }),

      POST: async ({ request }) =>
        guard(async () => {
          await ensureSchema();
          await backfillCanonicalIds();
          const data = await body<TradeBody>(request);
          const action = String(data.action || "submit");

          /* ---------------- quote: deterministic, no AI, no network -------- */
          if (action === "quote") {
            const isCustom = data["is_custom"] === true || data["game_id"] === "custom";
            if (isCustom) {
              return json({
                matched: false,
                is_custom: true,
                priced: false,
                message: "السعر بعد المراجعة من قبل الإدارة",
              });
            }

            const rules = (await listTradeRules()) as unknown as TradeRule[];
            let gameId = String(data["game_id"] || "");
            if (!gameId && data["game_name"]) {
              const match = await matchGame(String(data["game_name"]));
              if (!match) {
                return json({
                  matched: false,
                  priced: false,
                  message: "لم يتم العثور على اللعبة في القائمة الرسمية (السعر بعد المراجعة).",
                });
              }
              gameId = match.game_id;
            }
            const game = gameId ? await getGame(gameId) : undefined;
            if (!game) {
              return json({
                matched: false,
                priced: false,
                message: "اللعبة غير موجودة في القائمة التلقائية (السعر بعد المراجعة)",
              });
            }

            // Check if game is disabled for trades
            if (game.trade_enabled === 0) {
              return json({
                matched: true,
                game,
                priced: false,
                trade_enabled: false,
                message: "المقايضة غير متاحة لهذه اللعبة حالياً بقرار من الإدارة.",
              });
            }

            const base = Number(game.trade_value_iqd || 0);
            if (!base) {
              return json({
                matched: true,
                game,
                priced: false,
                message: "لم يتم اعتماد سعر مقايضة لهذه اللعبة بعد (السعر بعد المراجعة).",
              });
            }
            const selections = (data["selections"] as Record<string, string>) || {};
            const result = computeTradeValue(base, selections, rules);
            const bonusIqd = Number(game.store_offer_bonus_iqd || 0);
            const storeOfferTotal = result.final_iqd + bonusIqd;

            return json({
              matched: true,
              priced: true,
              trade_enabled: true,
              game,
              quote: {
                ...result,
                store_offer_bonus_iqd: bonusIqd,
                store_offer_total_iqd: storeOfferTotal,
              },
            });
          }

          /* ---------------- user actions ----------------------------------- */
          if (action === "cancel" || action === "user_cancel") {
            const user = await requireUser(request);
            const tradeId = String(data["trade_id"] || "");
            const trade = await d1First<{ status: string; user_id: string }>(
              `SELECT status, user_id FROM disc_trades WHERE id = ?`,
              tradeId,
            );
            if (!trade || trade.user_id !== user.id)
              return json({ error: "غير مسموح" }, { status: 403 });

            const currentNormStatus = normalizeTradeStatus(trade.status);
            if (!canTransition(currentNormStatus, "cancelled"))
              return json({ error: "لا يمكن الإلغاء في هذه المرحلة" }, { status: 400 });

            await appendStatus(tradeId, "cancelled", user.id, "ملغاة من قبل العميل");
            return json({ success: true });
          }

          if (action === "accept" || action === "accept_offer") {
            const user = await requireUser(request);
            const tradeId = String(data["trade_id"] || "");
            const payout = String(data["payout_type"] || "store_credit");
            const trade = await d1First<{ status: string; user_id: string }>(
              `SELECT status, user_id FROM disc_trades WHERE id = ?`,
              tradeId,
            );
            if (!trade || trade.user_id !== user.id)
              return json({ error: "غير مسموح" }, { status: 403 });

            const currentNormStatus = normalizeTradeStatus(trade.status);
            if (
              !canTransition(currentNormStatus, "waiting_shipment") &&
              currentNormStatus !== "waiting_review"
            )
              return json({ error: "لا يمكن قبول العرض الآن" }, { status: 400 });

            await d1Run(`UPDATE disc_trades SET payout_type = ? WHERE id = ?`, payout, tradeId);
            await appendStatus(tradeId, "waiting_shipment", user.id, `payout:${payout}`);
            await notify(`🔄 المستخدم قبل عرض المقايضة ${tradeId} (${payout})`);
            return json({ success: true });
          }

          /* ---------------- admin transitions ------------------------------ */
          if (action === "admin_update") {
            const admin = await requireAdmin(request);
            const tradeId = String(data["trade_id"] || "");
            const trade = await d1First<{
              id: string;
              status: string;
              user_id: string;
              valuation_iqd: number | null;
              final_iqd: number | null;
              admin_valuation_iqd: number | null;
              payout_credited: number | null;
              preferred_trade: string | null;
              payout_type: string | null;
            }>(
              `SELECT id, status, user_id, valuation_iqd, final_iqd, admin_valuation_iqd, payout_credited, preferred_trade, payout_type FROM disc_trades WHERE id = ?`,
              tradeId,
            );
            if (!trade) return json({ error: "طلب المقايضة غير موجود" }, { status: 404 });

            const actor = String((admin as { email?: string }).email ?? "admin");
            const currentNormStatus = normalizeTradeStatus(trade.status);

            if (data["admin_valuation_iqd"] !== undefined) {
              await d1Run(
                `UPDATE disc_trades SET admin_valuation_iqd = ?, updated_at = ? WHERE id = ?`,
                Number(data["admin_valuation_iqd"] || 0),
                now(),
                tradeId,
              );
            }
            if (data["admin_notes"] !== undefined) {
              await d1Run(
                `UPDATE disc_trades SET admin_notes = ?, updated_at = ? WHERE id = ?`,
                String(data["admin_notes"] ?? ""),
                now(),
                tradeId,
              );
            }

            const rawNext = data["status"] ? String(data["status"]).trim() : "";
            if (rawNext && rawNext !== trade.status && rawNext !== currentNormStatus) {
              const next = normalizeTradeStatus(rawNext);
              if (!canTransition(currentNormStatus, next, true)) {
                return json(
                  { error: `انتقال غير مسموح: ${currentNormStatus} → ${next}` },
                  { status: 400 },
                );
              }
              await appendStatus(
                tradeId,
                next,
                actor,
                data["note"] ? String(data["note"]) : undefined,
              );
              await notify(`🔄 تحديث حالة المقايضة ${tradeId}: ${next}`, trade.user_id);

              // If status transitioned to payout_processing, process wallet payout idempotently
              if (next === "payout_processing" && !trade.payout_credited) {
                const creditAmount = Math.max(
                  0,
                  Math.round(
                    Number(
                      data["admin_valuation_iqd"] ??
                        trade.admin_valuation_iqd ??
                        trade.final_iqd ??
                        trade.valuation_iqd ??
                        0,
                    ),
                  ),
                );

                if (creditAmount > 0) {
                  try {
                    // Execute atomic batch: Mark trade as credited, insert transaction, update wallet
                    await d1Batch([
                      {
                        sql: `INSERT INTO wallet_transactions (id, user_id, amount, kind, description, order_id, created_at, reference_type, reference_id)
                              VALUES (?, ?, ?, 'disc_trade_payout', ?, ?, ?, 'disc_trade', ?)`,
                        params: [
                          randomId("wtx"),
                          trade.user_id,
                          creditAmount,
                          `استحقاق مقايضة شريط ألعاب #${trade.id.slice(-6)}`,
                          trade.id,
                          now(),
                          trade.id,
                        ],
                      },
                      {
                        sql: `UPDATE users SET wallet_balance = COALESCE(wallet_balance, 0) + ? WHERE id = ?`,
                        params: [creditAmount, trade.user_id],
                      },
                      {
                        sql: `UPDATE disc_trades SET payout_credited = 1, payout_credited_at = ?, payout_amount_credited = ? WHERE id = ? AND (payout_credited IS NULL OR payout_credited = 0)`,
                        params: [now(), creditAmount, trade.id],
                      },
                    ]);

                    await appendStatus(tradeId, "completed", "system", "تم الدفع تلقائياً");
                    await notify(
                      `🎉 تم إيداع رصيد المقايضة (${creditAmount.toLocaleString()} د.ع) في محفظتك بنجاح!`,
                      trade.user_id,
                    );
                  } catch (walletErr: any) {
                    if (
                      walletErr.message?.includes("UNIQUE constraint failed") ||
                      walletErr.message?.includes("wallet_transactions_ref_idx")
                    ) {
                      // Already processed by a concurrent request. Safe to ignore.
                      console.log("Payout already processed for trade concurrently", trade.id);
                    } else {
                      console.error("Wallet payout credit error:", walletErr);
                      throw walletErr; // Bubble up unexpected errors
                    }
                  }
                } else {
                  // No payout needed, just mark completed
                  await appendStatus(tradeId, "completed", "system", "لا يوجد مبلغ للدفع");
                }
              }
            }
            return json({ success: true });
          }

          /* ---------------- submit ----------------------------------------- */
          const user = await requireUser(request);
          const gameName = String(data["game_name"] || "").trim();
          // A missing field is a bad request, not a server fault; throwing here
          // reached the caller as an opaque 500 with a `server_error` body.
          if (!gameName) return json({ error: "اسم اللعبة مطلوب" }, { status: 400 });

          const isCustom = data["is_custom"] === true || data["game_id"] === "custom";
          let gameId = isCustom ? "" : String(data["game_id"] || "");
          if (!gameId && !isCustom) {
            const match = await matchGame(gameName);
            gameId = match?.game_id ?? "";
          }
          const game = gameId ? await getGame(gameId) : undefined;

          if (game && game.trade_enabled === 0) {
            return json(
              {
                error: "المقايضة غير متاحة لهذه اللعبة حالياً",
                trade_enabled: false,
              },
              { status: 400 },
            );
          }

          const selections = (data["selections"] as Record<string, string>) || {};
          const rules = (await listTradeRules()) as unknown as TradeRule[];
          const base = !isCustom && game ? Number(game?.trade_value_iqd || 0) : 0;
          const bonusIqd = !isCustom && game ? Number(game?.store_offer_bonus_iqd || 0) : 0;
          const quote = base ? computeTradeValue(base, selections, rules) : null;
          const storeOfferTotal = quote ? quote.final_iqd + bonusIqd : null;
          const platform = String(data["platform"] || game?.platform || "Nintendo Switch");

          const tradeId = randomId("trade");
          const stamp = now();
          await d1Run(
            `INSERT INTO disc_trades
              (id, user_id, game_id, game_name, platform, condition, notes, photo_url, preferred_trade,
               selections, base_iqd, final_iqd, valuation_iqd, store_offer_bonus_iqd, store_offer_total_iqd,
               status, status_history, created_at, updated_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            tradeId,
            user.id,
            gameId || null,
            game?.title ?? gameName,
            platform,
            String(data["condition"] || "like_new"),
            data["notes"] ? String(data["notes"]) : null,
            data["photo_url"] ? String(data["photo_url"]) : null,
            data["payout_type"] ? String(data["payout_type"]) : null,
            JSON.stringify(selections),
            quote?.base_iqd ?? null,
            quote?.final_iqd ?? null,
            quote?.final_iqd ?? null,
            bonusIqd,
            storeOfferTotal,
            "waiting_review",
            JSON.stringify([{ status: "waiting_review", at: stamp, actor: user.id }]),
            stamp,
            stamp,
          );

          const images = Array.isArray(data["images"])
            ? (data["images"] as { kind?: string; url: string }[])
            : [];
          for (const img of images) {
            if (!img?.url) continue;
            await d1Run(
              `INSERT INTO disc_trade_images (id, trade_id, kind, url, created_at) VALUES (?,?,?,?,?)`,
              randomId("dti"),
              tradeId,
              img.kind || "other",
              img.url,
              stamp,
            );
          }

          // Notify Admin in Telegram with MiniApp Deep Link
          try {
            const { notifyAdminDiscTrade } = await import("@/lib/telegram-notifications.server");
            await notifyAdminDiscTrade({
              tradeId,
              gameName: game?.title ?? gameName,
              platform,
              finalIqd: quote?.final_iqd,
              isCustom,
              user: { id: user.id, name: user.name, phone: user.phone },
            });
          } catch (err) {
            console.warn("Failed to notify admin on disc trade", err);
          }

          return json({ success: true, id: tradeId, quote, is_custom: isCustom });
        }),
    },
  },
});
