import { useState } from "react";
import { useI18n } from "../i18n";
import { ShoppingCart, CheckCircle2, ArrowRight, Loader2, Trash2 } from "lucide-react";
import { playSound, preloadSound } from "../utils/audio";
import { cdnImage } from "@/lib/img";
import { useCartStore } from "../store/useCartStore";
import { useCurrency } from "../context/CurrencyContext";

preloadSound("loading");
preloadSound("bumper_end");
preloadSound("hover");

export default function CartView() {
  const { t } = useI18n();
  const { formatIQDPrice } = useCurrency();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const { lines, remove, clear } = useCartStore();

  const handleCheckout = async () => {
    setIsSubmitting(true);

    try {
      const totalAmount = lines.reduce((sum, item) => sum + item.price * item.quantity, 0);
      await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: "مستخدم المتجر",
          total: totalAmount.toFixed(2),
        }),
      });
      setIsSubmitting(false);
      setIsSuccess(true);
      clear();
      playSound("bumper_end", 0.6);
    } catch (e) {
      setIsSubmitting(false);
    }
  };

  const totalAmount = lines.reduce((sum, item) => sum + item.price * item.quantity, 0);

  if (isSuccess) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center animate-in fade-in zoom-in duration-500">
        <div className="w-24 h-24 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-6 shadow-lg shadow-green-100/50">
          <CheckCircle2 className="w-12 h-12" />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">{t("تم إنشاء الطلب بنجاح")}</h2>
        <p className="text-muted-foreground mb-8 max-w-sm">
          {t("شكراً لك! سيتم معالجة طلبك قريباً. يمكنك متابعة حالة الطلب من صفحة حسابك.")}
        </p>
        <button
          onClick={() => setIsSuccess(false)}
          className="px-8 py-3 bg-blue-600 text-white font-bold rounded-xl shadow-lg shadow-blue-200 hover:bg-blue-700 hover:shadow-xl transition-all active:scale-95"
        >
          {t("العودة للتسوق")}
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 pb-24 h-full flex flex-col max-w-3xl mx-auto animate-in fade-in duration-300 pt-24">
      <div className="flex items-center gap-3 mb-6">
        <ShoppingCart className="w-6 h-6 text-foreground" />
        <h1 className="text-2xl font-bold text-foreground">{t("سلة المشتريات")}</h1>
      </div>

      {lines.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
          <ShoppingCart className="w-16 h-16 mb-4 opacity-50" />
          <p className="text-lg">{t("السلة فارغة")}</p>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto no-scrollbar space-y-4">
            {lines.map((item) => (
              <div
                key={String(item.productId)}
                className="flex items-center gap-4 p-4 bg-card rounded-2xl shadow-sm border border-border"
              >
                {item.image && (
                  <img
                    src={cdnImage(item.image)}
                    alt={item.title}
                    className="w-16 h-20 object-cover rounded-xl shadow-sm"
                  />
                )}
                <div className="flex-1" dir="ltr">
                  <h3 className="font-bold text-foreground line-clamp-1">{item.title}</h3>
                  <div className="text-blue-600 font-bold mt-1">
                    {formatIQDPrice(item.price)} × {item.quantity}
                  </div>
                  {item.offerLabel && (
                    <div className="text-xs text-muted-foreground">{item.offerLabel}</div>
                  )}
                </div>
                <button
                  onPointerDown={() => playSound("bumper_end", 0.6)}
                  onClick={() =>
                    remove(
                      item.productId,
                      item.offerKind,
                      item.optionId,
                      item.typeId,
                      item.editionId,
                    )
                  }
                  className="p-2 text-red-500 hover:bg-red-50 rounded-full transition-colors"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>

          <div className="bg-card p-6 rounded-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.05)] border border-border mt-6">
            <div className="flex justify-between items-center mb-6">
              <span className="text-muted-foreground">{t("المجموع")}</span>
              <span className="text-2xl font-bold text-foreground">
                {formatIQDPrice(totalAmount)}
              </span>
            </div>

            <button
              onPointerDown={() => playSound("loading", 0.6)}
              onClick={handleCheckout}
              disabled={isSubmitting}
              className={`w-full py-4 rounded-2xl font-bold text-lg flex items-center justify-center gap-2 transition-all active:scale-[0.98]
                ${
                  isSubmitting
                    ? "bg-muted text-muted-foreground cursor-not-allowed"
                    : "bg-blue-600 text-white shadow-lg shadow-blue-200 hover:bg-blue-700 hover:shadow-xl"
                }`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-6 h-6 animate-spin" />
                  <span>{t("جاري إنشاء الطلب...")}</span>
                </>
              ) : (
                <>
                  <span>{t("إتمام الطلب")}</span>
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
