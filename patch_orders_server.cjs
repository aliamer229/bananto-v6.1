const fs = require('fs');

let code = fs.readFileSync('src/lib/orders.server.ts', 'utf8');

const replacement = `
export async function createOrderForUser(
  user: User,
  lines: CheckoutLine[],
  address?: Address,
  couponCode?: string
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
    const coupon = await d1First("SELECT * FROM coupons WHERE code = ? AND is_active = 1", couponCode);
    if (coupon) {
      const isExpired = coupon.expiration_at && new Date(coupon.expiration_at).getTime() < Date.now();
      const meetsMinOrder = itemsTotal >= (coupon.min_order_amount || 0);
      
      let isDigitalOnlyValid = true;
      if (coupon.only_digital_products) {
         isDigitalOnlyValid = !items.some(i => ["hardware", "physical", "accessory", "device", "collectible"].includes(i.kind));
      }
      
      if (!isExpired && meetsMinOrder && isDigitalOnlyValid) {
         const globalUsage = await d1First("SELECT COUNT(*) as total FROM coupon_redemptions WHERE coupon_id = ?", coupon.id);
         const userUsage = await d1First("SELECT COUNT(*) as total FROM coupon_redemptions WHERE coupon_id = ? AND user_id = ?", coupon.id, user.id);
         
         if ((!coupon.usage_limit || (globalUsage?.total || 0) < coupon.usage_limit) && 
             (!coupon.per_user_limit || (userUsage?.total || 0) < coupon.per_user_limit)) {
               
            if (coupon.discount_type === "fixed") {
              discountAmount = coupon.discount_value || 0;
            } else {
              discountAmount = Math.floor(itemsTotal * ((coupon.discount_value || 0) / 100));
            }
            if (coupon.max_discount_amount && discountAmount > coupon.max_discount_amount) {
              discountAmount = coupon.max_discount_amount;
            }
            
            appliedCouponId = coupon.id;
         }
      }
    }
  }
`;

code = code.replace(/export async function createOrderForUser\([\s\S]*?if \(!Number\.isFinite\(itemsTotal\)[\s\S]*?throw new Error\("invalid_total"\);\s*\}/, replacement.trim());


code = code.replace(
  'const needsWalletPayment = items.every((item) =>',
  'const finalItemsTotal = Math.max(0, itemsTotal - discountAmount);\n  const needsWalletPayment = items.every((item) =>'
);

code = code.replace(
  'if (needsWalletPayment && (user.walletBalance || 0) < itemsTotal)',
  'if (needsWalletPayment && (user.walletBalance || 0) < finalItemsTotal)'
);

code = code.replace(
  'const total = itemsTotal + (needsAddress ? deliveryPrice : 0);',
  'const total = finalItemsTotal + (needsAddress ? deliveryPrice : 0);'
);

code = code.replace(
  'const order: Order = {',
  'const order: Order = {\n    discountAmount: discountAmount || undefined,\n    couponCode: appliedCouponId ? couponCode : undefined,'
);

code = code.replace(
  /params: \[itemsTotal, itemsTotal, user\.id\]/g,
  'params: [finalItemsTotal, finalItemsTotal, user.id]'
);

const redempt = `
  if (appliedCouponId) {
    batch.push({
      sql: "INSERT INTO coupon_redemptions (id, coupon_id, user_id, order_id, created_at) VALUES (?, ?, ?, ?, ?)",
      params: [randomId("cpr"), appliedCouponId, user.id, order.id, now]
    });
  }
  await d1Batch(batch);
`;

code = code.replace(
  'await d1Batch(batch);',
  redempt.trim()
);

fs.writeFileSync('src/lib/orders.server.ts', code);
