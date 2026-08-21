import { encryptSecretValue, randomId } from "./crypto.server";
import {
  appendMessage,
  findUserById,
  getStore,
  saveOrder,
  saveThread,
  d1Run,
  d1First,
  getOrder,
  d1Batch,
  d1All,
} from "./db.server";
import { sendTelegramMessage } from "./telegram.server";
import { checkCoupon, couponDiscount, rowToCoupon, type CouponRow } from "./coupons";
import type {
  Address,
  Order,
  OrderItem,
  ProductKind,
  User,
  Product,
  AccountBundle,
  WalletTransactionKind,
  WalletTransaction,
  WalletRechargeRequest,
  BananCode,
  Thread,
  ChatMessage,
} from "./types";

export interface CheckoutLine {
  productId: string | number;
  quantity: number;
  editionId?: string;
  dlcIds?: string[];
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  const digits = String(value ?? "").replace(/[^0-9.]/g, "");
  const parsed = Number.parseFloat(digits);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Server-side validation of a cart line to ensure price and availability are real.
 */
async function validateLine(
  line: CheckoutLine,
  store: { products: Product[]; bundles?: AccountBundle[] },
): Promise<OrderItem | null> {
  const product = store.products.find((p) => String(p.id) === String(line.productId));
  const bundle = store.bundles?.find((b) => String(b.id) === String(line.productId));

  if (!product && bundle) {
    if (bundle.isActive === false) return null;
    return {
      id: randomId("itm"),
      productId: bundle.id,
      title: bundle.title,
      ...(bundle.image ? { image: String(bundle.image) } : {}),
      kind: "bundle",
      quantity: Math.max(1, Math.min(99, Math.floor(Number(line.quantity) || 1))),
      unitPrice: toNumber(bundle.price),
      meta: {
        bundleGameIds: bundle.gameIds,
      } as any,
    };
  }

  if (!product || product.isActive === false || (product as any).status === "غير نشط") return null;

  let unitPrice = toNumber(product.price);
  let title = product.title;

  // Handle Editions
  if (line.editionId && product.editions) {
    const edition = product.editions.find((e) => e.id === line.editionId);
    if (edition) {
      unitPrice = edition.price;
      title = `${title} (${edition.name})`;
    }
  }

  // Handle DLCs
  const selectedDlcs = [];
  if (line.dlcIds && product.dlcs) {
    for (const dlcId of line.dlcIds) {
      const dlc = product.dlcs.find((d) => d.id === dlcId);
      if (dlc) {
        unitPrice += dlc.price;
        selectedDlcs.push(dlc.name);
      }
    }
  }
  if (selectedDlcs.length > 0) {
    title = `${title} + ${selectedDlcs.join(", ")}`;
  }

  const kind: ProductKind = (product.kind as ProductKind) ?? "account";

  return {
    id: randomId("itm"),
    productId: product.id,
    title,
    ...(product.image ? { image: String(product.image) } : {}),
    kind,
    quantity: Math.max(1, Math.min(99, Math.floor(Number(line.quantity) || 1))),
    unitPrice,
    meta: {
      editionId: line.editionId ?? null,
      dlcIds: line.dlcIds ?? null,
    },
  };
}

export async function createOrderForUser(
  user: User,
  lines: CheckoutLine[],
  address?: Address,
  couponCode?: string,
): Promise<Order> {
  const store = await getStore();
  const items: OrderItem[] = [];

  for (const line of lines) {
    const validated = await validateLine(line, store);
    if (validated) items.push(validated);
  }

  if (!items.length) throw new Error("cart_empty");

  const itemsTotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  if (!Number.isFinite(itemsTotal) || itemsTotal <= 0 || itemsTotal > 1_000_000_000) {
    throw new Error("invalid_total");
  }

  const now = new Date().toISOString();
  let discountAmount = 0;
  let appliedCouponId: string | null = null;

  if (couponCode) {
    const row = await d1First<CouponRow>(
      "SELECT * FROM coupons WHERE code = ? AND is_active = 1",
      couponCode,
    );
    if (!row) throw new Error("coupon_invalid");

    // Mapped through the same reader the validator uses, so what the member was
    // told at the cart is exactly what checkout applies.
    const coupon = rowToCoupon(row);
    const [globalUsage, userUsage] = await Promise.all([
      d1First<{ total: number }>(
        "SELECT COUNT(*) as total FROM coupon_redemptions WHERE coupon_id = ?",
        coupon.id,
      ),
      d1First<{ total: number }>(
        "SELECT COUNT(*) as total FROM coupon_redemptions WHERE coupon_id = ? AND user_id = ?",
        coupon.id,
        user.id,
      ),
    ]);

    const verdict = checkCoupon({
      coupon,
      userId: user.id,
      orderAmount: itemsTotal,
      items,
      globalUses: Number(globalUsage?.total ?? 0),
      userUses: Number(userUsage?.total ?? 0),
    });
    if (!verdict.ok) throw new Error("coupon_invalid");

    discountAmount = couponDiscount(coupon, itemsTotal);
    appliedCouponId = coupon.id;
  }

  const finalItemsTotal = Math.max(0, itemsTotal - discountAmount);
  const needsWalletPayment = items.every((item) =>
    ["account", "offline_account", "online_account", "bundle", "preorder", "digital_code"].includes(
      item.kind,
    ),
  );

  if (needsWalletPayment && (user.walletBalance || 0) < finalItemsTotal) {
    throw new Error("insufficient_balance");
  }

  const deliveryBase = toNumber(store.settings?.["deliveryBase"] || 5000);
  const deliveryExceptions = (
    Array.isArray(store.settings?.["deliveryExceptions"])
      ? store.settings["deliveryExceptions"]
      : []
  ) as { city: string; price: number }[];

  let deliveryPrice = deliveryBase;
  if (address?.city) {
    const exception = deliveryExceptions.find((e) => e.city === address.city);
    if (exception) deliveryPrice = toNumber(exception.price);
  }

  const needsAddress = items.some((item) =>
    ["hardware", "physical", "accessory", "device", "collectible"].includes(item.kind),
  );
  const total = finalItemsTotal + (needsAddress ? deliveryPrice : 0);

  const orderId = randomId("ord");
  const threadId = randomId("thr");
  const code = `BN-${Date.now().toString().slice(-6)}`;

  const order: Order = {
    discountAmount: discountAmount || undefined,
    couponCode: appliedCouponId ? couponCode : undefined,
    id: orderId,
    code,
    userId: user.id,
    userName: user.name,
    items,
    total,
    currency: "IQD",
    // A wallet purchase is paid the moment it is created, so it goes straight to
    // preparation. Leaving it "pending" is what made a paid order read back to
    // the member as "awaiting payment" while also saying "paid".
    status: needsWalletPayment ? "processing" : "pending",
    paymentStatus: needsWalletPayment ? "paid" : "unpaid",
    needsAddress,
    ...(address ? { address } : {}),
    threadId,
    createdAt: now,
    updatedAt: now,
    events: [{ type: "order_created", at: now }],
  };

  if (needsWalletPayment) {
    const payment = await d1Batch([
      {
        sql: `UPDATE users SET wallet_balance = CASE WHEN wallet_balance >= ? THEN wallet_balance - ? ELSE NULL END WHERE id = ?`,
        params: [finalItemsTotal, finalItemsTotal, user.id],
      },
      {
        sql: `INSERT INTO wallet_transactions (id, user_id, kind, amount, description, order_id, created_at)
               SELECT ?, ?, 'payment', ?, ?, ?, ? WHERE changes() = 1`,
        params: [randomId("wlt"), user.id, -itemsTotal, `شراء طلب ${code}`, orderId, now],
      },
      {
        sql: `INSERT INTO orders (id, code, user_id, doc, created_at, updated_at)
              SELECT ?, ?, ?, ?, ?, ? WHERE changes() = 1`,
        params: [order.id, order.code, order.userId, JSON.stringify(order), now, now],
      },
    ]);
    if (Number(payment[0]?.meta?.changes ?? 0) !== 1) {
      throw new Error("insufficient_balance");
    }
  }

  try {
    await saveOrder(order);
  } catch (err) {
    console.error("[order:save_fallback]", err);
  }

  // Snapshot Order Items (Safe)
  try {
    for (const item of items) {
      await d1Run(
        `INSERT INTO order_items_snapshot (
          id, order_id, product_id, title, price_iqd, quantity, options_json, image_url, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        randomId("snap"),
        orderId,
        item.productId,
        item.title,
        item.unitPrice,
        item.quantity,
        JSON.stringify(item.meta || {}),
        item.image || null,
        now,
      );
    }
  } catch (err) {
    console.error("[order:snapshot_failed]", err);
  }

  // Reward Banana Calculation (Safe)
  try {
    const bananaEligible = items.every((item) => !["hardware", "device"].includes(item.kind));
    if (bananaEligible && order.paymentStatus === "paid") {
      const rewardRate = toNumber(store.settings?.["banana_reward_rate"] || 6.8);
      const bananaReward = Math.floor(itemsTotal * rewardRate);

      const existingReward = await d1First(
        `SELECT id FROM banana_ledger WHERE user_id = ? AND reference_id = ? AND type = 'reward'`,
        user.id,
        orderId,
      );

      if (bananaReward > 0 && !existingReward) {
        await d1Batch([
          {
            sql: `UPDATE users SET banana_balance = banana_balance + ? WHERE id = ?`,
            params: [bananaReward, user.id],
          },
          {
            sql: `INSERT INTO banana_ledger (id, user_id, amount, type, direction, balance_before, balance_after, reference_type, reference_id, created_at)
                  SELECT ?, ?, ?, 'reward', 'in', ?, ?, 'order', ?, ? WHERE changes() = 1`,
            params: [
              randomId("blg"),
              user.id,
              bananaReward,
              user.bananaBalance || 0,
              (user.bananaBalance || 0) + bananaReward,
              orderId,
              now,
            ],
          },
        ]);
      }
    }
  } catch (err) {
    console.error("[order:banana_ledger_failed]", err);
  }

  // Create Review Placeholder (Safe)
  try {
    const reviewDueAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    for (const item of items) {
      await d1Run(
        `INSERT INTO product_reviews (id, product_id, user_id, order_id, status, is_auto_review, review_due_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'pending', 0, ?, ?, ?)`,
        randomId("rev"),
        item.productId,
        user.id,
        orderId,
        reviewDueAt,
        now,
        now,
      );
    }
  } catch (err) {
    console.error("[order:review_placeholder_failed]", err);
  }

  // Initial status history (Safe)
  try {
    await d1Run(
      `INSERT INTO order_status_history (id, order_id, old_status, new_status, changed_by, note, created_at)
       VALUES (?, ?, null, 'pending', 'system', 'Order created', ?)`,
      randomId("osh"),
      orderId,
      now,
    );

    await d1Run(
      `INSERT INTO order_status_history_v2 (
        id, order_id, old_status, new_status, changed_by_user_id, changed_by_role, reason, created_at
      ) VALUES (?, ?, null, 'pending', ?, 'SYSTEM', 'Order created', ?)`,
      randomId("oshv2"),
      orderId,
      user.id,
      now,
    );
  } catch (err) {
    console.error("[order:status_history_failed]", err);
  }

  // If digital, add to queue (Safe)
  if (needsWalletPayment) {
    try {
      await d1Run(
        `INSERT INTO order_queue (id, order_id, status, created_at, updated_at)
         VALUES (?, ?, 'waiting', ?, ?)`,
        randomId("que"),
        orderId,
        now,
        now,
      );
    } catch (err) {
      console.error("[order:queue_failed]", err);
    }
  }

  // Save Support Thread
  try {
    await saveThread({
      id: threadId,
      userId: user.id,
      userName: user.name,
      orderId,
      subject: `طلب ${code}`,
      status: "open",
      mode: "AI_ACTIVE",
      lastMessageAt: now,
      createdAt: now,
    });

    const intro = store.adminPresence?.online
      ? (store.autoReplies?.onlineIntro ?? "")
      : (store.autoReplies?.offlineIntro ?? "");

    await appendMessage(threadId, {
      senderRole: "system",
      kind: "system",
      body: { text: intro || `تم إنشاء الطلب ${code}. سيتم متابعة طلبك هنا.` },
    });

    // Append system digital order card containing games / accounts details
    if (needsWalletPayment) {
      await appendMessage(threadId, {
        senderRole: "system",
        kind: "system",
        body: {
          type: "digital_order_card",
          orderId: order.id,
          code: order.code,
          items: order.items.map((it) => ({
            id: it.id,
            productId: it.productId,
            title: it.title,
            unitPrice: it.unitPrice,
            quantity: it.quantity,
            image: it.image || "",
            kind: it.kind,
          })),
          total: order.total,
          currency: order.currency,
          paymentStatus: "paid",
          text: `🎮 تم تأكيد طلبك الرقمي (${order.code}) بنجاح!\nالمبلغ المدفوع من المحفظة: ${order.total.toLocaleString()} د.ع\nيقوم فريق الدعم حالياً بتجهيز بيانات الحساب والرمز وإرسالها لك في هذه المحادثة.`,
        },
      });
    }

    if (!needsWalletPayment) {
      await appendMessage(threadId, {
        senderRole: "system",
        kind: "payment_methods_card",
        body: {
          total,
          currency: "IQD",
          code,
          methods: store.paymentMethods?.length
            ? store.paymentMethods
            : [
                {
                  id: "zaincash",
                  name: "ZainCash",
                  details: "أرسل المبلغ ثم ارفع صورة الإيصال هنا",
                },
              ],
        },
      });
    }
  } catch (err) {
    console.error("[order:thread_message_failed]", err);
  }

  // Notify Telegram Admin and User (Safe)
  try {
    const { notifyAdminNewOrder } = await import("./telegram-notifications.server");
    await notifyAdminNewOrder({
      order,
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        username: user.username,
      },
    });
  } catch (err) {
    console.error("[order:admin_telegram_notify_failed]", err);
  }

  if (user.telegramId) {
    try {
      const { telegramMiniAppDeepLink } = await import("./telegram.server");
      await sendTelegramMessage(
        user.telegramId,
        `✅ <b>تم إنشاء طلبك بنجاح</b>\n\nرقم الطلب: <code>${code}</code>\nالإجمالي: <b>${total.toLocaleString()} د.ع</b>\n\nاضغط أدناه لمتابعة طلبك مباشرة في تليكرام 👇`,
        {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "🎮 متابعة الطلب والمحادثة",
                  url: telegramMiniAppDeepLink(`order_${order.id}`),
                },
              ],
            ],
          },
        },
      );
    } catch (err) {
      console.error("[order:telegram_notify_failed]", err);
    }
  }

  return order;
}

export async function stageCredentials(
  order: Order,
  itemId: string,
  email: string,
  password?: string,
): Promise<Order> {
  const items = await Promise.all(
    order.items.map(async (item) => {
      if (item.id !== itemId) return item;
      if (item.credsSentAt) throw new Error("credentials_already_sent");
      return {
        ...item,
        deliveryEmail: email,
        ...(password ? { deliveryPasswordEnc: await encryptSecretValue(password) } : {}),
      };
    }),
  );
  const next: Order = {
    ...order,
    items,
    updatedAt: new Date().toISOString(),
    events: [
      ...order.events,
      { type: "credentials_staged", at: new Date().toISOString(), payload: { itemId } },
    ],
  };
  await saveOrder(next);
  return next;
}

export async function claimOrderTask(orderId: string, staffId: string): Promise<boolean> {
  const now = new Date().toISOString();
  await d1Run(
    `UPDATE order_queue 
     SET assigned_staff_id = ?, status = 'processing', updated_at = ? 
     WHERE order_id = ? AND (status = 'waiting' OR assigned_staff_id = ?)`,
    staffId,
    now,
    orderId,
    staffId,
  );

  await createAuditLog(staffId, "claim_order", "order", orderId, { action: "claimed" });
  return true;
}

export async function completeOrderTask(orderId: string, staffId: string): Promise<boolean> {
  const now = new Date().toISOString();

  const task = await d1First<{ assigned_staff_id: string }>(
    `SELECT assigned_staff_id FROM order_queue WHERE order_id = ?`,
    orderId,
  );

  if (!task || task.assigned_staff_id !== staffId) {
    throw new Error("Task not assigned to this staff member");
  }

  await d1Run(
    `UPDATE order_queue SET status = 'completed', updated_at = ? WHERE order_id = ?`,
    now,
    orderId,
  );

  const order = await getOrder(orderId);
  if (order) {
    await updateOrderStatus({
      orderId,
      newStatus: "completed",
      changedByUserId: staffId,
      changedByRole: "ADMIN",
      reason: "Order completed by staff",
    });
  }

  return true;
}

export async function updateOrderStatus(params: {
  orderId: string;
  newStatus: string;
  changedByUserId: string;
  changedByRole: "USER" | "ADMIN" | "SUPPORT_AGENT" | "SYSTEM";
  reason?: string;
  metadata?: Record<string, any>;
}) {
  const { orderId, newStatus, changedByUserId, changedByRole, reason, metadata } = params;
  const order = await getOrder(orderId);
  if (!order) throw new Error("Order not found");

  const oldStatus = order.status;
  const now = new Date().toISOString();

  const next: Order = {
    ...order,
    status: newStatus as any,
    updatedAt: now,
    events: [
      ...order.events,
      { type: "status_changed", at: now, payload: { oldStatus, newStatus, reason } },
    ],
  };
  await saveOrder(next);

  await d1Run(
    `INSERT INTO order_status_history (id, order_id, old_status, new_status, changed_by, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    randomId("osh"),
    orderId,
    oldStatus,
    newStatus,
    changedByUserId,
    reason || null,
    now,
  );

  await d1Run(
    `INSERT INTO order_status_history_v2 (
      id, order_id, old_status, new_status, changed_by_user_id, changed_by_role, reason, metadata_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    randomId("oshv2"),
    orderId,
    oldStatus,
    newStatus,
    changedByUserId,
    changedByRole,
    reason || null,
    JSON.stringify(metadata || {}),
    now,
  );

  await createAuditLog(changedByUserId, "update_order_status", "order", orderId, {
    oldStatus,
    newStatus,
    reason,
  });

  return next;
}

export async function createAuditLog(
  userId: string,
  action: string,
  entityType?: string,
  entityId?: string,
  details?: any,
) {
  await d1Run(
    `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    randomId("aud"),
    userId,
    action,
    entityType || null,
    entityId || null,
    details ? JSON.stringify(details) : null,
    new Date().toISOString(),
  );
}
