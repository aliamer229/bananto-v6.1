import { env } from "@/lib/env.server";
import type { WhatsAppSendResult, WaSenderConfigStatus } from "./types";

export const WASENDER_SEND_ENDPOINT = "https://wasenderapi.com/api/send-message";

export function maskPhoneForLog(phone: string): string {
  if (!phone || phone.length < 6) return "***";
  if (phone.startsWith("+964")) {
    const prefix = phone.slice(0, 5);
    const suffix = phone.slice(-3);
    return `${prefix}******${suffix}`;
  }
  const prefix = phone.slice(0, 4);
  const suffix = phone.slice(-3);
  return `${prefix}******${suffix}`;
}

export function normalizePhoneForWhatsApp(phone: string): string | null {
  const cleaned = phone.replace(/[\s\-()]/g, "");
  if (!/^\+?[0-9]{7,16}$/.test(cleaned)) {
    return null;
  }
  if (cleaned.startsWith("00")) {
    return `+${cleaned.slice(2)}`;
  }
  if (cleaned.startsWith("+")) {
    return cleaned;
  }
  if (cleaned.startsWith("07") && cleaned.length === 11) {
    return `+964${cleaned.slice(1)}`;
  }
  if (cleaned.startsWith("7") && cleaned.length === 10) {
    return `+964${cleaned}`;
  }
  return `+${cleaned}`;
}

export class WaSenderProvider {
  private getApiKey(): string | undefined {
    return env("WASENDER_API_KEY");
  }

  public getConfigStatus(): WaSenderConfigStatus {
    const key = this.getApiKey();
    const isPresent = typeof key === "string" && key.trim().length > 0;
    return {
      configured: isPresent,
      sessionApiKeyPresent: isPresent,
      provider: "wasender",
    };
  }

  public async sendMessage(phone: string, text: string): Promise<WhatsAppSendResult> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return {
        success: false,
        errorCode: "WASENDER_NOT_CONFIGURED",
        error: "مفتاح خدمة واتساب غير مهيأ",
      };
    }

    const normalized = normalizePhoneForWhatsApp(phone);
    if (!normalized) {
      return {
        success: false,
        errorCode: "INVALID_PHONE",
        error: "رقم الهاتف غير صالح",
      };
    }

    try {
      const res = await fetch(WASENDER_SEND_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: normalized,
          text,
        }),
      });

      if (res.status === 200) {
        const data = (await res.json().catch(() => ({}))) as Record<string, any>;
        return {
          success: true,
          status: 200,
          messageId: data.messageId || data.id,
        };
      }

      if (res.status === 401 || res.status === 403) {
        return {
          success: false,
          status: res.status,
          errorCode: "WASENDER_AUTH_FAILED",
          error: "تعذر إرسال رمز التحقق عبر واتساب حالياً. يرجى المحاولة لاحقاً.",
        };
      }

      if (res.status === 429) {
        return {
          success: false,
          status: 429,
          errorCode: "WASENDER_RATE_LIMITED",
          error: "تم تجاوز حد الإرسال. يرجى الانتظار قليلاً والمحاولة مجدداً.",
        };
      }

      return {
        success: false,
        status: res.status,
        errorCode: "WASENDER_UNAVAILABLE",
        error: `فشل إرسال الرسالة (${res.status})`,
      };
    } catch (err: any) {
      return {
        success: false,
        status: 500,
        errorCode: "WASENDER_UNAVAILABLE",
        error: err?.message || "خطأ غير متوقع أثناء الاتصال بالخادم",
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
