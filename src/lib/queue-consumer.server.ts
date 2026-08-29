/**
 * Cloudflare Queues consumer and dispatcher for Bananto Store.
 *
 * Implements deterministic message processing, strict payload validation,
 * idempotency tracking, explicit acknowledgement, and backoff retries.
 */

import { publishEnv } from "./env.server";
import { d1Run, d1First } from "./db.server";
import {
  notifyAdminNewOrder,
  notifyAdminCustomerMessage,
  notifyAdminWalletTopUp,
  notifyAdminGameRequest,
  notifyAdminDiscTrade,
  notifyAdminUsedListing,
  notifyUserAdminMessage,
  notifyUserOrderStatus,
} from "./telegram-notifications.server";
import { sendTelegramMessage } from "./telegram.server";
import {
  processAutoScheduledTasks,
  processDigitalDeliveryMaintenance,
  processBotTrading,
} from "./scheduled-jobs.server";

export interface QueueMessageEnvelope<T = any> {
  type: string;
  payload: T;
  id?: string;
  dedupeKey?: string;
  timestamp?: string;
}

export interface CloudflareQueueMessage<T = any> {
  readonly id: string;
  readonly timestamp: Date;
  readonly body: T;
  readonly attempts: number;
  ack(): void;
  retry(options?: { delaySeconds?: number }): void;
}

export interface CloudflareMessageBatch<T = any> {
  readonly queue: string;
  readonly messages: readonly CloudflareQueueMessage<T>[];
  ackAll(): void;
  retryAll(options?: { delaySeconds?: number }): void;
}

/**
 * Ensure idempotent tracking table exists in D1
 */
let ensuredQueueTable = false;
async function ensureQueueTable() {
  if (ensuredQueueTable) return;
  try {
    await d1Run(`
      CREATE TABLE IF NOT EXISTS processed_queue_messages (
        id TEXT PRIMARY KEY,
        queue_name TEXT,
        message_type TEXT,
        attempts INTEGER DEFAULT 1,
        processed_at TEXT NOT NULL
      )
    `);
    ensuredQueueTable = true;
  } catch (err) {
    // If D1 not ready or table exists, ignore
  }
}

/**
 * Check if a message has already been processed idempotently
 */
async function isMessageProcessed(messageId: string): Promise<boolean> {
  try {
    await ensureQueueTable();
    const existing = await d1First<{ id: string }>(
      "SELECT id FROM processed_queue_messages WHERE id = ?",
      messageId,
    );
    return Boolean(existing?.id);
  } catch {
    return false;
  }
}

/**
 * Record message as successfully processed for idempotency
 */
async function markMessageProcessed(
  messageId: string,
  queueName: string,
  messageType: string,
  attempts: number,
) {
  try {
    await ensureQueueTable();
    const now = new Date().toISOString();
    await d1Run(
      `INSERT OR REPLACE INTO processed_queue_messages (id, queue_name, message_type, attempts, processed_at)
       VALUES (?, ?, ?, ?, ?)`,
      messageId,
      queueName,
      messageType,
      attempts,
      now,
    );
  } catch (err) {
    console.warn("[queue:idempotency_mark_failed]", { messageId }, err);
  }
}

/**
 * Dispatch an individual queue message payload
 */
async function handleSingleMessage(
  body: any,
  messageId: string,
  queueName: string,
): Promise<{ ok: boolean; retriable?: boolean; error?: string }> {
  if (!body) {
    return { ok: false, retriable: false, error: "Empty message body" };
  }

  // Parse if body is a string
  let envelope: any = body;
  if (typeof body === "string") {
    try {
      envelope = JSON.parse(body);
    } catch {
      // Non-JSON plain string message
      envelope = { type: "raw_text", payload: body };
    }
  }

  const type = envelope?.type || envelope?.action || envelope?.event || "unknown";
  const payload = envelope?.payload !== undefined ? envelope.payload : envelope;

  switch (type) {
    // 1. Telegram Notifications
    case "telegram_admin_new_order":
    case "notify_admin_order":
      if (payload?.order && payload?.user) {
        await notifyAdminNewOrder(payload);
        return { ok: true };
      }
      return { ok: false, retriable: false, error: "Missing order or user in payload" };

    case "telegram_admin_customer_message":
    case "notify_admin_message":
      if (payload?.thread && payload?.message && payload?.user) {
        await notifyAdminCustomerMessage(payload);
        return { ok: true };
      }
      return { ok: false, retriable: false, error: "Missing thread/message/user in payload" };

    case "telegram_admin_wallet_topup":
    case "notify_admin_topup":
      if (payload?.requestId && payload?.amount && payload?.user) {
        await notifyAdminWalletTopUp(payload);
        return { ok: true };
      }
      return { ok: false, retriable: false, error: "Missing wallet topup fields in payload" };

    case "telegram_admin_game_request":
      if (payload?.request && payload?.user) {
        await notifyAdminGameRequest(payload);
        return { ok: true };
      }
      return { ok: false, retriable: false, error: "Missing game request fields" };

    case "telegram_admin_disc_trade":
      if (payload?.tradeId && payload?.gameName && payload?.user) {
        await notifyAdminDiscTrade(payload);
        return { ok: true };
      }
      return { ok: false, retriable: false, error: "Missing disc trade fields" };

    case "telegram_admin_used_listing":
      if (payload?.listingId && payload?.title && payload?.user) {
        await notifyAdminUsedListing(payload);
        return { ok: true };
      }
      return { ok: false, retriable: false, error: "Missing used listing fields" };

    case "telegram_user_admin_message":
      if (payload?.userId && payload?.threadId && payload?.messageText) {
        await notifyUserAdminMessage(payload);
        return { ok: true };
      }
      return { ok: false, retriable: false, error: "Missing user message fields" };

    case "telegram_user_order_status":
      if (payload?.userId && payload?.order) {
        await notifyUserOrderStatus(payload);
        return { ok: true };
      }
      return { ok: false, retriable: false, error: "Missing user order status fields" };

    case "telegram_send_raw":
      if (payload?.chatId && payload?.text) {
        await sendTelegramMessage(payload.chatId, payload.text, payload.options);
        return { ok: true };
      }
      return { ok: false, retriable: false, error: "Missing chatId or text" };

    // 2. Scheduled / Background jobs via Queue
    case "scheduled_tasks":
    case "process_auto_scheduled_tasks":
      await processAutoScheduledTasks();
      return { ok: true };

    case "digital_delivery_maintenance":
    case "process_digital_delivery":
      await processDigitalDeliveryMaintenance(payload?.now);
      return { ok: true };

    case "process_bot_trading":
      await processBotTrading();
      return { ok: true };

    case "chat_queue_process":
    case "process_inactivity_and_queue": {
      const { processInactivityAndQueue } = await import("./chat-queue.server");
      await processInactivityAndQueue();
      return { ok: true };
    }

    // 3. Digital order delivery items auto-completions
    case "auto_complete_delivery": {
      if (payload?.deliveryItemId) {
        const { completeDeliveryItem } = await import("./order-delivery-items.server");
        await completeDeliveryItem(payload.deliveryItemId, payload.adminId || "system_queue");
        return { ok: true };
      }
      return { ok: false, retriable: false, error: "Missing deliveryItemId" };
    }

    default:
      console.log(`[queue:${queueName}] Acknowledged message of type '${type}'`);
      return { ok: true };
  }
}

/**
 * Main Cloudflare Queue batch consumer handler
 */
export async function handleQueueBatch(
  batch: CloudflareMessageBatch,
  env: any,
  ctx?: any,
): Promise<void> {
  if (env) {
    publishEnv(env);
  }

  const queueName = batch.queue || "default";
  console.log(`[queue:${queueName}] Processing batch with ${batch.messages.length} messages`);

  for (const message of batch.messages) {
    const messageId = message.id || `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const attempts = message.attempts || 1;

    try {
      // 1. Idempotency Check
      const dedupeKey =
        (message.body as any)?.dedupeKey ||
        (message.body as any)?.id ||
        messageId;

      if (await isMessageProcessed(dedupeKey)) {
        console.log(`[queue:${queueName}] Skipping already processed message ${dedupeKey}`);
        message.ack();
        continue;
      }

      // 2. Process Message
      const result = await handleSingleMessage(message.body, messageId, queueName);

      if (result.ok) {
        // 3. Mark processed & Ack
        await markMessageProcessed(dedupeKey, queueName, (message.body as any)?.type || "unknown", attempts);
        message.ack();
      } else {
        if (result.retriable && attempts < 5) {
          console.warn(`[queue:${queueName}] Retrying message ${messageId}: ${result.error}`);
          const delaySeconds = Math.min(300, Math.pow(2, attempts) * 5);
          message.retry({ delaySeconds });
        } else {
          console.error(`[queue:${queueName}] Permanent message failure ${messageId}: ${result.error}`);
          // Acknowledge permanent bad messages so they don't block the queue
          message.ack();
        }
      }
    } catch (err: any) {
      console.error(`[queue:${queueName}] Unhandled exception in message ${messageId}:`, err);
      if (attempts < 5) {
        const delaySeconds = Math.min(300, Math.pow(2, attempts) * 5);
        message.retry({ delaySeconds });
      } else {
        console.error(`[queue:${queueName}] Max attempts exceeded for message ${messageId}`);
        message.ack();
      }
    }
  }
}
