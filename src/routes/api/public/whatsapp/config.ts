import { createFileRoute } from "@tanstack/react-router";
import { getWhatsappConfigStatus } from "@/lib/whatsapp.server";
import { assertOperatorSecret } from "@/lib/security.server";

/**
 * Protected configuration check for WaSenderAPI.
 * Reports status of configuration only — never exposes secret API keys.
 */
export const Route = createFileRoute("/api/public/whatsapp/config")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = assertOperatorSecret(request);
        if (denied) return denied;

        const status = getWhatsappConfigStatus();
        return Response.json(status);
      },
    },
  },
});
