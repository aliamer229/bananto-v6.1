import { listThreads, getThread, saveThread, appendMessage, getMessages } from "./db.server";
import { chatRealtime } from "./chat-realtime.server";
import type { Thread, ChatMessage } from "./types";

/** Message bodies are untyped JSON; keep only a real string for the preview. */
function previewText(message: ChatMessage): string | undefined {
  const text = message.body?.["text"];
  return typeof text === "string" ? text : undefined;
}

/**
 * Determines whether a thread is a pure automated AI assistant chat
 * that should be hidden from the admin inbox.
 */
export function isPureAutomatedThread(t: Thread): boolean {
  // If it's linked to an order, it's NOT pure automated
  if (t.orderId) return false;

  // If human support was explicitly requested
  if (t.humanRequested || t.needsAdmin) return false;

  // If admin manually paused AI or took over
  if (t.aiPaused) return false;

  // If the mode is anything that requires admin attention
  if (
    t.mode === "ADMIN_ACTIVE" ||
    t.mode === "ADMIN_ONLY" ||
    t.mode === "ORDER_PREPARATION" ||
    t.mode === "WAITING_FOR_ADMIN" ||
    t.mode === "ESCALATED"
  ) {
    return false;
  }

  // If chatType is GENERAL_SUPPORT or DELIVERY or ORDER_SUPPORT
  if (
    t.chatType === "GENERAL_SUPPORT" ||
    t.chatType === "DELIVERY" ||
    t.chatType === "ORDER_SUPPORT"
  ) {
    return false;
  }

  // Pure automated support: chatType is AUTOMATED_SUPPORT or mode is AI_ACTIVE without admin flags
  return t.chatType === "AUTOMATED_SUPPORT" || t.mode === "AI_ACTIVE" || (!t.chatType && !t.mode);
}

/**
 * Returns true if the thread should be visible in the Admin Inbox.
 */
export function isAdminThread(t: Thread): boolean {
  return !isPureAutomatedThread(t);
}

// Throttle processInactivityAndQueue so it doesn't run concurrently
let isProcessing = false;
let lastProcessedTime = 0;

/**
 * Scans open threads and enforces:
 * 1. 5-minute inactivity rule for regular human chats -> Transfer to AI & close ticket.
 * 2. 5m, 7m, 9m alerts and 10m snooze / move to back of queue for Orders.
 */
export async function processInactivityAndQueue(): Promise<void> {
  const nowMs = Date.now();
  // Don't run more frequently than once every 5 seconds
  if (isProcessing || nowMs - lastProcessedTime < 5000) return;

  isProcessing = true;
  lastProcessedTime = nowMs;

  try {
    const allThreads = await listThreads();
    const openThreads = allThreads.filter((t) => t.status === "open" && t.mode !== "RESOLVED");

    for (const thread of openThreads) {
      // 1. Check Regular Human Support (GENERAL_SUPPORT without Order)
      const isGeneralSupport =
        (thread.chatType === "GENERAL_SUPPORT" || !thread.orderId) &&
        thread.chatType !== "ORDER_SUPPORT" &&
        thread.chatType !== "DELIVERY";

      if (isGeneralSupport && (thread.mode === "WAITING_FOR_USER" || thread.lastAdminMessageAt)) {
        const lastActivity = thread.lastAdminMessageAt || thread.lastMessageAt || thread.createdAt;
        const diffMs = nowMs - new Date(lastActivity).getTime();

        // 5 Minutes (300,000 ms) Inactivity Rule
        if (diffMs >= 5 * 60 * 1000 && thread.mode !== "AI_ACTIVE") {
          const autoCloseMsg = await appendMessage(thread.id, {
            senderRole: "system",
            kind: "system",
            body: {
              text: "تم تحويل المحادثة إلى الدعم الآلي وإغلاق التذكرة لعدم الرد لأكثر من 5 دقائق. يمكنك التحدث مع المساعد الآلي أو طلب الدعم البشري في أي وقت.",
            },
          });

          await saveThread({
            ...thread,
            status: "closed",
            mode: "AI_ACTIVE",
            chatType: "AUTOMATED_SUPPORT",
            aiPaused: false,
            needsAdmin: false,
            humanRequested: false,
            lastMessageAt: autoCloseMsg.createdAt,
            lastMessagePreview: previewText(autoCloseMsg),
          });

          await chatRealtime.broadcast(thread.id, {
            type: "thread.updated",
            payload: { threadId: thread.id, status: "closed", mode: "AI_ACTIVE" },
          });
          continue;
        }
      }

      // 2. Check Order Fulfillment Queue (ORDER_SUPPORT or with orderId)
      const isOrderSupport =
        Boolean(thread.orderId) ||
        thread.chatType === "ORDER_SUPPORT" ||
        thread.chatType === "DELIVERY";

      if (isOrderSupport && thread.status === "open") {
        // If last message was from admin or waiting for user
        const lastAdminTime = thread.lastAdminMessageAt;
        if (!lastAdminTime) continue;

        const diffMs = nowMs - new Date(lastAdminTime).getTime();
        const diffMinutes = Math.floor(diffMs / 60000);
        const reminders = thread.inactivityReminders || [];

        // 5 Minutes reminder
        if (diffMinutes >= 5 && !reminders.includes("5m")) {
          const reminderMsg = await appendMessage(thread.id, {
            senderRole: "system",
            kind: "system",
            body: {
              text: "⏳ تنبيه (5 دقائق): ننتظر ردك لإكمال تسليم طلبك. سنكون بانتظارك لمتابعة التجهيز.",
            },
          });

          await saveThread({
            ...thread,
            inactivityReminders: [...reminders, "5m"],
            lastMessageAt: reminderMsg.createdAt,
            lastMessagePreview: previewText(reminderMsg),
          });

          await chatRealtime.broadcast(thread.id, {
            type: "thread.updated",
            payload: { threadId: thread.id },
          });
        }
        // 7 Minutes reminder
        else if (diffMinutes >= 7 && !reminders.includes("7m")) {
          const reminderMsg = await appendMessage(thread.id, {
            senderRole: "system",
            kind: "system",
            body: {
              text: "⚠️ تذكير (7 دقائق): يرجى التواجد لتأكيد بيانات الدخول. في حال عدم الرد سيتم تأجيل دورك في طابور التجهيز.",
            },
          });

          await saveThread({
            ...thread,
            inactivityReminders: [...reminders, "7m"],
            lastMessageAt: reminderMsg.createdAt,
            lastMessagePreview: previewText(reminderMsg),
          });

          await chatRealtime.broadcast(thread.id, {
            type: "thread.updated",
            payload: { threadId: thread.id },
          });
        }
        // 9 Minutes reminder
        else if (diffMinutes >= 9 && !reminders.includes("9m")) {
          const reminderMsg = await appendMessage(thread.id, {
            senderRole: "system",
            kind: "system",
            body: {
              text: "🚨 تنبيه نهائي (9 دقائق): سيتم نقل طلبك إلى نهاية الطابور بعد دقيقة واحدة إذا لم يتم الرد لتسهيل خدمة العملاء الآخرين.",
            },
          });

          await saveThread({
            ...thread,
            inactivityReminders: [...reminders, "9m"],
            lastMessageAt: reminderMsg.createdAt,
            lastMessagePreview: previewText(reminderMsg),
          });

          await chatRealtime.broadcast(thread.id, {
            type: "thread.updated",
            payload: { threadId: thread.id },
          });
        }
        // 10 Minutes -> Move to back of the queue (Snoozed / Postponed)
        else if (diffMinutes >= 10 && thread.queueStatus !== "snoozed") {
          const nowIso = new Date().toISOString();
          const snoozeMsg = await appendMessage(thread.id, {
            senderRole: "system",
            kind: "system",
            body: {
              text: "⏸️ تم تأجيل دورك في طابور التجهيز لعدم الرد لأكثر من 10 دقائق. عند عودتك وإرسال أي رسالة، ستنتظر حتى يحين دورك في الطابور مجدداً.",
            },
          });

          await saveThread({
            ...thread,
            queueStatus: "snoozed",
            queueSnoozedAt: nowIso,
            mode: "WAITING_FOR_USER",
            inactivityReminders: [...reminders, "10m_snoozed"],
            lastMessageAt: snoozeMsg.createdAt,
            lastMessagePreview: previewText(snoozeMsg),
          });

          await chatRealtime.broadcast(thread.id, {
            type: "thread.updated",
            payload: { threadId: thread.id, queueStatus: "snoozed" },
          });
        }
      }
    }
  } catch (err) {
    console.error("[processInactivityAndQueue] error:", err);
  } finally {
    isProcessing = false;
  }
}

/**
 * Handle a customer sending a message in a snoozed queue thread:
 * Re-enters the queue at the end with queued status.
 */
export async function handleCustomerQueueReentry(thread: Thread): Promise<Thread> {
  const isOrderOrHuman =
    Boolean(thread.orderId) ||
    thread.chatType === "ORDER_SUPPORT" ||
    thread.chatType === "DELIVERY" ||
    thread.chatType === "GENERAL_SUPPORT";

  if (!isOrderOrHuman) return thread;

  const nowIso = new Date().toISOString();
  const wasSnoozed = thread.queueStatus === "snoozed";

  const updated: Thread = {
    ...thread,
    queueStatus: "queued",
    queueEnteredAt: nowIso, // Enters at the end of the queue
    inactivityReminders: [], // Reset reminders
    mode: thread.orderId ? "ORDER_PREPARATION" : "WAITING_FOR_ADMIN",
    needsAdmin: true,
    aiPaused: true,
  };

  if (wasSnoozed) {
    await appendMessage(thread.id, {
      senderRole: "system",
      kind: "system",
      body: {
        text: "👋 مرحباً بعودتك! تم إدراج طلبك في طابور التجهيز مجدداً، وسيتم خدمتك حال وصول دورك في الطابور.",
      },
    });
  }

  return saveThread(updated);
}

/**
 * Skip a customer in the queue (move to the end).
 */
export async function skipQueueCustomer(threadId: string): Promise<Thread | null> {
  const thread = await getThread(threadId);
  if (!thread) return null;

  const nowIso = new Date().toISOString();
  await appendMessage(thread.id, {
    senderRole: "system",
    kind: "system",
    body: {
      text: "تم تأجيل دورك في طابور التجهيز من قبل المشرف وسيتم استئنافه لاحقاً.",
    },
  });

  const updated = await saveThread({
    ...thread,
    queueStatus: "snoozed",
    queueSnoozedAt: nowIso,
    queueEnteredAt: nowIso, // Pushed to back
    mode: "WAITING_FOR_USER",
  });

  await chatRealtime.broadcast(thread.id, {
    type: "thread.updated",
    payload: { threadId: thread.id, queueStatus: "snoozed" },
  });

  return updated;
}

/**
 * Resume a customer in the queue manually (bring to front/active).
 */
export async function resumeQueueCustomer(threadId: string): Promise<Thread | null> {
  const thread = await getThread(threadId);
  if (!thread) return null;

  // Set entry time to past so they are at the front of FIFO queue
  const oldIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  await appendMessage(thread.id, {
    senderRole: "system",
    kind: "system",
    body: {
      text: "تم استئناف دورك في طابور التجهيز الآن مع المشرف.",
    },
  });

  const updated = await saveThread({
    ...thread,
    queueStatus: "active",
    queueEnteredAt: oldIso,
    inactivityReminders: [],
    mode: thread.orderId ? "ORDER_PREPARATION" : "ADMIN_ACTIVE",
    needsAdmin: true,
    aiPaused: true,
  });

  await chatRealtime.broadcast(thread.id, {
    type: "thread.updated",
    payload: { threadId: thread.id, queueStatus: "active" },
  });

  return updated;
}

/**
 * Determines whether a thread is an active digital order requiring preparation and delivery.
 * Excludes human support, automated support, game requests, and general inquiries.
 */
export function isDigitalOrderPreparationThread(t: Thread): boolean {
  if (t.chatType === "GENERAL_SUPPORT" || t.chatType === "AUTOMATED_SUPPORT") return false;
  return Boolean(
    t.orderId ||
    t.chatType === "ORDER_SUPPORT" ||
    t.chatType === "DELIVERY" ||
    t.mode === "ORDER_PREPARATION",
  );
}

export interface QueueMetrics {
  isQueueEligible: boolean;
  position: number;
  aheadCount: number;
  estimatedMinutesMin: number;
  estimatedMinutesMax: number;
  estimatedMinutesText: string;
  status: "active" | "queued" | "snoozed" | "serving_now" | "not_queued";
  adminStatus: "available" | "busy" | "offline";
  workingHoursText?: string;
}

/**
 * Real-time queue metrics calculation based on true backend state.
 * Strictly calculates queue position and wait times ONLY for active digital orders.
 */
export async function calculateQueueMetrics(threadOrOrderId: string): Promise<QueueMetrics> {
  const availability = await getAdminAvailabilityStatus();
  const allThreads = await listThreads();

  // Active queue threads: open and strictly digital orders requiring preparation/delivery
  const queueThreads = allThreads.filter((t) => {
    if (t.status !== "open" || t.mode === "RESOLVED" || isPureAutomatedThread(t)) return false;
    if (t.queueStatus === "snoozed") return false;
    return isDigitalOrderPreparationThread(t);
  });

  // Sort FIFO by queueEnteredAt / createdAt
  queueThreads.sort((a, b) => {
    const timeA = new Date(a.queueEnteredAt || a.createdAt).getTime();
    const timeB = new Date(b.queueEnteredAt || b.createdAt).getTime();
    return timeA - timeB;
  });

  const index = queueThreads.findIndex(
    (t) => t.id === threadOrOrderId || t.orderId === threadOrOrderId,
  );

  const adminStatus: "available" | "busy" | "offline" = !availability.isAvailable
    ? "offline"
    : queueThreads.length > 3
      ? "busy"
      : "available";

  if (index === -1) {
    const targetThread = allThreads.find(
      (t) => t.id === threadOrOrderId || t.orderId === threadOrOrderId,
    );
    const isEligible = targetThread ? isDigitalOrderPreparationThread(targetThread) : false;

    return {
      isQueueEligible: isEligible,
      position: isEligible ? 1 : 0,
      aheadCount: 0,
      estimatedMinutesMin: isEligible ? 1 : 0,
      estimatedMinutesMax: isEligible ? 3 : 0,
      estimatedMinutesText: isEligible ? "1 - 3 دقائق" : "غير مدرج بالطابور",
      status: isEligible ? "active" : "not_queued",
      adminStatus,
      workingHoursText: availability.workingHoursText,
    };
  }

  const position = index + 1;
  const aheadCount = index;
  const isFirst = index === 0;
  const status = isFirst ? "serving_now" : "queued";
  const estimatedMinutesMin = isFirst ? 1 : Math.max(2, aheadCount * 2);
  const estimatedMinutesMax = isFirst ? 3 : Math.max(4, aheadCount * 3 + 2);
  const estimatedMinutesText = isFirst
    ? "دورك الآن"
    : `${estimatedMinutesMin}–${estimatedMinutesMax} دقيقة`;

  return {
    isQueueEligible: true,
    position,
    aheadCount,
    estimatedMinutesMin,
    estimatedMinutesMax,
    estimatedMinutesText,
    status,
    adminStatus,
    workingHoursText: availability.workingHoursText,
  };
}
