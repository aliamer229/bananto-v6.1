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
} from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence, useAnimation, useMotionValue, useTransform } from "framer-motion";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";

import AppShell from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import type { Address, Product, ProductKind } from "@/lib/types";
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
  const { formatUSDPrice } = useCurrency();
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
      className="relative overflow-hidden border-b border-slate-100 last:border-0"
      layout
      initial={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0, transition: { duration: 0.3 } }}
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute inset-0 bg-red-500 flex items-center justify-end pr-6"
          style={{ opacity: deleteBgOpacity }}
        >
          <motion.div style={{ scale: deleteIconScale }}>
            <Trash2 className="w-6 h-6 text-white" />
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
        className="relative bg-white py-4 sm:py-5 flex flex-col z-10 w-full cursor-grab active:cursor-grabbing"
      >
        <div className="flex items-start justify-between gap-3 px-4">
          <div className="flex-1 pr-1">
            <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 leading-snug mb-1" dir="ltr">
              {line.title}
            </h2>

            {line.offerLabel && (
              <div className="text-xs sm:text-sm text-slate-700 leading-relaxed mb-2">
                <span className="font-semibold text-slate-900">{tr("العرض")}: </span>
                <span className="text-slate-600">{tr(line.offerLabel)}</span>
              </div>
            )}

            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-base sm:text-lg font-bold text-slate-800">
                {formatUSDPrice(line.price)}
              </span>
              {line.requiresAddress || line.kind === "hardware" ? (
                <span className="bg-slate-100 text-slate-600 text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wide flex items-center gap-1">
                  <Truck className="h-3 w-3" /> {tr("توصيل")}
                </span>
              ) : (
                <span className="bg-emerald-50 text-emerald-600 text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wide flex items-center gap-1">
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
                className="w-20 h-20 sm:w-24 sm:h-24 object-cover rounded-2xl shadow-sm border border-slate-100 bg-slate-100 pointer-events-none"
              />
            ) : (
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-slate-100 border border-slate-100" />
            )}
          </div>
        </div>

        <div className="flex items-center justify-between mt-3 px-4">
          <button
            onClick={() => onRemove(String(line.productId))}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-slate-300 hover:border-slate-400 text-slate-900 text-xs sm:text-sm font-bold bg-white hover:bg-slate-50 active:scale-95 transition-all shadow-sm"
          >
            <Trash2 className="w-3.5 h-3.5 text-slate-800" />
            <span>{tr("حذف")}</span>
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                playSound("hover", 0.4);
                onUpdateQuantity(String(line.productId), line.quantity - 1);
              }}
              className="w-8 h-8 rounded-full border border-slate-300 hover:border-slate-400 active:scale-90 text-slate-600 flex items-center justify-center transition-all"
            >
              <Minus className="w-4 h-4 text-slate-700 stroke-[2.5]" />
            </button>

            <span className="font-extrabold text-slate-900 text-base min-w-[20px] text-center">
              {line.quantity}
            </span>

            <button
              onClick={() => {
                playSound("hover", 0.4);
                onUpdateQuantity(String(line.productId), line.quantity + 1);
              }}
              className="w-8 h-8 rounded-full border-2 border-[#168038] hover:bg-green-50 active:scale-90 text-[#168038] flex items-center justify-center transition-all"
            >
              <Plus className="w-4 h-4 text-[#168038] stroke-[3]" />
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
  const { currency, formatUSDPrice } = useCurrency();
  const { clear } = useCartStore();

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

  const lines: CartLine[] = useMemo(() => {
    return dbItems.map((item: any) => {
      const product = products.find((p) => String(p.id) === String(item.product_id)) as any;
      const bundle = bundles.find((b) => String(b.id) === String(item.product_id)) as any;
      const entity = product || bundle;

      const isBundle = !product && !!bundle;
      const kind: ProductKind = isBundle ? "bundle" : ((product?.kind || "account") as ProductKind);

      return {
        productId: item.product_id,
        title: entity?.titleEn || (entity as any)?.english_name || entity?.title || "منتج غير معروف",
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
  }, [dbItems, products, bundles]);

  const [address, setAddress] = useState<Omit<Address, "id">>(
    () => user?.addresses.find((a) => a.isDefault) ?? emptyAddress,
  );
  const [error, setError] = useState<string>();

  const needsAddress = cartNeedsAddress(lines);
  const total = cartTotal(lines);

  const setQuantity = async (productId: string | number, quantity: number) => {
    const item = dbItems.find((i: any) => String(i.product_id) === String(productId)) as any;
    if (!item) return;
    await updateItemFn({ data: { id: item.id, quantity } });
    queryClient.invalidateQueries({ queryKey: ["cart"] });
  };

  const remove = async (productId: string | number) => {
    const item = dbItems.find((i: any) => String(i.product_id) === String(productId)) as any;
    if (!item) return;
    await removeItemFn({ data: { id: item.id } });
    queryClient.invalidateQueries({ queryKey: ["cart"] });
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
      clear();
      playSound("bumper_end", 0.6);
      void navigate({ to: "/orders/$orderId", params: { orderId: order.id } });
    },
    onError: (err: Error) => setError(err.message),
  });

  const submit = () => {
    setError(undefined);
    if (!user) return void navigate({ to: "/auth" });

    if ((user.walletBalance || 0) < total) {
      setError(
        `رصيدك الحالي (${formatUSDPrice(user.walletBalance || 0)}) لا يكفي لإتمام الطلب. يرجى شحن المحفظة أولاً.`,
      );
      setTimeout(() => void navigate({ to: "/wallet" as any }), 2000);
      return;
    }

    if (needsAddress && (!address.fullName || !address.phone || !address.city)) {
      setError("الأجهزة تحتاج عنوان توصيل: الاسم، الهاتف، والمدينة مطلوبة.");
      return;
    }
    playSound("loading", 0.6);
    checkout.mutate();
  };

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
      <header className="shrink-0 bg-white/80 backdrop-blur-md sticky top-0 px-4 py-4 flex items-center justify-between z-20 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <button
            onClick={() => void navigate({ to: "/" })}
            className="w-10 h-10 bg-slate-100 flex items-center justify-center rounded-full hover:bg-slate-200 transition-colors"
          >
            <ChevronDown className="w-6 h-6 stroke-[2.5]" />
          </button>
          <h1 className="text-[17px] font-bold text-slate-900 tracking-tight">
            {tr("سلة المشتريات")}
          </h1>
        </div>
      </header>

      <main className="flex-1 px-0 pb-[240px]">
        <div className="divide-y divide-border/50">
          <AnimatePresence mode="popLayout">
            {lines.map((line) => (
              <SwipeableCartItem
                key={String(line.productId)}
                line={line}
                onUpdateQuantity={setQuantity}
                onRemove={remove}
              />
            ))}
          </AnimatePresence>
        </div>

        <div className="px-4 py-6 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-extrabold text-slate-900">{tr("هل تحتاج شيئاً آخر؟")}</h3>
            <button
              onClick={() => void navigate({ to: "/" })}
              className="border-2 border-[var(--brand-red)] text-[var(--brand-red)] font-black px-4 py-2 rounded-full text-xs active:scale-95 transition-all"
            >
              {tr("إضافة المزيد")}
            </button>
          </div>

          {needsAddress ? (
            <div className="p-5 bg-slate-50 rounded-3xl border border-slate-100 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white rounded-2xl flex items-center justify-center shadow-sm">
                  <MapPin className="w-5 h-5 text-slate-400" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">
                    {tr("عنوان التوصيل (للأجهزة)")}
                  </h4>
                </div>
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
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--brand-red)] transition-colors placeholder:text-slate-400"
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="p-5 bg-emerald-50 rounded-3xl border border-emerald-100 flex items-center gap-3">
              <div className="w-10 h-10 bg-white rounded-2xl flex items-center justify-center text-emerald-500 shadow-sm">
                <Zap className="w-5 h-5" />
              </div>
              <p className="text-xs font-bold text-emerald-700">
                {tr("تسليم فوري لجميع المنتجات في سلتك عبر محادثة الطلب.")}
              </p>
            </div>
          )}

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Ticket className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                placeholder={tr("أضف كود الخصم")}
                className="w-full pl-11 pr-4 py-3 rounded-2xl border border-slate-200 bg-white text-sm focus:outline-none focus:border-[var(--brand-red)] transition-colors placeholder:text-slate-400"
              />
            </div>
            <button className="px-6 py-3 bg-slate-900 text-white font-black rounded-2xl text-sm active:scale-95 transition-all">
              {tr("تطبيق")}
            </button>
          </div>

          {error && (
            <div className="p-4 bg-rose-500/5 rounded-2xl border border-rose-500/20 text-rose-600 text-xs font-bold">
              {error}
            </div>
          )}
        </div>
      </main>

      <footer className="fixed bottom-[96px] left-0 right-0 bg-white border-t border-slate-100 px-4 pt-4 pb-4 space-y-4 shadow-[0_-8px_30px_rgba(0,0,0,0.05)] z-20">
        <div className="flex items-center justify-between max-w-3xl mx-auto w-full">
          <div className="flex flex-col">
            <div className="text-slate-500 text-[10px] font-black uppercase tracking-wider mb-0.5">
              {tr("إجمالي السلة")}
            </div>
            <div className="text-slate-900 font-black text-2xl tracking-tight">
              {formatUSDPrice(total)}
            </div>
          </div>

          <div className="flex flex-col items-end">
            <div className="flex items-center gap-1.5">
              <div className="bg-blue-600 p-0.5 rounded shadow-sm">
                <Wallet className="w-3 h-3 text-white" />
              </div>
              <span className="text-slate-500 text-[10px] font-black uppercase tracking-wider">
                {tr("رصيد المحفظة")}
              </span>
            </div>
            <div
              className={`font-black text-lg tracking-tight ${user?.walletBalance && user.walletBalance >= total ? "text-emerald-600" : "text-rose-600"}`}
            >
              {formatUSDPrice(user?.walletBalance || 0)}
            </div>
          </div>
        </div>

        <div className="max-w-3xl mx-auto w-full">
          <button
            onClick={() => {
              if (user && user.walletBalance < total) {
                toast.error(tr("رصيدك غير كافٍ، يرجى شحن المحفظة أولاً"));
                void navigate({ to: "/wallet" });
                return;
              }
              submit();
            }}
            disabled={checkout.isPending}
            className={`w-full text-white font-black py-4 px-6 rounded-2xl flex flex-col items-center justify-center shadow-lg active:scale-[0.98] transition-all disabled:opacity-50 ${user && user.walletBalance >= total ? "bg-zinc-900 shadow-zinc-500/20" : "bg-rose-500 shadow-rose-500/20"}`}
          >
            <span className="text-lg">
              {checkout.isPending ? tr("جاري الطلب...") : tr("إتمام الدفع عبر المحفظة")}
            </span>
          </button>
        </div>
      </footer>
    </AppShell>
  );
}
