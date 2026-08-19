import { createFileRoute } from "@tanstack/react-router";
import { getMe, telegramConfigured } from "@/lib/telegram.server";
import { assertOperatorSecret } from "@/lib/security.server";

/** Shared guard for every Telegram diagnostic endpoint. */
export function assertDiagnosticSecret(request: Request): Response | null {
  return assertOperatorSecret(request) ?? null;
}

export const Route = createFileRoute("/api/public/telegram/diagnostic")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = assertDiagnosticSecret(request);
        if (denied) return denied;

        const configured = telegramConfigured();
        if (!configured) {
          return Response.json({
            provider: "telegram",
            configured: false,
            apiReachable: false,
            error: "TELEGRAM_BOT_TOKEN_MISSING",
          });
        }

        const me = await getMe();
        if (!me.ok) {
          return Response.json({
            provider: "telegram",
            configured: true,
            apiReachable: false,
            status: me.status ?? null,
            error: me.description || me.error || "UNKNOWN_ERROR",
          });
        }

        const bot = me.result as { id: number; username: string; first_name: string };
        return Response.json({
          provider: "telegram",
          configured: true,
          apiReachable: true,
          status: me.status ?? 200,
          ok: true,
          bot: { id: bot.id, username: bot.username, first_name: bot.first_name },
        });
      },
    },
  },
});
