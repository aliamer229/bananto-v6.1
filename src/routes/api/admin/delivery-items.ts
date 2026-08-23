/**
 * Draft and status for each line of a digital order.
 *
 * The delivery tool autosaves here as the admin types, and reads back from here
 * when it opens, so the work survives a refresh, a closed tab, or a second
 * admin picking the order up on another machine. D1 is the source of truth;
 * the modal's React state is a view of it.
 *
 * Staff only, and nothing here is logged beyond ids and statuses — a row holds
 * the customer's account password.
 */
import { createFileRoute } from "@tanstack/react-router";

import { body, guard, json } from "@/lib/http.server";
import { requireAdmin } from "@/lib/session.server";
import { getOrder } from "@/lib/db.server";
import {
  listDeliveryItems,
  markDeliveryOtpSent,
  markDeliveryProofReceived,
  markDeliverySent,
  saveDeliveryDraft,
} from "@/lib/delivery-items.server";
import { summarizeDeliveryProgress } from "@/lib/delivery-items";
import { orderItemTitleOf } from "@/lib/order-item-title";

interface DeliveryItemsBody {
  orderId?: string;
  itemId?: string;
  action?: "save_draft" | "mark_sent" | "mark_proof" | "mark_otp";
  productId?: string | null;
  username?: string | null;
  password?: string | null;
  needsMapping?: boolean;
  /** Idempotency key for `mark_sent`. */
  sendKey?: string;
}

export const Route = createFileRoute("/api/admin/delivery-items")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        guard(async () => {
          await requireAdmin(request);
          const url = new URL(request.url);
          const orderId = url.searchParams.get("orderId") ?? "";
          if (!orderId) return json({ error: "missing_order_id" }, { status: 400 });

          const order = await getOrder(orderId);
          const items = await listDeliveryItems(orderId);

          /*
            The lines the admin has to deliver come from the order, not from
            whatever rows happen to exist — a line nobody has typed into yet
            still has to appear, or the count on screen would not match the work.
          */
          const lines = (order?.items ?? []).map((item) => {
            const row = items.find((entry) => entry.itemId === item.id);
            return {
              itemId: item.id,
              productId: item.productId === undefined ? null : String(item.productId),
              title: orderItemTitleOf(item),
              quantity: item.quantity ?? 1,
              status: row?.status ?? "draft",
              username: row?.username ?? "",
              password: row?.password ?? "",
              needsMapping: row?.needsMapping ?? false,
              sentAt: row?.sentAt ?? null,
              proofReceivedAt: row?.proofReceivedAt ?? null,
              otpSentAt: row?.otpSentAt ?? null,
              completedAt: row?.completedAt ?? null,
            };
          });

          return json({
            success: true,
            orderId,
            items: lines,
            progress: summarizeDeliveryProgress(lines, lines.length),
          });
        }),

      POST: async ({ request }) =>
        guard(async () => {
          await requireAdmin(request);
          const data = await body<DeliveryItemsBody>(request);
          const orderId = String(data.orderId ?? "").trim();
          const itemId = String(data.itemId ?? "").trim();
          if (!orderId || !itemId) {
            return json({ error: "missing_ids" }, { status: 400 });
          }

          // The line has to belong to the order. Server-side, always.
          const order = await getOrder(orderId);
          if (!order) return json({ error: "order_not_found" }, { status: 404 });
          if (!order.items.some((item) => item.id === itemId)) {
            return json({ error: "item_not_in_order" }, { status: 400 });
          }

          switch (data.action) {
            case "mark_sent": {
              const result = await markDeliverySent(orderId, itemId, data.sendKey);
              if (!result.ok) {
                return json(
                  { error: result.reason ?? "send_failed", item: result.item ?? null },
                  { status: result.reason === "incomplete" ? 400 : 404 },
                );
              }
              return json({
                success: true,
                item: result.item,
                duplicate: Boolean(result.duplicate),
              });
            }
            case "mark_proof":
              return json({
                success: true,
                item: await markDeliveryProofReceived(orderId, itemId),
              });
            case "mark_otp":
              return json({ success: true, item: await markDeliveryOtpSent(orderId, itemId) });
            case "save_draft":
            case undefined: {
              const saved = await saveDeliveryDraft({
                orderId,
                itemId,
                productId: data.productId ?? null,
                username: data.username ?? "",
                password: data.password ?? "",
                needsMapping: Boolean(data.needsMapping),
              });
              return json({ success: true, item: saved });
            }
            default:
              return json({ error: "unknown_action" }, { status: 400 });
          }
        }),
    },
  },
});
