/**
 * Smart Contextual Suggestions Engine
 *
 * Generates accurate, state-aware suggestions based on:
 * 1. Chat Type (General Support, Digital Order Delivery, Automated Support)
 * 2. Last Message intent and sender
 * 3. Order preparation stage (Payment pending, Creds sent, OTP requested, Completed)
 * 4. FAQ knowledge base trends
 */

import { norm } from "./normalize";
import type { ChatType } from "../types";

export interface SuggestionContextParams {
  chatType?: ChatType | string;
  orderId?: string;
  orderStatus?: string;
  paymentStatus?: string;
  lastMessageText?: string;
  lastSenderRole?: "user" | "admin" | "assistant" | "system";
  hasSentProof?: boolean;
  hasCredsSent?: boolean;
  isCompleted?: boolean;
  customFaqs?: string[];
}

export function getSmartCustomerSuggestions(params: SuggestionContextParams): string[] {
  const {
    chatType,
    orderId,
    orderStatus,
    paymentStatus,
    lastMessageText = "",
    lastSenderRole,
    hasSentProof = false,
    hasCredsSent = false,
    isCompleted = false,
    customFaqs = [],
  } = params;

  const isOrder = chatType === "ORDER_SUPPORT" || chatType === "DELIVERY" || Boolean(orderId);
  const isAuto = chatType === "AUTOMATED_SUPPORT" && !isOrder;
  const lastNorm = norm(lastMessageText);

  // 1. Digital Order Chat Flow
  if (isOrder) {
    if (isCompleted || orderStatus === "completed") {
      return [
        "⭐ تقييم التجربة",
        "🎮 طريقة تشغيل اللعبة أوفلاين",
        "📦 طلب لعبة أخرى",
        "👋 إنهاء المحادثة",
      ];
    }

    if (paymentStatus === "unpaid" || orderStatus === "pending") {
      return [
        "💳 أرسلت إيصال التحويل",
        "⏳ استعجال تأكيد الدفع",
        "❌ تعديل أو إلغاء الطلب",
        "👤 التحدث مع الإدارة",
      ];
    }

    // Checking last message from admin
    if (lastSenderRole === "admin" || lastSenderRole === "system") {
      if (
        lastNorm.includes("بيانات الحساب") ||
        lastNorm.includes("سجل الدخول") ||
        lastNorm.includes("اثبات") ||
        hasCredsSent
      ) {
        return [
          "📸 أرسلت إثبات الدخول",
          "🔑 أحتاج كود التحقق OTP",
          "⚠️ واجهت مشكلة في الحساب",
          "✅ تم تسجيل الدخول بنجاح",
        ];
      }

      if (lastNorm.includes("كود") || lastNorm.includes("رمز") || lastNorm.includes("otp")) {
        return [
          "✅ تم تسجيل الدخول بنجاح",
          "🔄 إعادة إرسال كود التحقق",
          "❓ اللعبة تطلب اتصالاً بالإنترنت",
          "👤 التحدث مع المشرف",
        ];
      }
    }

    // Default active order stage chips
    if (hasSentProof) {
      return [
        "🔑 أحتاج كود التحقق OTP",
        "✅ تم تسجيل الدخول بنجاح",
        "⚠️ كلمة المرور خاطئة",
        "👤 التحدث مع المشرف",
      ];
    }

    return [
      "📸 أرسلت إثبات الدخول",
      "🔑 أحتاج كود التحقق OTP",
      "⚠️ واجهت مشكلة في الحساب",
      "✅ تم تسجيل الدخول بنجاح",
    ];
  }

  // 2. Automated Support Chat Flow
  if (isAuto) {
    if (
      lastNorm.includes("باسورد") ||
      lastNorm.includes("كلمة المرور") ||
      lastNorm.includes("دخول")
    ) {
      return [
        "🎮 خطوات تسجيل الدخول خطوة بخطوة",
        "🔑 كود التحقق لم يصل",
        "❌ تظهر رسالة كلمة مرور خاطئة",
        "👤 التحدث مع الإدارة",
      ];
    }

    if (
      lastNorm.includes("شراء") ||
      lastNorm.includes("دفع") ||
      lastNorm.includes("محفظة") ||
      lastNorm.includes("رصيد")
    ) {
      return [
        "💳 ما هي طرق شحن المحفظة؟",
        "🎮 كيف أشتري لعبة رقمية؟",
        "⚡ كم يستغرق تسليم الطلب؟",
        "👤 التحدث مع موظف",
      ];
    }

    // Blend top KB FAQs if provided
    if (customFaqs.length >= 3) {
      return [...customFaqs.slice(0, 3), "👤 التحدث مع الإدارة"];
    }

    return [
      "🎮 طريقة تسجيل الدخول",
      "🔒 مشكلة في كلمة المرور",
      "🛒 طريقة شراء لعبة",
      "👤 التحدث مع موظف",
    ];
  }

  // 3. General Support Chat Flow (Human Support)
  if (
    lastNorm.includes("كلمة المرور") ||
    lastNorm.includes("باسورد") ||
    lastNorm.includes("دخول") ||
    lastNorm.includes("حساب")
  ) {
    return [
      "🔑 أحتاج كود التحقق",
      "❌ كلمة المرور غير صحيحة",
      "🔄 إعادة تعيين الحساب",
      "👤 التحدث مع المشرف",
    ];
  }

  if (
    lastNorm.includes("فلوس") ||
    lastNorm.includes("دفع") ||
    lastNorm.includes("تحويل") ||
    lastNorm.includes("رصيد")
  ) {
    return [
      "💳 استفسار عن عملية دفع",
      "⚡ استعجال شحن المحفظة",
      "🧾 أرسلت إشعار التحويل",
      "👤 التواصل مع المشرف",
    ];
  }

  return [
    "🎮 طريقة تسجيل الدخول",
    "🔒 مشكلة في كلمة المرور",
    "🛒 طريقة شراء لعبة",
    "👤 التحدث مع موظف",
  ];
}
