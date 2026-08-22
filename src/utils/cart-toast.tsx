import { toast } from "sonner";
import { Check, ShoppingBag, X } from "lucide-react";
import { playSound } from "@/utils/audio";

let lastCartToastTime = 0;

export interface AddToCartToastProps {
  title?: string;
  message?: string;
  image?: string;
  quantity?: number;
  navigate?: (opts: { to: string }) => void;
  playSoundEffect?: boolean;
}

/**
 * Displays a single, fully-clickable "Added to Cart" toast notification.
 * - Clicking anywhere on the card navigates directly to /cart via internal router.
 * - Clicking the 'x' button dismisses the toast without navigating (e.stopPropagation).
 * - The checkmark icon is purely visual and part of the card (not a separate click target).
 * - Enforces single toast instance (dismisses any previous cart toast & uses fixed ID).
 * - Plays success sound unless disabled.
 */
export function showAddToCartToast({
  title = "أُضيف إلى السلة",
  message,
  image,
  quantity,
  navigate,
  playSoundEffect = true,
}: AddToCartToastProps) {
  const now = Date.now();
  // Prevent duplicate accidental triggers in rapid succession (within 350ms)
  if (now - lastCartToastTime < 350) {
    return;
  }
  lastCartToastTime = now;

  if (playSoundEffect) {
    try {
      playSound("confirm", 0.7);
    } catch {
      // Audio playback failsafe
    }
  }

  // Dismiss any existing cart toast to guarantee only one active toast
  toast.dismiss("cart-add-toast");

  const handleNavigateToCart = () => {
    toast.dismiss("cart-add-toast");
    if (navigate) {
      navigate({ to: "/cart" });
    } else if (typeof window !== "undefined") {
      // Direct SPA navigation fallback or location redirect
      const navEvent = new CustomEvent("app:navigate", { detail: { to: "/cart" } });
      window.dispatchEvent(navEvent);
      if (window.location.pathname !== "/cart") {
        window.location.href = "/cart";
      }
    }
  };

  toast.custom(
    (toastId) => (
      <div
        id="add-to-cart-toast-card"
        role="button"
        tabIndex={0}
        onClick={handleNavigateToCart}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleNavigateToCart();
          }
        }}
        className="group relative flex w-full max-w-[380px] cursor-pointer select-none items-center justify-between gap-3 overflow-hidden rounded-2xl border border-white/20 bg-slate-950/95 p-3.5 text-white shadow-2xl backdrop-blur-xl transition-all duration-150 hover:bg-slate-900 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
        style={{ cursor: "pointer" }}
        dir="rtl"
        aria-label="تمت الإضافة إلى السلة - اضغط للذهاب إلى السلة"
      >
        {/* Subtle glowing accent gradient */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-emerald-500/10 via-transparent to-transparent opacity-60 transition-opacity group-hover:opacity-100" />

        {/* Content area (Icon + Product Image + Text) */}
        <div className="relative z-10 flex min-w-0 flex-1 items-center gap-3">
          {image ? (
            <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl border border-white/15 bg-slate-800 shadow-sm">
              <img src={image} alt="" className="h-full w-full object-cover" loading="eager" />
              <div className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-slate-950 shadow-md">
                <Check className="h-2.5 w-2.5 stroke-[3.5]" />
              </div>
            </div>
          ) : (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-inner">
              <Check className="h-5 w-5 stroke-[2.5]" />
            </div>
          )}

          <div className="min-w-0 flex-1 text-right">
            <div className="flex items-center gap-1.5">
              <p className="truncate text-[13px] font-black text-white leading-snug">{title}</p>
              {quantity && quantity > 1 ? (
                <span className="rounded-md bg-emerald-500/20 px-1.5 py-0.2 text-[11px] font-black text-emerald-300">
                  ×{quantity}
                </span>
              ) : null}
            </div>

            {message ? (
              <p className="mt-0.5 truncate text-[11.5px] font-medium text-slate-300 leading-tight">
                {message}
              </p>
            ) : (
              <p className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-emerald-400 leading-tight">
                <ShoppingBag className="h-3 w-3 inline" />
                اضغط هنا لفتح السلة
              </p>
            )}
          </div>
        </div>

        {/* Dedicated Close Button: ONLY dismisses the toast, does NOT navigate */}
        <button
          id="toast-close-button"
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            toast.dismiss(toastId);
          }}
          className="relative z-20 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/10 hover:text-white active:scale-90"
          aria-label="إغلاق الإشعار"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    ),
    {
      id: "cart-add-toast",
      duration: 4000,
    },
  );
}
