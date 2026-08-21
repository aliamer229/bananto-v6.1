const fs = require('fs');
let code = fs.readFileSync('src/lib/reviews-coupons.functions.ts', 'utf8');

const replacement = `
    const eligibleUsers =
      typeof coupon.eligibleUsers === "string"
        ? JSON.parse(coupon.eligibleUsers)
        : coupon.eligibleUsers || [];
    if (eligibleUsers.length > 0 && !eligibleUsers.includes(userId)) {
      return { valid: false, message: "هذا الكوبون غير مخصص لحسابك" };
    }

    if (coupon.only_digital_products || coupon.onlyDigitalProducts) {
      const hasPhysical = data.items.some((item) => item.kind === "physical");
      if (hasPhysical) {
        return { valid: false, message: "هذا الكوبون صالح فقط للمنتجات الرقمية." };
      }
    }

    return {
      valid: true,
      coupon: {
        id: coupon.id,
        discountType: coupon.discount_type || coupon.discountType,
        discountValue: coupon.discount_value || coupon.discountValue,
        maxDiscountAmount: coupon.max_discount_amount || coupon.maxDiscountAmount,
      },
    };
`;

code = code.replace(/const eligibleUsers =[\s\S]*?return \{\s*valid: true,[\s\S]*?coupon: \{[\s\S]*?id: coupon.id,[\s\S]*?\},[\s\S]*?\};/g, replacement.trim());
fs.writeFileSync('src/lib/reviews-coupons.functions.ts', code);
