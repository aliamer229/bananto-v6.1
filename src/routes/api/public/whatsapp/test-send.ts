import { createFileRoute } from "@tanstack/react-router";
import { maskPhoneForLog, sendWhatsappOtp } from "@/lib/whatsapp.server";
import { normalizePhone } from "@/lib/phone";
import { assertOperatorSecret } from "@/lib/security.server";
import { body } from "@/lib/http.server";

/**
 * Protected diagnostic: sends one diagnostic test OTP to a phone number
 * supplied by an operator via WaSenderAPI.
 * Never exposes secrets or API keys.
 */
export const Route = createFileRoute("/api/public/whatsapp/test-send")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = assertOperatorSecret(request);
        if (denied) return denied;

        const input = await body<{ phone?: string }>(request);
        const phone = input.phone;
        const normalized = phone ? normalizePhone(phone) : undefined;
        if (!normalized) {
          return Response.json({ error: "INVALID_OR_MISSING_PHONE" }, { status: 400 });
        }

        // Fixed non-secret diagnostic test code — never a real OTP
        const result = await sendWhatsappOtp(normalized, "000000");

        return Response.json({
          success: result.success,
          status: result.status,
          error: result.error,
          errorCode: result.errorCode,
          messageId: result.messageId,
          phoneMasked: maskPhoneForLog(normalized),
        });
      },
    },
  },
});
