import { createFileRoute } from "@tanstack/react-router";
import {
  answerCallbackQuery,
  callTelegram,
  escapeHtml,
  requireWebhookSecret,
  sendTelegramMessage,
  telegramWebAppUrl,
} from "@/lib/telegram.server";
import { d1First, d1Run, d1RunChanges, ensureTelegramSchema } from "@/lib/d1.server";
import { assignTelegramMemberNo } from "@/lib/member-id.server";
import { constantTimeEqual } from "@/lib/security.server";
import { textBody } from "@/lib/http.server";

/**
 * Telegram Bot webhook.
 */
export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let expected: string;
        try {
          expected = requireWebhookSecret();
        } catch (err) {
          console.error(
            "[telegram:error] webhook rejected: secret not configured.",
            (err as Error).message,
          );
          return new Response("Unauthorized", { status: 401 });
        }

        const provided = request.headers.get("X-Telegram-Bot-Api-Secret-Token") || "";
        if (!provided || !constantTimeEqual(provided, expected)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const length = Number(request.headers.get("content-length") || 0);
        if (length > 1024 * 1024) return new Response("Payload too large", { status: 413 });

        let update: any;
        try {
          update = JSON.parse(await textBody(request, 1024 * 1024));
        } catch (error) {
          return error instanceof Response ? error : new Response("Invalid JSON", { status: 400 });
        }

        try {
          await ensureTelegramSchema();
          await handleUpdate(update);
        } catch (err) {
          console.error("[telegram:error] update handling failed:", (err as Error).message);
          // A non-2xx response asks Telegram to retry instead of silently
          // losing a contact share while D1 is temporarily unavailable.
          return new Response("Temporary failure", { status: 503 });
        }

        return new Response("OK", { status: 200 });
      },
    },
  },
});

async function handleUpdate(update: any) {
  // 1. Contact sharing (Phone verification)
  const contact = update?.message?.contact;
  if (contact) {
    const tgUserId = String(contact.user_id);
    const tgChatId = update.message.chat.id;
    const tgPhone = contact.phone_number;

    if (
      update.message.chat?.type !== "private" ||
      String(tgChatId) !== String(update.message.from?.id)
    ) {
      return;
    }

    // Verify contact.user_id matches the message sender to prevent fraud
    const senderId = String(update.message.from?.id);
    if (senderId !== tgUserId) {
      return;
    }

    const { processVerificationContact } = await import("@/lib/telegram-link.server");
    const result = await processVerificationContact(tgUserId, tgChatId, tgPhone);

    if (result?.matches) {
      await sendTelegramMessage(
        tgChatId,
        "✅ تم إثبات ملكية رقم الهاتف بنجاح! يمكنك الآن العودة للموقع. 🍌",
        { reply_markup: { remove_keyboard: true } },
      );
    } else if (result && !result.matches) {
      await sendTelegramMessage(
        tgChatId,
        "❌ عذراً، رقم الهاتف المشترك لا يطابق الرقم المطلوب التحقق منه. تأكد من أنك تستخدم حساب تلغرام الصحيح.",
        { reply_markup: { remove_keyboard: true } },
      );
    } else {
      await sendTelegramMessage(
        tgChatId,
        "⚠️ لم يتم العثور على جلسة تحقق نشطة. يرجى الضغط على زر التحقق عبر تلغرام من الموقع أولاً ثم إعادة المحاولة.",
        { reply_markup: { remove_keyboard: true } },
      );
    }
    return;
  }

  // 2. Inline button callbacks
  const callback = update?.callback_query;
  if (callback) {
    const chatId = callback.message?.chat?.id;
    if (chatId && callback.data === "get_id") {
      await sendTelegramMessage(
        chatId,
        `معرف الدردشة الخاص بك: <code>${escapeHtml(String(chatId))}</code>`,
        { parse_mode: "HTML" },
      );
    }
    if (callback.id) await answerCallbackQuery(callback.id);
    return;
  }

  // 3. Messages
  const msg = update?.message;
  if (!msg || !msg.chat?.id) return;

  const chatId = msg.chat.id as number;
  const text = String(msg.text || "").trim();

  if (msg.chat.type !== "private" || String(msg.from?.id) !== String(chatId)) return;

  if (text.startsWith("/start")) {
    const tokenCandidate = text.split(/\s+/)[1] || "";
    const token = /^[A-Za-z0-9_-]{8,128}$/.test(tokenCandidate) ? tokenCandidate : null;
    if (token) {
      const { bindSessionChat } = await import("@/lib/telegram-link.server");
      const session = await bindSessionChat(token, String(msg.from?.id), chatId);

      if (session) {
        // 1. Send the Mini App button for verified launch
        await sendTelegramMessage(chatId, "مرحباً بك! افتح تطبيق إثبات الملكية لإكمال التحقق. 🍌", {
          reply_markup: {
            inline_keyboard: [
              [{ text: "🍌 فتح إثبات الملكية", web_app: { url: telegramWebAppUrl(token) } }],
            ],
          },
        });

        // 2. Send the native contact sharing button as a persistent fallback
        await sendTelegramMessage(
          chatId,
          "إذا واجهت مشكلة في التطبيق، يمكنك مشاركة رقمك مباشرة من الزر أدناه لإتمام التحقق فوراً:",
          {
            reply_markup: {
              keyboard: [[{ text: "📱 مشاركة رقم هاتفي مباشرة", request_contact: true }]],
              resize_keyboard: true,
              one_time_keyboard: true,
            },
          },
        );
        return;
      }

      await handleLinkToken(chatId, msg.from, token);
      return;
    }

    await sendTelegramMessage(
      chatId,
      'مرحباً بك في بنانتو! 🍌\n\nمن هنا تصلك رموز التحقق وإشعارات الطلبات.\nلربط حسابك، ارجع للموقع واضغط "التحقق عبر تلغرام".',
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "🍌 فتح تطبيق بنانتو", web_app: { url: telegramWebAppUrl() } },
              { text: "🆔 الحصول على معرّفي", callback_data: "get_id" },
            ],
          ],
        },
      },
    );

    // Set the Menu Button to open the Mini App
    try {
      await callTelegram("setChatMenuButton", {
        chat_id: chatId,
        menu_button: {
          type: "web_app",
          text: "Bananto App",
          web_app: { url: telegramWebAppUrl() },
        },
      });
    } catch (e) {
      console.warn("[telegram:warn] failed to set menu button:", e);
    }
    return;
  }

  if (text.toLowerCase() === "test" || text === "اختبار" || text.startsWith("/test")) {
    await sendTelegramMessage(
      chatId,
      `نظام تليجرام يعمل بنجاح! ✅\n\nمعرف الدردشة الخاص بك: <code>${escapeHtml(String(chatId))}</code>`,
      { parse_mode: "HTML" },
    );
  }
}

async function handleLinkToken(chatId: number, from: any, token: string) {
  const { readLinkToken } = await import("@/lib/telegram-link.server");
  const linkToken = await readLinkToken(token);

  if (!linkToken) {
    await sendTelegramMessage(
      chatId,
      "❌ لم يتم العثور على رمز الربط هذا. يرجى التأكد من الرمز الصحيح أو طلب رمز جديد من الموقع.",
    );
    return;
  }

  if ((linkToken.status ?? "pending") !== "pending") {
    await sendTelegramMessage(chatId, "❌ رمز الربط مستخدم مسبقاً. اطلب رمزاً جديداً من الموقع.");
    return;
  }

  if (Date.parse(linkToken.expires_at) < Date.now()) {
    await d1Run("UPDATE telegram_link_tokens SET status = 'expired' WHERE token = ?", token);
    await sendTelegramMessage(chatId, "❌ رمز الربط انتهت صلاحيته. يرجى طلب رمز جديد من الموقع.");
    return;
  }

  const banantoUserId = linkToken.user_id;

  const owner = await d1First<{ user_id: string }>(
    "SELECT user_id FROM telegram_links WHERE telegram_chat_id = ?",
    chatId,
  );
  if (owner && owner.user_id !== banantoUserId && !owner.user_id.startsWith("guest:")) {
    await d1Run("UPDATE telegram_link_tokens SET status = 'rejected' WHERE token = ?", token);
    await sendTelegramMessage(chatId, "⚠️ حساب Telegram مرتبط مسبقاً بحساب Bananto آخر.");
    return;
  }
  if (owner && owner.user_id !== banantoUserId) {
    await d1Run("DELETE FROM telegram_links WHERE telegram_chat_id = ?", chatId);
  }

  const claimed = await d1RunChanges(
    `UPDATE telegram_link_tokens
        SET status = 'processing', telegram_chat_id = ?, telegram_user_id = ?
      WHERE token = ? AND status = 'pending' AND expires_at > ?`,
    chatId,
    from?.id ? String(from.id) : null,
    token,
    new Date().toISOString(),
  );
  if (claimed !== 1) {
    await sendTelegramMessage(chatId, "❌ رمز الربط مستخدم أو منتهي. اطلب رمزاً جديداً من الموقع.");
    return;
  }

  try {
    const stamp = new Date().toISOString();
    await d1Run(
      `INSERT INTO telegram_links (user_id, telegram_chat_id, telegram_user_id, telegram_username, verified, linked_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         telegram_chat_id = excluded.telegram_chat_id,
         telegram_user_id = excluded.telegram_user_id,
         telegram_username = excluded.telegram_username,
         verified = 1,
         updated_at = excluded.updated_at`,
      banantoUserId,
      chatId,
      from?.id ? String(from.id) : null,
      from?.username || null,
      stamp,
      stamp,
    );

    await d1Run(
      `UPDATE telegram_link_tokens
         SET status = 'used', used_at = ?, telegram_chat_id = ?, telegram_user_id = ?
       WHERE token = ? AND status = 'processing'`,
      stamp,
      chatId,
      from?.id ? String(from.id) : null,
      token,
    );

    let memberNo: string | null = null;
    if (!banantoUserId.startsWith("guest:")) {
      try {
        memberNo = await assignTelegramMemberNo(banantoUserId, chatId);
      } catch (err) {
        console.error("[telegram:error] member id derivation failed:", (err as Error).message);
      }
    }

    await sendTelegramMessage(
      chatId,
      memberNo
        ? `✅ تم ربط حسابك بنجاح!\n\nرقم عضويتك: <b>${escapeHtml(memberNo)}</b>\nاستخدمه مع كلمة المرور لتسجيل الدخول.`
        : banantoUserId.startsWith("guest:")
          ? `✅ تم ربط حسابك! يمكنك الآن طلب رمز التحقق عبر التلغرام لإكمال التسجيل. 🍌`
          : "✅ تم ربط حسابك بنجاح! ستصلك رموز التحقق والإشعارات هنا. 🍌",
      { parse_mode: "HTML" },
    );
  } catch (err) {
    console.error("[telegram:error] link failed:", (err as Error).message);
    await sendTelegramMessage(chatId, "❌ حدث خطأ أثناء ربط الحساب. يرجى المحاولة لاحقاً.");
  }
}
