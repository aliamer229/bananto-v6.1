import { createFileRoute } from "@tanstack/react-router";
import {
  getMe,
  getWebhookInfo,
  requireWebhookSecret,
  telegramConfigured,
} from "@/lib/telegram.server";
import { assertDiagnosticSecret } from "./diagnostic";

/** Full Telegram health report. Never exposes token or webhook secret. */
export const Route = createFileRoute("/api/public/telegram/health")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = assertDiagnosticSecret(request);
        if (denied) return denied;

        let webhookSecretConfigured = false;
        try {
          requireWebhookSecret();
          webhookSecretConfigured = true;
        } catch {
          // Only report readiness; never disclose the configured value.
        }
        const configured = telegramConfigured() && webhookSecretConfigured;
        if (!telegramConfigured()) {
          return Response.json({
            telegram: {
              configured: false,
              apiReachable: false,
              botValid: false,
              webhookConfigured: false,
              webhookUrl: null,
              pendingUpdates: 0,
              lastWebhookError: "TELEGRAM_BOT_TOKEN_MISSING",
            },
          });
        }

        const me = await getMe();
        const info = me.ok ? await getWebhookInfo() : null;
        const w = (info?.result ?? {}) as any;

        return Response.json({
          telegram: {
            configured,
            apiReachable: me.ok || typeof me.status === "number",
            botValid: !!me.ok,
            botUsername: me.ok ? ((me.result as any)?.username ?? null) : null,
            webhookSecretConfigured,
            webhookConfigured: !!w.url && w.url.includes("banan.to"),
            webhookUrl: w.url || null,
            pendingUpdates: w.pending_update_count ?? 0,
            lastWebhookError: w.last_error_message ?? null,
            lastWebhookErrorDate: w.last_error_date ?? null,
          },
        });
      },
    },
  },
});
