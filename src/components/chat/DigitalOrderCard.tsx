import { useState } from "react";
import {
  Check,
  Copy,
  Gamepad2,
  Sparkles,
  ShieldCheck,
  Clock,
  ExternalLink,
  ChevronRight,
  Zap,
} from "lucide-react";
import { Link } from "@tanstack/react-router";

export interface DigitalOrderItem {
  id?: string;
  productId?: string;
  title: string;
  unitPrice?: number;
  quantity?: number;
  image?: string;
  kind?: string;
}

export interface DigitalOrderCardProps {
  orderId?: string;
  code?: string;
  items?: DigitalOrderItem[];
  total?: number;
  currency?: string;
  paymentStatus?: string;
  text?: string;
  locale?: "ar" | "en";
}

export function DigitalOrderCard({
  orderId,
  code = "BN-ORDER",
  items = [],
  total,
  currency = "د.ع",
  paymentStatus = "paid",
  text,
  locale = "ar",
}: DigitalOrderCardProps) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const isPaid = paymentStatus === "paid";

  return (
    <div
      id={`digital-order-card-${code}`}
      className="w-full max-w-lg my-3 rounded-2xl border border-amber-500/30 bg-gradient-to-b from-amber-500/10 via-amber-950/20 to-neutral-900/90 text-neutral-100 p-4 sm:p-5 shadow-xl shadow-amber-950/20 backdrop-blur-md transition-all animate-in fade-in slide-in-from-bottom-2 duration-300"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-amber-500/20">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-amber-500 to-yellow-400 text-neutral-950 flex items-center justify-center font-bold shadow-md shadow-amber-500/30 shrink-0">
            <Gamepad2 className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-black tracking-wider uppercase text-amber-400">
                {locale === "ar" ? "طلب رقمي معتمد" : "Digital Order"}
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                <Zap className="h-3 w-3" />
                {locale === "ar" ? "تجهيز فوري" : "Instant"}
              </span>
            </div>
            <div className="text-sm font-bold text-neutral-200 truncate">
              {locale === "ar" ? "بطاقة متابعة الحسابات والألعاب" : "Account & Game Fulfillment"}
            </div>
          </div>
        </div>

        {/* Copy Code */}
        <button
          type="button"
          onClick={onCopy}
          aria-label={`Copy order code ${code}`}
          className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-neutral-800/80 hover:bg-neutral-700/80 border border-neutral-700/80 text-xs font-mono font-bold text-amber-300 transition-all active:scale-95"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-emerald-400">{locale === "ar" ? "تم النسخ" : "Copied"}</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5 opacity-70" />
              <span>{code}</span>
            </>
          )}
        </button>
      </div>

      {/* Description / Status Note */}
      <div className="my-3 text-xs leading-relaxed text-neutral-300 bg-neutral-950/40 border border-white/5 rounded-xl p-3">
        <p className="whitespace-pre-line font-medium">
          {text ||
            (locale === "ar"
              ? `🎮 تم استلام طلبك الرقمي (${code}) بنجاح!\nيقوم فريق الدعم الآن بمراجعة الطلب وتجهيز بيانات الحساب والرمز وإرسالها لك مباشرة في هذه المحادثة.`
              : `🎮 Your digital order (${code}) has been received!\nSupport is preparing your account credentials and will deliver them in this chat.`)}
        </p>
      </div>

      {/* Items list */}
      {items.length > 0 && (
        <div className="space-y-2 mb-3">
          <div className="text-[11px] font-bold tracking-wider text-neutral-400 uppercase">
            {locale === "ar" ? "المنتجات المطلوبة" : "Ordered Items"}
          </div>
          <div className="space-y-1.5">
            {items.map((item, idx) => (
              <div
                key={item.id || `${item.title}-${idx}`}
                className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-neutral-800/50 border border-neutral-700/40 text-xs"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {item.image ? (
                    <img
                      src={item.image}
                      alt={item.title}
                      className="h-8 w-8 rounded-lg object-cover bg-neutral-900 shrink-0 border border-neutral-700/50"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="h-8 w-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/20">
                      <Gamepad2 className="h-4 w-4" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="font-semibold text-neutral-200 truncate">{item.title}</div>
                    <div className="text-[10px] text-neutral-400">
                      {locale === "ar" ? "حساب رقمي لجهاز Nintendo Switch" : "Digital Account"}
                      {item.quantity && item.quantity > 1 ? ` × ${item.quantity}` : ""}
                    </div>
                  </div>
                </div>

                {typeof item.unitPrice === "number" && (
                  <div className="shrink-0 font-bold text-amber-300 font-mono text-xs">
                    {(item.unitPrice * (item.quantity || 1)).toLocaleString()}{" "}
                    <span className="text-[10px] text-neutral-400">{currency}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Progress / Status Steps */}
      <div className="rounded-xl bg-neutral-950/60 border border-amber-500/20 p-3 mb-3">
        <div className="text-[11px] font-bold text-amber-400 mb-2 flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5" />
          <span>{locale === "ar" ? "مسار التجهيز والتسليم" : "Fulfillment Stages"}</span>
        </div>
        <div className="space-y-2 text-xs">
          <div className="flex items-center gap-2 text-emerald-400 font-semibold">
            <div className="h-5 w-5 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0 border border-emerald-500/40">
              <Check className="h-3 w-3" />
            </div>
            <span className="flex-1">
              {locale === "ar"
                ? `1. تأكيد الطلب والدفع (${isPaid ? "مدفوع من المحفظة ✅" : "مؤكد"})`
                : "1. Order Confirmed & Paid"}
            </span>
          </div>

          <div className="flex items-center gap-2 text-amber-300 font-semibold">
            <div className="h-5 w-5 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0 border border-amber-500/40 animate-pulse">
              <Zap className="h-3 w-3 text-amber-400" />
            </div>
            <span className="flex-1">
              {locale === "ar"
                ? "2. إشعار الإدارة فوراً عبر تليكرام لبدء التجهيز 🚀"
                : "2. Admin Notified via Telegram for Preparation"}
            </span>
          </div>

          <div className="flex items-center gap-2 text-neutral-400 font-medium">
            <div className="h-5 w-5 rounded-full bg-neutral-800 flex items-center justify-center shrink-0 border border-neutral-700">
              <Clock className="h-3 w-3" />
            </div>
            <span className="flex-1">
              {locale === "ar"
                ? "3. إرسال بطاقة بيانات الحساب والرمز هنا في المحادثة"
                : "3. Account Credentials Delivered in this Chat"}
            </span>
          </div>
        </div>
      </div>

      {/* Footer / Total & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-amber-500/20 text-xs">
        {typeof total === "number" && (
          <div className="flex items-center gap-1.5">
            <span className="text-neutral-400 font-medium">
              {locale === "ar" ? "المبلغ الإجمالي:" : "Total:"}
            </span>
            <span className="font-bold text-amber-300 font-mono text-sm">
              {total.toLocaleString()} {currency}
            </span>
          </div>
        )}

        <div className="flex items-center gap-2 ms-auto">
          {orderId && (
            <Link
              to="/orders/$orderId"
              params={{ orderId }}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-xs font-bold transition-all active:scale-95"
            >
              <span>{locale === "ar" ? "تفاصيل الفاتورة" : "View Invoice"}</span>
              <ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
