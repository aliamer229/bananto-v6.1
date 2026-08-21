import { tr } from "@/i18n";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Minus,
  Plus,
  Trash2,
  Truck,
  Zap,
  ChevronDown,
  Wallet,
  MapPin,
  Ticket,
  CheckCircle2,
  Heart,
  MoreHorizontal,
  Sparkles,
  Pencil,
  Clock,
  Utensils,
  AlertCircle,
  Gamepad2,
  Copy,
  MessageCircle,
  Check,
} from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence, useAnimation, useMotionValue, useTransform } from "framer-motion";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";

import AppShell from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import type { Address, Product, ProductKind, Order } from "@/lib/types";
import { cartNeedsAddress, cartTotal, useCartStore } from "@/store/useCartStore";
import type { CartLine } from "@/store/useCartStore";
import { cdnImage } from "@/lib/img";
import { playSound } from "@/utils/audio";
import { useCurrency } from "@/context/CurrencyContext";
import { getCart, updateCartItem, removeCartItem } from "@/lib/cart.functions";
import { useServerFn } from "@tanstack/react-start";

export const Route = createFileRoute("/cart")({
  head: () => ({
    meta: [
      { title: "سلة المشتريات — بنانا ستور" },
      {
        name: "description",
        content: "أكمل شراء الحسابات الرقمية والأجهزة، مع عنوان توصيل للأجهزة فقط.",
      },
      { property: "og:title", content: "سلة المشتريات — بنانا ستور" },
      { property: "og:description", content: "دفع سهل وتسليم الحسابات عبر محادثة الطلب." },
    ],
  }),
  component: CartPage,
});

const emptyAddress: Omit<Address, "id"> = {
  label: "المنزل",
  fullName: "",
  phone: "",
  city: "",
  area: "",
  street: "",
  notes: "",
};

const SwipeableCartItem = ({
  line,
  onUpdateQuantity,
  onRemove,
}: {
  line: CartLine;
  onUpdateQuantity: (id: string, delta: number) => void;
  onRemove: (id: string) => void;
}) => {
  const { formatIQDPrice } = useCurrency();
  const controls = useAnimation();
  const x = useMotionValue(0);

  const deleteBgOpacity = useTransform(x, [-50, -150], [0, 1]);
  const deleteIconScale = useTransform(x, [-50, -150], [0.5, 1]);

  const handleDragEnd = async (_: any, info: any) => {
    const offset = info.offset.x;
    const threshold = window.innerWidth * 0.4;

    if (offset <= -threshold) {
      await controls.start({
        x: -window.innerWidth,
        transition: { duration: 0.2, ease: "easeOut" },
      });
      onRemove(String(line.productId));
    } else {
      controls.start({ x: 0, transition: { type: "spring", stiffness: 400, damping: 30 } });
    }
  };

  return (
    <motion.div
      className="relative overflow-hidden border-b border-border/40 last:border-0"
      layout
      initial={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0, transition: { duration: 0.3 } }}
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute inset-0 bg-destructive flex items-center justify-end pr-6"
          style={{ opacity: deleteBgOpacity }}
        >
          <motion.div style={{ scale: deleteIconScale }}>
            <Trash2 className="w-6 h-6 text-destructive-foreground" />
          </motion.div>
        </motion.div>
      </div>

      <motion.div
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={1}
        onDragEnd={handleDragEnd}
        animate={controls}
        style={{ x, touchAction: "pan-y" }}
        className="relative bg-[var(--card)] py-4 flex flex-col z-10 w-full cursor-grab active:cursor-grabbing"
      >
        <div className="flex items-start justify-between gap-3.5 px-4">
          <div className="flex-1 min-w-0 pr-1">
            <h2
              className="text-base sm:text-lg font-bold text-foreground leading-snug line-clamp-2"
              dir="ltr"
            >
              {line.title}
            </h2>

            {line.offerLabel && (
              <div className="text-xs text-muted-foreground mt-1 leading-relaxed">
                <span className="font-semibold text-foreground/80">{tr("العرض")}: </span>
                <span>{tr(line.offerLabel)}</span>
              </div>
            )}

            <div className="flex items-center gap-2 mt-2">
              <span className="text-base font-black text-foreground">
                {formatIQDPrice(line.price)}
              </span>
              {line.requiresAddress || line.kind === "hardware" ? (
                <span className="bg-muted text-muted-foreground text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Truck className="h-3 w-3" /> {tr("توصيل")}
                </span>
              ) : (
                <span className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Zap className="h-3 w-3" /> {tr("فوري")}
                </span>
              )}
            </div>
          </div>

          <div className="relative shrink-0">
            {line.image ? (
              <img
                src={cdnImage(line.image)}
                alt={line.title}
                className="w-18 h-18 sm:w-20 sm:h-20 object-cover rounded-2xl border border-border/50 bg-muted pointer-events-none"
              />
            ) : (
              <div className="w-18 h-18 sm:w-20 sm:h-20 rounded-2xl bg-muted border border-border/50" />
            )}
          </div>
        </div>

        <div className="flex items-center justify-between mt-3 px-4 pt-1">
          <button
            onClick={() => onRemove(String(line.productId))}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border/70 text-muted-foreground hover:text-destructive hover:border-destructive/30 text-xs font-semibold bg-background hover:bg-destructive/5 active:scale-95 transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{tr("حذف")}</span>
          </button>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => {
                playSound("hover", 0.4);
                onUpdateQuantity(String(line.productId), line.quantity - 1);
              }}
              className="w-8 h-8 rounded-full border border-border bg-background hover:bg-muted active:scale-90 text-foreground flex items-center justify-center transition-all"
              aria-label="إنقاص الكمية"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>

            <span className="font-black text-foreground text-sm min-w-[20px] text-center">
              {line.quantity}
            </span>

            <button
              onClick={() => {
                playSound("hover", 0.4);
                onUpdateQuantity(String(line.productId), line.quantity + 1);
              }}
              className="w-8 h-8 rounded-full border border-border bg-background hover:bg-muted active:scale-90 text-foreground flex items-center justify-center transition-all"
              aria-label="زيادة الكمية"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

function CartPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { currency, formatIQDPrice } = useCurrency();
  const {
    lines: localLines,
    setQuantity: setLocalQuantity,
    remove: removeLocal,
    clear,
  } = useCartStore();

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showInsufficientModal, setShowInsufficientModal] = useState(false);
  const [confirmedOrder, setConfirmedOrder] = useState<Order | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  const fetchCartFn = useServerFn(getCart);
  const updateItemFn = useServerFn(updateCartItem);
  const removeItemFn = useServerFn(removeCartItem);

  const { data: dbItems = [], isLoading: isCartLoading } = useQuery({
    queryKey: ["cart"],
    queryFn: () => fetchCartFn(),
    enabled: !!user,
  });

  const { data: storeData } = useQuery({
    queryKey: ["store", "full"],
    queryFn: async () => {
      return await api.store();
    },
  });

  const products = (storeData?.products ?? []) as Product[];
  const bundles = (storeData?.bundles ?? []) as any[];

  // Combine both local Zustand lines and DB lines
  const lines: CartLine[] = useMemo(() => {
    // If local lines exist, use local lines enriched with product data if needed
    if (localLines && localLines.length > 0) {
      return localLines.map((l) => {
        const product = products.find((p) => String(p.id) === String(l.productId)) as any;
        return {
          ...l,
          title: l.title || product?.titleEn || product?.english_name || product?.title || "منتج",
          image: l.image || product?.image || product?.coverImage || product?.cartridgeImage || "",
          price: l.price || product?.price || 0,
        };
      });
    }

    return dbItems.map((item: any) => {
      const product = products.find((p) => String(p.id) === String(item.product_id)) as any;
      const bundle = bundles.find((b) => String(b.id) === String(item.product_id)) as any;
      const entity = product || bundle;

      const isBundle = !product && !!bundle;
      const kind: ProductKind = isBundle ? "bundle" : ((product?.kind || "account") as ProductKind);

      return {
        productId: item.product_id,
        title:
          entity?.titleEn || (entity as any)?.english_name || entity?.title || "منتج غير معروف",
        image: ((entity?.image || entity?.cartridgeImage || entity?.coverImage) as string) || "",
        price: entity?.price || 0,
        kind,
        quantity: item.quantity,
        requiresAddress: isBundle
          ? false
          : ["hardware", "physical", "accessory", "device", "collectible"].includes(
              product?.kind || "",
            ),
        meta: item.meta
          ? typeof item.meta === "string"
            ? JSON.parse(item.meta)
            : item.meta
          : undefined,
      };
    });
  }, [localLines, dbItems, products, bundles]);

  const [address, setAddress] = useState<Omit<Address, "id">>(
    () => user?.addresses.find((a) => a.isDefault) ?? emptyAddress,
  );
  const [error, setError] = useState<string>();

  const needsAddress = cartNeedsAddress(lines);
  const total = cartTotal(lines);

  const setQuantity = async (
    productId: string | number,
    quantity: number,
    offerKind?: string,
    optionId?: string,
    typeId?: string,
    editionId?: string,
  ) => {
    setLocalQuantity(productId, quantity, offerKind, optionId, typeId, editionId);
    const item = dbItems.find((i: any) => String(i.product_id) === String(productId)) as any;
    if (item && user) {
      try {
        await updateItemFn({ data: { id: item.id, quantity } });
        queryClient.invalidateQueries({ queryKey: ["cart"] });
      } catch (err) {
        console.error("Failed to update cart item:", err);
      }
    }
  };

  const remove = async (
    productId: string | number,
    offerKind?: string,
    optionId?: string,
    typeId?: string,
    editionId?: string,
  ) => {
    removeLocal(productId, offerKind, optionId, typeId, editionId);
    const item = dbItems.find((i: any) => String(i.product_id) === String(productId)) as any;
    if (item && user) {
      try {
        await removeItemFn({ data: { id: item.id } });
        queryClient.invalidateQueries({ queryKey: ["cart"] });
      } catch (err) {
        console.error("Failed to remove cart item:", err);
      }
    }
  };

  const checkout = useMutation({
    mutationFn: () =>
      api.checkout(
        lines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          editionId: l.meta?.editionId,
          dlcIds: l.meta?.dlcIds,
        })),
        needsAddress ? { id: "cart", ...address } : undefined,
      ),
    onSuccess: ({ order }) => {
      setShowConfirmModal(false);
      clear();
      setConfirmedOrder(order);
      queryClient.invalidateQueries({ queryKey: ["cart"] });
      queryClient.invalidateQueries({ queryKey: ["auth"] });
      playSound("bumper_end", 0.6);
    },
    onError: (err: Error) => {
      setShowConfirmModal(false);
      setError(err.message);
      toast.error(err.message);
    },
  });

  const handleInitiatePayment = () => {
    setError(undefined);
    if (!user) {
      return void navigate({ to: "/auth" });
    }

    if (needsAddress && (!address.fullName || !address.phone || !address.city)) {
      setError("الأجهزة تحتاج عنوان توصيل: الاسم، الهاتف، والمدينة مطلوبة.");
      toast.error("يرجى إكمال بيانات عنوان التوصيل للأجهزة");
      return;
    }

    const currentBalance = user.walletBalance || 0;
    if (currentBalance < total) {
      setShowInsufficientModal(true);
      return;
    }

    setShowConfirmModal(true);
  };

  const confirmAndPay = () => {
    playSound("loading", 0.6);
    checkout.mutate();
  };

  // Render: Animated Order Confirmed Screen
  if (confirmedOrder) {
    const hasDigital = confirmedOrder.items?.some(
      (item: any) => !["hardware", "physical", "accessory", "device"].includes(item.kind),
    );

    return (
      <AppShell currentView="cart">
        <header className="shrink-0 bg-white dark:bg-card px-4 py-4 flex items-center justify-between z-20 border-b border-border/50">
          <div className="w-10 h-10"></div>
          <h1 className="text-[17px] font-bold text-foreground">{tr("تأكيد الطلب")}</h1>
          <div className="w-10 h-10"></div>
        </header>

        <main
          className="flex-1 overflow-y-auto px-4 py-6 max-w-lg mx-auto w-full pb-28 text-center"
          dir="rtl"
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 20 }}
            className="space-y-6"
          >
            {/* Animated Success Icon */}
            <div className="relative mx-auto w-20 h-20">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 1, repeat: Infinity, repeatDelay: 2 }}
                className="absolute inset-0 rounded-full bg-emerald-500/20"
              />
              <div className="relative w-20 h-20 rounded-full bg-emerald-500/10 border-2 border-emerald-500 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-lg shadow-emerald-500/10">
                <CheckCircle2 className="w-10 h-10 stroke-[2.5]" />
              </div>
            </div>

            <div>
              <h2 className="text-xl sm:text-2xl font-black text-foreground mb-1.5">
                تم تأكيد واستقطاع المبلغ بنجاح! 🎉
              </h2>
              <p className="text-xs sm:text-sm text-muted-foreground">
                تم خصم قيمة الطلب من محفظتك وبدء تجهيز طلبك فوراً
              </p>
            </div>

            {/* Order Code Card */}
            <div className="bg-card border border-border rounded-3xl p-5 shadow-sm text-right space-y-4">
              <div className="flex items-center justify-between border-b border-border/70 pb-3">
                <span className="text-xs font-bold text-muted-foreground">رمز الطلب:</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-black text-foreground" dir="ltr">
                    {confirmedOrder.code}
                  </span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(confirmedOrder.code);
                      setCopiedCode(true);
                      setTimeout(() => setCopiedCode(false), 2000);
                      toast.success("تم نسخ رمز الطلب");
                    }}
                    className="p-1 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
                    title="نسخ رمز الطلب"
                  >
                    {copiedCode ? (
                      <Check className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Items Summary */}
              <div className="space-y-2.5">
                <span className="text-xs font-bold text-muted-foreground block">
                  المنتجات المشمولة:
                </span>
                {confirmedOrder.items?.map((item: any, idx: number) => (
                  <div
                    key={idx}
                    className="flex items-center gap-3 bg-muted/40 rounded-2xl p-2.5 border border-border/50"
                  >
                    {item.image ? (
                      <img
                        src={cdnImage(item.image)}
                        alt=""
                        className="w-11 h-11 rounded-xl object-cover border border-border/60 shrink-0"
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-xl bg-muted flex items-center justify-center text-muted-foreground shrink-0">
                        <Gamepad2 className="w-5 h-5" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-foreground truncate">{item.title}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {formatIQDPrice(item.unitPrice || item.price || 0)} × {item.quantity || 1}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-2 border-t border-border/70 flex justify-between items-center text-xs sm:text-sm">
                <span className="font-bold text-muted-foreground">المبلغ المستقطع:</span>
                <span className="font-black text-emerald-600 dark:text-emerald-400 text-base">
                  {formatIQDPrice(confirmedOrder.total)}
                </span>
              </div>
            </div>

            {/* Digital Account Banner & Direct Transition */}
            {hasDigital && (
              <div className="rounded-3xl border border-amber-400/40 bg-amber-500/10 p-4 text-right space-y-2">
                <div className="flex items-center gap-2 text-xs font-black text-amber-700 dark:text-amber-300">
                  <Sparkles className="h-4 w-4" />
                  <span>تم إرسال بطاقة طلبك إلى محادثة الدعم</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  تواصل مع الدعم الفني مباشرة في صفحة المحادثة لتسليم بيانات الحساب وأكواد التفعيل
                  فوراً.
                </p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col gap-2.5 pt-2">
              <button
                onClick={() => void navigate({ to: "/chat" })}
                className="w-full py-3.5 bg-[var(--brand-red)] hover:opacity-90 text-white font-black rounded-2xl shadow-md shadow-rose-500/20 active:scale-[0.98] transition-all text-sm flex items-center justify-center gap-2"
              >
                <MessageCircle className="w-4 h-4" />
                <span>الانتقال للمحادثة مع الدعم لاستلام الحساب</span>
              </button>

              <button
                onClick={() =>
                  void navigate({ to: "/chat", search: { initialOrderId: confirmedOrder.id } })
                }
                className="w-full py-3 bg-muted hover:bg-muted/80 text-foreground font-bold rounded-2xl transition-colors text-xs sm:text-sm"
              >
                عرض تفاصيل الطلب الكاملة
              </button>

              <button
                onClick={() => void navigate({ to: "/" })}
                className="w-full py-2.5 text-muted-foreground hover:text-foreground font-medium text-xs transition-colors"
              >
                العودة للصفحة الرئيسية
              </button>
            </div>
          </motion.div>
        </main>
      </AppShell>
    );
  }

  if (lines.length === 0) {
    return (
      <AppShell currentView="cart">
        <header className="shrink-0 bg-white px-4 py-4 flex items-center justify-between z-20">
          <button
            onClick={() => void navigate({ to: "/" })}
            className="w-10 h-10 bg-slate-100 flex items-center justify-center rounded-full hover:bg-slate-200 transition-colors"
          >
            <ChevronDown className="w-6 h-6 stroke-[2.5]" />
          </button>
          <h1 className="text-[17px] font-bold text-slate-900">{tr("سلة المشتريات")}</h1>
          <div className="w-10 h-10"></div>
        </header>

        <main className="flex-1 flex flex-col items-center justify-center px-6 pb-20 text-center">
          <div className="relative w-64 h-64 sm:w-72 sm:h-72 mb-8 opacity-20">
            <svg
              viewBox="0 0 240 240"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="w-full h-full drop-shadow-sm"
            >
              <ellipse
                cx="120"
                cy="190"
                rx="95"
                ry="12"
                fill="#fde8e9"
                transform="rotate(-4 120 190)"
              />
              <path
                d="M95 90 L95 70 L150 70 L150 90"
                stroke="#d68a29"
                strokeWidth="12"
                strokeLinejoin="round"
                fill="none"
              />
              <polygon points="80,105 165,105 165,90 90,90" fill="#d07e1c" />
              <path d="M95 105 C95 80, 142 80, 142 105 Z" fill="#fb8e49" />
              <polygon points="170,105 190,110 170,185 150,180" fill="#d57b28" />
              <polygon points="65,105 170,105 150,180 50,170" fill="#f8c347" />
              <path
                d="M85 105 L85 82 L135 82 L135 105"
                stroke="#f8c347"
                strokeWidth="12"
                strokeLinejoin="round"
                fill="none"
              />
            </svg>
          </div>
          <h2 className="text-2xl font-black mb-3 text-slate-900">{tr("السلة فارغة")}</h2>
          <p className="text-slate-500 text-sm max-w-xs mb-8">
            {tr("عندما تضيف منتجات إلى سلتك، ستظهر هنا لتتمكن من إكمال طلبك.")}
          </p>
          <button
            onClick={() => void navigate({ to: "/" })}
            className="bg-[var(--brand-red)] text-white font-bold px-8 py-3.5 rounded-2xl shadow-lg shadow-rose-500/20 active:scale-95 transition-all"
          >
            {tr("ابدأ التسوق")}
          </button>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell currentView="cart">
      <header className="shrink-0 bg-[var(--card)]/90 backdrop-blur-md sticky top-0 px-4 py-3.5 flex items-center justify-between z-20 border-b border-border">
        <div className="flex items-center gap-3">
          <button
            onClick={() => void navigate({ to: "/" })}
            className="w-9 h-9 bg-muted flex items-center justify-center rounded-xl hover:bg-muted/80 text-foreground transition-colors"
            aria-label="العودة"
          >
            <ChevronDown className="w-5 h-5 stroke-[2.5]" />
          </button>
          <h1 className="text-base font-bold text-foreground tracking-tight">
            {tr("سلة المشتريات")}
          </h1>
        </div>
        {lines.length > 0 && (
          <span className="text-xs font-bold text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
            {lines.length} {tr("منتجات")}
          </span>
        )}
      </header>

      <main className="flex-1 px-0 pb-[220px]">
        <div className="divide-y divide-border/40">
          <AnimatePresence mode="popLayout">
            {lines.map((line) => (
              <SwipeableCartItem
                key={String(line.productId)}
                line={line}
                onUpdateQuantity={(_, q) =>
                  setQuantity(
                    line.productId,
                    q,
                    line.offerKind,
                    line.optionId,
                    line.typeId,
                    line.editionId,
                  )
                }
                onRemove={() =>
                  remove(line.productId, line.offerKind, line.optionId, line.typeId, line.editionId)
                }
              />
            ))}
          </AnimatePresence>
        </div>

        <div className="px-4 py-5 space-y-4">
          <div className="flex items-center justify-between pt-1">
            <span className="text-sm font-bold text-foreground">{tr("هل تحتاج شيئاً آخر؟")}</span>
            <button
              onClick={() => void navigate({ to: "/" })}
              className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
            >
              <span>{tr("تصفح المزيد من الألعاب")}</span>
              <ArrowLeft className="w-3.5 h-3.5 rtl:rotate-180" />
            </button>
          </div>

          {needsAddress ? (
            <div className="p-4 bg-muted/40 rounded-2xl border border-border space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-card rounded-xl flex items-center justify-center shadow-sm">
                  <MapPin className="w-4 h-4 text-muted-foreground" />
                </div>
                <h4 className="font-bold text-foreground text-xs sm:text-sm">
                  {tr("عنوان التوصيل (للأجهزة)")}
                </h4>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {(
                  [
                    ["fullName", "الاسم الكامل"],
                    ["phone", "رقم الهاتف"],
                    ["city", "المدينة"],
                    ["area", "المنطقة"],
                    ["street", "الشارع / أقرب نقطة دالة"],
                    ["notes", "ملاحظات"],
                  ] as const
                ).map(([field, label]) => (
                  <input
                    key={field}
                    value={String(address[field] ?? "")}
                    onChange={(event) =>
                      setAddress((prev) => ({ ...prev, [field]: event.target.value }))
                    }
                    placeholder={label}
                    className="rounded-xl border border-border bg-[var(--card)] px-3 py-2 text-xs sm:text-sm outline-none focus:ring-1 focus:ring-primary transition-all placeholder:text-muted-foreground"
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="p-3.5 bg-card rounded-2xl border border-border/70 flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                <Zap className="w-4 h-4" />
              </div>
              <p className="text-xs font-medium text-foreground/80 leading-relaxed">
                {tr("تسليم فوري لجميع المنتجات الرقمية عبر محادثة الطلب فور تأكيد الدفع.")}
              </p>
            </div>
          )}

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Ticket className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder={tr("أضف كود الخصم")}
                className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-border bg-[var(--card)] text-xs sm:text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-all placeholder:text-muted-foreground"
              />
            </div>
            <button className="px-4 py-2.5 bg-muted hover:bg-muted/80 text-foreground font-bold rounded-xl text-xs active:scale-95 transition-all border border-border/60">
              {tr("تطبيق")}
            </button>
          </div>

          {error && (
            <div className="p-3.5 bg-destructive/10 rounded-2xl border border-destructive/20 text-destructive text-xs font-semibold">
              {error}
            </div>
          )}
        </div>
      </main>

      <footer className="fixed bottom-[58px] sm:bottom-[60px] left-0 right-0 bg-[var(--card)]/95 backdrop-blur-md border-t border-border px-4 py-3 sm:py-3.5 space-y-2.5 shadow-[0_-4px_20px_rgba(0,0,0,0.04)] z-40">
        <div className="flex items-center justify-between max-w-3xl mx-auto w-full">
          <div className="flex flex-col">
            <div className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider mb-0.5">
              {tr("إجمالي السلة")}
            </div>
            <div className="text-foreground font-black text-lg sm:text-xl tracking-tight">
              {formatIQDPrice(total)}
            </div>
          </div>

          <div className="flex flex-col items-end">
            <div className="flex items-center gap-1.5">
              <Wallet className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider">
                {tr("رصيد المحفظة")}
              </span>
            </div>
            <div
              className={`font-black text-sm sm:text-base tracking-tight ${
                user?.walletBalance && user.walletBalance >= total
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-rose-600 dark:text-rose-400"
              }`}
            >
              {formatIQDPrice(user?.walletBalance || 0)}
            </div>
          </div>
        </div>

        <div className="max-w-3xl mx-auto w-full">
          <button
            onClick={handleInitiatePayment}
            disabled={checkout.isPending}
            className="w-full bg-primary hover:opacity-90 text-primary-foreground font-black py-3 sm:py-3.5 px-5 rounded-2xl flex items-center justify-center gap-2 shadow-md active:scale-[0.99] transition-all disabled:opacity-50"
          >
            <Wallet className="w-4 h-4" />
            <span className="text-sm sm:text-base">
              {checkout.isPending ? tr("جاري الطلب...") : tr("إتمام الدفع عبر المحفظة")}
            </span>
          </button>
        </div>
      </footer>

      {/* Modal: Insufficient Balance */}
      <AnimatePresence>
        {showInsufficientModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowInsufficientModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-[var(--card)] rounded-3xl p-6 shadow-2xl z-10 text-center border border-border"
              dir="rtl"
            >
              <div className="w-12 h-12 bg-rose-500/10 rounded-2xl flex items-center justify-center text-rose-600 dark:text-rose-400 mx-auto mb-3.5 border border-rose-500/20 shadow-sm">
                <AlertCircle className="w-6 h-6 stroke-[2.5]" />
              </div>

              <h3 className="text-lg font-black text-foreground mb-1.5">
                {tr("رصيد المحفظة غير كافٍ")}
              </h3>
              <p className="text-muted-foreground text-xs sm:text-sm mb-5 leading-relaxed">
                {tr("رصيدك الحالي لا يغطي قيمة هذا الطلب. يمكنك شحن محفظتك لإتمام الشراء.")}
              </p>

              <div className="bg-muted/50 rounded-2xl p-3.5 mb-5 text-xs sm:text-sm space-y-2 border border-border/60 text-right">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground font-medium">{tr("إجمالي السلة")}:</span>
                  <span className="text-foreground font-black">{formatIQDPrice(total)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground font-medium">{tr("رصيدك الحالي")}:</span>
                  <span className="text-rose-600 dark:text-rose-400 font-bold">
                    {formatIQDPrice(user?.walletBalance || 0)}
                  </span>
                </div>
                <div className="pt-2 border-t border-border flex justify-between items-center">
                  <span className="text-foreground font-bold">{tr("المبلغ المطلوب شحنه")}:</span>
                  <span className="text-primary font-black">
                    {formatIQDPrice(Math.max(0, total - (user?.walletBalance || 0)))}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <button
                  onClick={() => {
                    setShowInsufficientModal(false);
                    void navigate({ to: "/wallet" });
                  }}
                  className="w-full py-3 bg-primary hover:opacity-90 text-primary-foreground font-black rounded-2xl shadow-sm active:scale-[0.98] transition-all text-xs sm:text-sm flex items-center justify-center gap-2"
                >
                  <Wallet className="w-4 h-4" />
                  <span>{tr("شحن المحفظة الآن")}</span>
                </button>
                <button
                  onClick={() => setShowInsufficientModal(false)}
                  className="w-full py-2.5 bg-muted hover:bg-muted/80 text-foreground font-bold rounded-2xl transition-colors text-xs sm:text-sm"
                >
                  {tr("إلغاء والعودة للسلة")}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal: Confirm Payment */}
      <AnimatePresence>
        {showConfirmModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !checkout.isPending && setShowConfirmModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-[var(--card)] rounded-3xl p-6 shadow-2xl z-10 text-center border border-border"
              dir="rtl"
            >
              <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-600 dark:text-emerald-400 mx-auto mb-3.5 border border-emerald-500/20 shadow-sm">
                <CheckCircle2 className="w-6 h-6 stroke-[2.5]" />
              </div>

              <h3 className="text-lg font-black text-foreground mb-1">
                {tr("تأكيد الدفع عبر المحفظة")}
              </h3>
              <p className="text-muted-foreground text-xs sm:text-sm mb-5">
                {tr("هل ترغب بتأكيد الطلب واستقطاع المبلغ من رصيدك؟")}
              </p>

              <div className="bg-muted/50 rounded-2xl p-3.5 mb-5 text-xs sm:text-sm space-y-2 border border-border/60 text-right">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground font-medium">{tr("عدد المنتجات")}:</span>
                  <span className="text-foreground font-bold">
                    {lines.length} {tr("منتج")}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground font-medium">{tr("إجمالي المبلغ")}:</span>
                  <span className="text-foreground font-black">{formatIQDPrice(total)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground font-medium">{tr("رصيدك الحالي")}:</span>
                  <span className="text-muted-foreground font-bold">
                    {formatIQDPrice(user?.walletBalance || 0)}
                  </span>
                </div>
                <div className="pt-2 border-t border-border flex justify-between items-center">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                    {tr("الرصيد المتبقي بعد الدفع")}:
                  </span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-black">
                    {formatIQDPrice(Math.max(0, (user?.walletBalance || 0) - total))}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <button
                  onClick={confirmAndPay}
                  disabled={checkout.isPending}
                  className="w-full py-3 bg-primary hover:opacity-90 text-primary-foreground font-black rounded-2xl shadow-sm active:scale-[0.98] transition-all text-xs sm:text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {checkout.isPending ? (
                    <span>{tr("جاري تأكيد واستقطاع المبلغ...")}</span>
                  ) : (
                    <span>{tr("تأكيد واستقطاع المبلغ")}</span>
                  )}
                </button>
                <button
                  onClick={() => setShowConfirmModal(false)}
                  disabled={checkout.isPending}
                  className="w-full py-2.5 bg-muted hover:bg-muted/80 text-foreground font-bold rounded-2xl transition-colors text-xs sm:text-sm disabled:opacity-50"
                >
                  {tr("تراجع")}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </AppShell>
  );
}
