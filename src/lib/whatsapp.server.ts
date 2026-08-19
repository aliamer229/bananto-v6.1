/**
 * WhatsApp delivery service powered by WaSenderAPI.
 *
 * Docs: https://wasenderapi.com/api-docs
 * Uses Session API Key: env.WASENDER_API_KEY
 */

import { getWaSenderProvider, maskPhoneForLog } from "@/services/whatsapp/wasender";
import type { WhatsAppSendResult, WaSenderConfigStatus } from "@/services/whatsapp/types";

export { maskPhoneForLog };
export type { WhatsAppSendResult as WhatsappResult };

/**
 * The standard OTP verification message template in Arabic.
 */
export function otpMessage(code: string): string {
  return `رمز التحقق الخاص بك هو: ${code}

ينتهي الرمز خلال 5 دقائق.
لا تشارك هذا الرمز مع أي شخص.`;
}

/**
 * Sends a 6-digit OTP code to a phone number via WaSenderAPI.
 */
export async function sendWhatsappOtp(phone: string, code: string): Promise<WhatsAppSendResult> {
  const provider = getWaSenderProvider();
  const text = otpMessage(code);
  return provider.sendMessage(phone, text);
}

/**
 * Sends a general WhatsApp message via WaSenderAPI.
 */
export async function sendWhatsappMessage(
  phone: string,
  message: string,
): Promise<WhatsAppSendResult> {
  const provider = getWaSenderProvider();
  return provider.sendMessage(phone, message);
}

/**
 * Safe configuration check for WaSenderAPI. Never exposes secret keys.
 */
export function getWhatsappConfigStatus(): WaSenderConfigStatus {
  const provider = getWaSenderProvider();
  return provider.getConfigStatus();
}
