import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { d1First, d1Run, d1All, d1Batch, findUserById } from "./db.server";
import { WalletTransaction, WalletRechargeRequest, RechargeMethod } from "./types";
import { randomId } from "./crypto.server";
import { requireAppAuth } from "./auth.middleware";

export const getWalletData = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .handler(async ({ context }) => {
    const userId = context.userId;
    const user = await findUserById(userId);
    if (!user) throw new Error("User not found");

    const transactions = await d1All<WalletTransaction>(
      `SELECT * FROM wallet_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
      userId,
    );

    const pendingRequests = await d1All<WalletRechargeRequest>(
      `SELECT * FROM recharge_requests WHERE user_id = ? AND status = 'pending' ORDER BY created_at DESC`,
      userId,
    );

    return {
      balance: user.walletBalance || 0,
      transactions,
      pendingRequests,
    };
  });

export const requestRecharge = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(
    z.object({
      amount: z.number().positive(),
      method: z.enum(["zain_cash", "rafidain", "crypto", "eshop_card", "banan_code"] as const),
      proofUrl: z.string().optional(),
      eshopCode: z.string().optional(),
      bananCode: z.string().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const user = await findUserById(userId);
    if (!user) throw new Error("User not found");

    // Direct fulfillment for Banan codes
    if (data.method === "banan_code" && data.bananCode) {
      const code = await d1First<{ id: string; value: number; is_used: number }>(
        `SELECT * FROM banan_codes WHERE code = ? AND is_used = 0`,
        data.bananCode,
      );

      if (!code) throw new Error("Invalid or already used code");

      const now = new Date().toISOString();
      const transactionId = randomId("wlt");
      const balanceBefore = user.walletBalance || 0;
      const balanceAfter = balanceBefore + code.value;

      await d1Batch([
        {
          sql: `UPDATE banan_codes SET is_used = 1, used_by = ?, used_at = ? WHERE id = ?`,
          params: [userId, now, code.id],
        },
        {
          sql: `INSERT INTO wallet_transactions (id, user_id, kind, amount, description, created_at, reference_type, reference_id)
                 VALUES (?, ?, 'deposit', ?, ?, ?, 'banan_code', ?)`,
          params: [transactionId, userId, code.value, "تعبئة فورية عبر كود بنانتو", now, code.id],
        },
        {
          sql: `UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?`,
          params: [code.value, userId],
        },
        {
          sql: `INSERT INTO wallet_ledger (id, user_id, amount, type, balance_before, balance_after, reference_type, reference_id, description, created_at)
                VALUES (?, ?, ?, 'deposit', ?, ?, 'banan_code', ?, ?, ?)`,
          params: [
            randomId("wlg"),
            userId,
            code.value,
            balanceBefore,
            balanceAfter,
            code.id,
            "Instant recharge via Banan code",
            now,
          ],
        },
      ]);

      return { success: true, instant: true, amount: code.value };
    }

    // Manual review for other methods
    const requestId = randomId("req");
    await d1Run(
      `INSERT INTO recharge_requests (id, user_id, amount, method, proof_url, eshop_code, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
      requestId,
      userId,
      data.amount,
      data.method,
      data.proofUrl || null,
      data.eshopCode || null,
      new Date().toISOString(),
      new Date().toISOString(),
    );

    return { success: true, instant: false };
  });

export const getAdminRechargeRequests = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .handler(async ({ context }) => {
    const user = await findUserById(context.userId);
    if (!user?.isAdmin) throw new Error("Unauthorized");

    return d1All<WalletRechargeRequest & { userName: string }>(
      `SELECT r.*, u.name as userName FROM recharge_requests r 
       JOIN users u ON r.user_id = u.id 
       WHERE r.status = 'pending' 
       ORDER BY r.created_at ASC`,
    );
  });

export const approveRechargeRequest = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(z.object({ requestId: z.string() }))
  .handler(async ({ data, context }) => {
    const admin = await findUserById(context.userId);
    if (!admin?.isAdmin) throw new Error("Unauthorized");

    const req = await d1First<WalletRechargeRequest>(
      `SELECT * FROM recharge_requests WHERE id = ? AND status = 'pending'`,
      data.requestId,
    );

    if (!req) throw new Error("Request not found or already processed");

    const user = await findUserById(req.userId);
    if (!user) throw new Error("User not found");

    const now = new Date().toISOString();
    const transactionId = randomId("wlt");
    const balanceBefore = user.walletBalance || 0;
    const balanceAfter = balanceBefore + req.amount;

    await d1Batch([
      {
        sql: `UPDATE recharge_requests SET status = 'approved', updated_at = ? WHERE id = ?`,
        params: [now, req.id],
      },
      {
        sql: `INSERT INTO wallet_transactions (id, user_id, kind, amount, description, created_at, reference_type, reference_id)
               VALUES (?, ?, 'deposit', ?, ?, ?, 'recharge_request', ?)`,
        params: [transactionId, req.userId, req.amount, `شحن رصيد (${req.method})`, now, req.id],
      },
      {
        sql: `UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?`,
        params: [req.amount, req.userId],
      },
      {
        sql: `INSERT INTO wallet_ledger (id, user_id, amount, type, balance_before, balance_after, reference_type, reference_id, description, created_at)
              VALUES (?, ?, ?, 'deposit', ?, ?, 'recharge_request', ?, ?, ?)`,
        params: [
          randomId("wlg"),
          req.userId,
          req.amount,
          balanceBefore,
          balanceAfter,
          req.id,
          `Manual recharge approval: ${req.method}`,
          now,
        ],
      },
    ]);

    return { success: true };
  });
