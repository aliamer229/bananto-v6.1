import { createFileRoute } from "@tanstack/react-router";
import {
  adjustUserWalletBalance,
  approveRechargeRequest,
  createBananCode,
  listAllRechargeRequests,
  listAllUsers,
  listUserTransactions,
  rejectRechargeRequest,
} from "@/lib/db.server";
import { toPublicUser } from "@/lib/db.server";
import { body, guard, json } from "@/lib/http.server";
import { requireAdmin } from "@/lib/session.server";

export const Route = createFileRoute("/api/admin/users")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        guard(async () => {
          await requireAdmin(request);
          const url = new URL(request.url);
          const userId = url.searchParams.get("userId");

          if (userId) {
            const logs = await listUserTransactions(userId);
            return json({ logs });
          }

          const users = await listAllUsers();
          const rechargeRequests = await listAllRechargeRequests();
          return json({ users: users.map(toPublicUser), rechargeRequests });
        }),
      POST: async ({ request }) =>
        guard(async () => {
          await requireAdmin(request);
          const data = await body<any>(request);

          if (data.action === "adjust_balance") {
            const amount = Number(data.amount);
            if (!Number.isFinite(amount) || Math.abs(amount) > 1_000_000_000 || amount === 0) {
              return json({ error: "invalid_amount" }, { status: 400 });
            }
            try {
              const updated = await adjustUserWalletBalance(
                data.userId,
                amount,
                "admin_adjustment",
                data.description || "Admin manual adjustment",
              );
              return json({ success: !!updated, user: updated ? toPublicUser(updated) : null });
            } catch (error) {
              // A debit larger than the balance is a rejected request, not a
              // server fault; without this it surfaced as an opaque 500.
              if (error instanceof Error && /Insufficient wallet balance/.test(error.message)) {
                return json({ error: "insufficient_balance" }, { status: 400 });
              }
              throw error;
            }
          }

          if (data.action === "approve_recharge") {
            const success = await approveRechargeRequest(data.requestId, data.adminNotes);
            return json({ success });
          }

          if (data.action === "reject_recharge") {
            const success = await rejectRechargeRequest(data.requestId, data.adminNotes);
            return json({ success });
          }

          if (data.action === "create_banan_code") {
            const amount = Number(data.amount);
            if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000) {
              return json({ error: "invalid_amount" }, { status: 400 });
            }
            const code = await createBananCode(amount);
            return json({ success: true, code });
          }

          return json({ error: "Invalid action" }, { status: 400 });
        }),
    },
  },
});
