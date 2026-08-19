import { env } from "@/lib/env.server";
import { normalizePhone } from "@/lib/phone";
import type { WhatsAppProvider, WhatsAppSendResult, WaSenderConfigStatus } from "./types";

export const WASENDER_BASE_URL = "https://www.wasenderapi.com";
export const WASENDER_SEND_ENDPOINT = "https://www.wasenderapi.com/api/send-message";
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Safely masks a phone number for logging:
 * e.g. "+9647701234567" -> "+9647*****567"
 */
export function maskPhoneForLog(phone: string): string {
  const clean = phone.replace(/[^\d+]/g, "");
  if (clean.length < 8) return "***";
  const prefix = clean.slice(0, 5);
  const suffix = clean.slice(-3);
  return `${prefix}${"*".repeat(Math.max(3, clean.length - 8))}${suffix}`;
}

export class WaSenderProvider implements WhatsAppProvider {
  private readonly baseUrl: string;
  private readonly endpoint: string;

  constructor(options?: { baseUrl?: string; endpoint?: string }) {
    this.baseUrl = options?.baseUrl || WASENDER_BASE_URL;
    this.endpoint = options?.endpoint || WASENDER_SEND_ENDPOINT;
  }

  /**
   * Safe configuration status. Never returns secret values.
   */
  public getConfigStatus(): WaSenderConfigStatus {
    const apiKey = env("WASENDER_API_KEY");
    const sessionApiKeyPresent = typeof apiKey === "string" && apiKey.trim().length >= 8;
    return {
      provider: "wasender",
      configured: sessionApiKeyPresent,
      sessionApiKeyPresent,
    };
  }

  /**
   * Sends a WhatsApp message via WaSenderAPI.
   *
   * Endpoint: POST https://www.wasenderapi.com/api/send-message
   * Headers:
   *   Authorization: Bearer <WASENDER_API_KEY>
   *   Content-Type: application/json
   * Body:
   *   { "to": "<E.164>", "text": "<MESSAGE>" }
   */
  public async sendMessage(toPhone: string, text: string): Promise<WhatsAppSendResult> {
    const apiKey = env("WASENDER_API_KEY")?.trim();
    if (!apiKey) {
      console.error("[wasender] apiKey missing in worker environment");
      return {
        success: false,
        status: 0,
        errorCode: "WASENDER_NOT_CONFIGURED",
        error: "تعذر إرسال رسالة واتساب: مفتاح الخدمة غير مهيأ على الخادم.",
      };
    }

    const normalized = normalizePhone(toPhone);
    if (!normalized) {
      return {
        success: false,
        status: 400,
        errorCode: "INVALID_PHONE",
        error: "رقم الهاتف غير صالح.",
      };
    }

    const payload = {
      to: normalized,
      text: text.trim(),
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const masked = maskPhoneForLog(normalized);
    console.log(`[wasender] sending message to phone=${masked}`);

    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const status = response.status;

      let responseData: any = null;
      try {
        const textData = await response.text();
        if (textData) {
          responseData = JSON.parse(textData);
        }
      } catch {
        /* Non-JSON upstream response */
      }

      console.log(`[wasender] response status=${status} for phone=${masked}`);

      // Check success
      // WaSenderAPI typically returns 200 or 201 with success: true or a message object
      const isSuccessStatus = status >= 200 && status < 300;
      const isExplicitFail =
        responseData && typeof responseData === "object" && responseData.success === false;

      if (isSuccessStatus && !isExplicitFail) {
        const messageId =
          responseData?.messageId ||
          responseData?.id ||
          responseData?.data?.id ||
          responseData?.data?.messageId ||
          undefined;

        return {
          success: true,
          status,
          messageId: typeof messageId === "string" ? messageId : undefined,
          raw: responseData,
        };
      }

      // Map error codes safely
      if (status === 401 || status === 403) {
        console.error(`[wasender] auth failed with status ${status}`);
        return {
          success: false,
          status,
          errorCode: "WASENDER_AUTH_FAILED",
          error: "تعذر إرسال رمز التحقق عبر واتساب حالياً. حاول مرة أخرى لاحقاً.",
          raw: responseData,
        };
      }

      if (status === 429) {
        console.warn(`[wasender] rate limited by provider (429)`);
        return {
          success: false,
          status,
          errorCode: "WASENDER_RATE_LIMITED",
          error: "تم تجاوز حد الإرسال المؤقت عبر واتساب. يرجى الانتظار والمحاولة لاحقاً.",
          raw: responseData,
        };
      }

      if (status >= 500) {
        console.error(`[wasender] server error ${status} from upstream`);
        return {
          success: false,
          status,
          errorCode: "WASENDER_UNAVAILABLE",
          error: "خدمة واتساب غير متاحة حالياً. حاول مرة أخرى لاحقاً.",
          raw: responseData,
        };
      }

      const upstreamMsg =
        responseData?.message || responseData?.error || responseData?.msg || "WASENDER_SEND_FAILED";

      console.error(
        `[wasender] send failed status=${status} error=${typeof upstreamMsg === "string" ? upstreamMsg.slice(0, 100) : "UNKNOWN"}`,
      );

      return {
        success: false,
        status,
        errorCode: "WASENDER_SEND_FAILED",
        error: "تعذر إرسال رمز التحقق عبر واتساب حالياً. حاول مرة أخرى لاحقاً.",
        raw: responseData,
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err?.name === "AbortError" || controller.signal.aborted) {
        console.error(
          `[wasender] request timed out after ${REQUEST_TIMEOUT_MS}ms for phone=${masked}`,
        );
        return {
          success: false,
          status: 408,
          errorCode: "WASENDER_TIMEOUT",
          error: "استغرقت عملية الإرسال وقتاً طويلاً. يرجى المحاولة مرة أخرى.",
        };
      }

      console.error(`[wasender] network error during send: ${err?.message ?? "unknown"}`);
      return {
        success: false,
        status: 0,
        errorCode: "WASENDER_UNAVAILABLE",
        error: "تعذر الاتصال بخدمة واتساب. يرجى المحاولة بعد قليل.",
      };
    }
  }
}

let defaultProvider: WaSenderProvider | null = null;

export function getWaSenderProvider(): WaSenderProvider {
  if (!defaultProvider) {
    defaultProvider = new WaSenderProvider();
  }
  return defaultProvider;
}
