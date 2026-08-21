import { createFileRoute } from "@tanstack/react-router";

import {
  approveRechargeRequest,
  getRechargeRequestWithUser,
  listAllRechargeRequests,
} from "@/lib/db.server";
import { rejectRechargeRequest } from "@/lib/db.server";
import { body, guard, json } from "@/lib/http.server";
import { isTelegramAdmin } from "@/lib/telegram-admin.server";
import { verifyTelegramInitData } from "@/lib/telegram.server";
import { readBinaryStream } from "@/lib/storage.server";

/**
 * Wallet review for the operator inside the Telegram Mini App.
 *
 * This endpoint exists because the operator reviewing a receipt on their phone
 * is not signed in to the website, so it cannot lean on the site session. It
 * authenticates the launch itself: Telegram signs `initData` with the bot
 * token, the signature is verified server-side, and the verified user id is
 * then checked against the operator list. Nothing here trusts a value the
 * client could choose — not a user id in the body, not a header, not a cookie.
 *
 * It deliberately exposes only what a review needs, and only to an operator.
 */
async function requireTelegramAdmin(
  initData: unknown,
): Promise<{ ok: true; telegramUserId: number; name: string } | { ok: false; response: Response }> {
  const raw = typeof initData === "string" ? initData : "";
  const verified = await verifyTelegramInitData(raw);
  if (!verified.valid || !verified.user) {
    return {
      ok: false,
      response: json({ error: "invalid_launch", reason: verified.reason }, { status: 401 }),
    };
  }
  if (!isTelegramAdmin(verified.user.id)) {
    // Same answer a stranger gets for a request that does not exist: an
    // operator-only surface should not confirm its own existence.
    return { ok: false, response: json({ error: "not_found" }, { status: 404 }) };
  }
  const name = [
    verified.user.first_name,
    verified.user.username ? `@${verified.user.username}` : "",
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
  return { ok: true, telegramUserId: verified.user.id, name };
}

export const Route = createFileRoute("/api/public/telegram/wallet-review")({
  server: {
    handlers: {
      /**
       * The payment receipt itself.
       *
       * An <img> cannot carry a POST body, and the operator has no site cookie
       * inside the Mini App, so the signed launch payload travels in the query
       * string and is verified exactly as it is on the POST side. The bytes are
       * served only for the proof attached to the named request, so a verified
       * operator cannot walk the private file store through this route.
       */
      GET: async ({ request }) =>
        guard(async () => {
          const url = new URL(request.url);
          const auth = await requireTelegramAdmin(url.searchParams.get("initData"));
          if (!auth.ok) return auth.response;

          const requestId = url.searchParams.get("requestId") ?? "";
          if (!requestId) return json({ error: "missing_request" }, { status: 400 });

          const found = await getRechargeRequestWithUser(requestId);
          const proofUrl = found?.proofUrl ?? "";
          const match =
            /^\/api\/files\/((?:[a-z0-9_-]{1,64}\/)*[a-z0-9_-]{1,96}\.(?:png|jpe?g|webp))$/i.exec(
              proofUrl,
            );
          if (!match) return json({ error: "not_found" }, { status: 404 });

          const file = await readBinaryStream(`files/${match[1]}`);
          if (!file) return json({ error: "not_found" }, { status: 404 });

          const headers = {
            "content-type": file.mime,
            "cache-control": "private, no-store",
            "x-content-type-options": "nosniff",
            "content-security-policy": "default-src 'none'; sandbox",
          };
          if (file.stream) return new Response(file.stream as unknown as BodyInit, { headers });
          if (file.bytes) return new Response(file.bytes as unknown as BodyInit, { headers });
          return json({ error: "not_found" }, { status: 404 });
        }),

      POST: async ({ request }) =>
        guard(async () => {
          const data = await body<{
            initData?: string;
            action?: "list" | "get" | "approve" | "reject";
            requestId?: string;
            notes?: string;
          }>(request);

          const auth = await requireTelegramAdmin(data.initData);
          if (!auth.ok) return auth.response;

          const reviewer = {
            id: `telegram:${auth.telegramUserId}`,
            ...(auth.name ? { name: auth.name } : {}),
            source: "telegram",
            ...(typeof data.notes === "string" && data.notes.trim()
              ? { notes: data.notes.trim().slice(0, 500) }
              : {}),
          };

          if (data.action === "get") {
            if (!data.requestId) return json({ error: "missing_request" }, { status: 400 });
            const found = await getRechargeRequestWithUser(data.requestId);
            if (!found) return json({ error: "not_found" }, { status: 404 });
            return json({ request: found });
          }

          if (data.action === "approve" || data.action === "reject") {
            if (!data.requestId) return json({ error: "missing_request" }, { status: 400 });
            const result =
              data.action === "approve"
                ? await approveRechargeRequest(data.requestId, reviewer)
                : await rejectRechargeRequest(data.requestId, reviewer);
            if (!result.ok) {
              const status = result.reason === "not_found" ? 404 : 409;
              return json(
                { success: false, error: result.reason ?? "failed", request: result.request },
                { status },
              );
            }
            return json({
              success: true,
              request: result.request,
              creditedAmount: result.creditedAmount,
              balance: result.balance,
            });
          }

          // Default: the review queue, newest first, with settled requests kept
          // so the operator can see what was already decided.
          const requests = await listAllRechargeRequests({ limit: 60 });
          return json({
            requests,
            pending: requests.filter((entry) => entry.status === "pending").length,
          });
        }),
    },
  },
});
