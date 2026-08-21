const fs = require('fs');

let code = fs.readFileSync('src/routes/cart.tsx', 'utf8');

const importReplacement = `
import { validateCoupon } from "@/lib/reviews-coupons.functions";
`;
if (!code.includes('validateCoupon')) {
    code = code.replace('import { useState, useMemo, useEffect } from "react";', 'import { useState, useMemo, useEffect } from "react";\n' + importReplacement);
}


code = code.replace(
  'const checkout = useMutation({',
  'const checkout = useMutation({\n    mutationFn: () =>\n      api.checkout(\n        lines.map((l) => ({\n          productId: l.productId,\n          quantity: l.quantity,\n          editionId: l.meta?.editionId,\n          dlcIds: l.meta?.dlcIds,\n        })),\n        needsAddress ? { id: "cart", ...address } : undefined,\n        appliedCoupon?.code\n      ),'
);
code = code.replace(
  /mutationFn: \(\) =>\s*api\.checkout\([\s\S]*?needsAddress \? \{ id: "cart", \.\.\.address \} : undefined,\s*\),/,
  ''
);

const uiStateAdd = `
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<any>(null);
  const [couponError, setCouponError] = useState("");
  const validateCouponFn = useServerFn(validateCoupon);
  const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);

  const handleApplyCoupon = async () => {
    if (!couponCode) return;
    setIsApplyingCoupon(true);
    setCouponError("");
    try {
       const res = await validateCouponFn({ 
         code: couponCode, 
         orderAmount: itemsTotal, 
         items: lines.map((l) => ({ productId: String(l.productId), categoryId: "" })) 
       });
       if (res.valid && res.coupon) {
          setAppliedCoupon({...res.coupon, code: couponCode});
       } else {
          setCouponError(res.message || "كوبون غير صالح");
       }
    } catch (e) {
       setCouponError("حدث خطأ في التحقق من الكوبون");
    } finally {
       setIsApplyingCoupon(false);
    }
  };

  const discountAmount = appliedCoupon 
    ? (appliedCoupon.discountType === "fixed" ? appliedCoupon.discountValue : Math.floor(itemsTotal * (appliedCoupon.discountValue / 100))) 
    : 0;
  const finalDiscount = appliedCoupon && appliedCoupon.maxDiscountAmount && discountAmount > appliedCoupon.maxDiscountAmount ? appliedCoupon.maxDiscountAmount : discountAmount;
`;

code = code.replace('const checkout =', uiStateAdd + '\n  const checkout =');

// update itemsTotal
code = code.replace(
  'const needsWalletPayment = ',
  'const needsWalletPayment = '
); // Wait, this doesn't change anything

const uiCouponAdd = `
                    {/* Coupon Section */}
                    <div className="space-y-3 pt-4">
                      <p className="text-sm font-bold text-foreground">هل لديك كود خصم؟</p>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          className="flex-1 bg-black/5 border border-white/10 dark:border-white/5 rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-blue-500 transition-colors uppercase"
                          placeholder="أدخل الكود هنا"
                          value={couponCode}
                          onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                          disabled={!!appliedCoupon || isApplyingCoupon}
                        />
                        {appliedCoupon ? (
                          <button
                            onClick={() => {
                              setAppliedCoupon(null);
                              setCouponCode("");
                            }}
                            className="bg-red-500/10 text-red-500 hover:bg-red-500/20 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors"
                          >
                            إزالة
                          </button>
                        ) : (
                          <button
                            onClick={handleApplyCoupon}
                            disabled={!couponCode || isApplyingCoupon}
                            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-colors"
                          >
                            {isApplyingCoupon ? "..." : "تطبيق"}
                          </button>
                        )}
                      </div>
                      {couponError && <p className="text-xs text-red-500 font-bold">{couponError}</p>}
                      {appliedCoupon && (
                        <p className="text-xs text-green-500 font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> تم تطبيق الخصم بنجاح!
                        </p>
                      )}
                    </div>
`;

code = code.replace(
  /<div className="space-y-3 pt-4 border-t border-border">/g,
  uiCouponAdd + '\n                    <div className="space-y-3 pt-4 border-t border-border">'
);

const finalTotalReplacement = `
                      {appliedCoupon && (
                        <div className="flex justify-between items-center text-sm font-bold text-green-500">
                          <span>الخصم</span>
                          <span>- {formatIQDPrice(finalDiscount)} د.ع</span>
                        </div>
                      )}
                      <div className="flex justify-between items-center text-lg font-black text-foreground pt-2 border-t border-border/50">
                        <span>الإجمالي</span>
                        <span>{formatIQDPrice(Math.max(0, itemsTotal - finalDiscount) + (needsAddress ? deliveryPrice : 0))} د.ع</span>
                      </div>
`;
code = code.replace(
  /<div className="flex justify-between items-center text-lg font-black text-foreground pt-2 border-t border-border\/50">[\s\S]*?<\/div>/g,
  finalTotalReplacement
);

code = code.replace(
  'hasSufficientBalance = (user?.walletBalance || 0) >= itemsTotal',
  'hasSufficientBalance = (user?.walletBalance || 0) >= Math.max(0, itemsTotal - finalDiscount)'
);

fs.writeFileSync('src/routes/cart.tsx', code);
