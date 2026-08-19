import { createFileRoute } from "@tanstack/react-router";
import {
  callTelegram,
  getWebhookInfo,
  requireWebhookSecret,
  telegramConfigured,
} from "@/lib/telegram.server";
import { assertDiagnosticSecret } from "./diagnostic";
import { env } from "@/lib/env.server";

/**
 * Registers the production webhook with Telegram.
 * The secret token is required (never derived from the bot token) and is
 * never echoed back in the response.
 */
export const Route = createFileRoute("/api/public/telegram/setup-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = assertDiagnosticSecret(request);
        if (denied) return denied;

        if (!telegramConfigured()) {
          return Response.json({ ok: false, error: "TELEGRAM_BOT_TOKEN_MISSING" }, { status: 503 });
        }

        let secret: string;
        try {
          secret = requireWebhookSecret();
        } catch {
          return Response.json(
            { ok: false, error: "TELEGRAM_WEBHOOK_SECRET_MISSING" },
            { status: 503 },
          );
        }

        const isProd = env("APP_ENV") === "production";
        const url = new URL(request.url);
        const host = isProd ? "banan.to" : url.hostname;
        const webhookUrl = `https://${host}/api/public/telegram/webhook`;

        const setResult = await callTelegram("setWebhook", {
          url: webhookUrl,
          secret_token: secret,
          allowed_updates: ["message", "callback_query"],
          // Re-registering diagnostics must not discard pending ownership
          // proofs or OTP-related contact updates.
          drop_pending_updates: false,
        });

        if (!setResult.ok) {
          return Response.json({
            ok: false,
            status: setResult.status ?? null,
            error_code: setResult.error_code ?? null,
            description: setResult.description ?? setResult.error ?? null,
          });
        }

        const info = await getWebhookInfo();
        const w = (info.result ?? {}) as any;

        return Response.json({
          ok: true,
          webhook: {
            url: w.url ?? webhookUrl,
            has_custom_certificate: !!w.has_custom_certificate,
            pending_update_count: w.pending_update_count ?? 0,
            last_error_date: w.last_error_date ?? null,
            last_error_message: w.last_error_message ?? null,
            allowed_updates: w.allowed_updates ?? ["message", "callback_query"],
          },
        });
      },
    },
  },
});
