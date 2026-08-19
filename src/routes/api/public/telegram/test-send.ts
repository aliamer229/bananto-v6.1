import { createFileRoute } from "@tanstack/react-router";
import { d1First } from "@/lib/d1.server";
import { sendTelegramMessage, telegramConfigured } from "@/lib/telegram.server";
import { assertDiagnosticSecret } from "./diagnostic";
import { body } from "@/lib/http.server";

/**
 * Sends a single test message to a chat id (or to the chat linked to a phone).
 * Protected by DIAGNOSTIC_SECRET; never returns credentials.
 */
export const Route = createFileRoute("/api/public/telegram/test-send")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = assertDiagnosticSecret(request);
        if (denied) return denied;

        if (!telegramConfigured()) {
          return Response.json({ ok: false, error: "TELEGRAM_BOT_TOKEN_MISSING" }, { status: 503 });
        }

        const input = await body<{ chat_id?: string; phone?: string }>(request);
        let chatId = (input.chat_id || "").trim();
        const phone = (input.phone || "").replace(/\D/g, "");

        if (!chatId && phone) {
          const link = await d1First<{ telegram_chat_id: number }>(
            `SELECT tl.telegram_chat_id FROM telegram_links tl
             JOIN users u ON u.id = tl.user_id
             WHERE REPLACE(REPLACE(u.phone, '+', ''), ' ', '') = ? LIMIT 1`,
            phone,
          );
          if (!link?.telegram_chat_id) {
            return Response.json(
              { ok: false, error: "NO_TELEGRAM_LINK_FOR_PHONE" },
              { status: 404 },
            );
          }
          chatId = String(link.telegram_chat_id);
        }

        if (!chatId) {
          return Response.json({ ok: false, error: "chat_id_or_phone_required" }, { status: 400 });
        }
        if (!/^\d{5,20}$/.test(chatId)) {
          return Response.json({ ok: false, error: "invalid_chat_id" }, { status: 400 });
        }

        const result = await sendTelegramMessage(chatId, "🍌 اختبار اتصال Telegram من Bananto");
        return Response.json({
          ok: result.ok,
          status: result.status ?? null,
          error_code: result.error_code ?? null,
          description: result.description ?? result.error ?? null,
          message_id: (result.result as any)?.message_id ?? null,
        });
      },
    },
  },
});
