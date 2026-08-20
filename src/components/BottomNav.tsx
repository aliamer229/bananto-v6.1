import { CandlestickChart, MessageCircle, ShoppingCart, User } from "lucide-react";
import { useCartStore, cartCount } from "../store/useCartStore";
import { BananaIcon } from "./Icons";
import { motion } from "motion/react";
import { useEffect, useRef } from "react";
import { useI18n } from "../i18n";
import { preloadSound } from "../utils/audio";

preloadSound("bumper_end");
preloadSound("home");
preloadSound("hover");
preloadSound("hover_s");
preloadSound("user");
preloadSound("turn_on");

const navItems = [
  { id: "home", icon: BananaIcon, label: "الرئيسية", sound: "home" },
  { id: "market", icon: CandlestickChart, label: "سوق الموز", sound: "bumper_end" },
  { id: "orders", icon: MessageCircle, label: "طلباتي", sound: "bumper_end" },
  { id: "cart", icon: ShoppingCart, label: "السلة", sound: "bumper_end" },
  { id: "profile", icon: User, label: "حسابي", sound: "user" },
];

/** Taps arriving this soon after a view change are leftovers from the previous
 * screen (e.g. the finger that pressed "back" landing on a freshly mounted
 * button), so they are ignored. */
const SETTLE_MS = 350;

export default function BottomNav({
  currentView,
  onNavigate,
}: {
  currentView: string;
  onNavigate: (v: string) => void;
}) {
  const settledAt = useRef(0);
  const { t } = useI18n();
  const count = useCartStore((s) => cartCount(s.lines));

  useEffect(() => {
    settledAt.current = Date.now() + SETTLE_MS;
  }, [currentView]);

  return (
    <div
      dir="rtl"
      className="w-full bg-[var(--page)]/90 backdrop-blur-xl border-t border-border px-6 py-3 z-50 flex justify-around sm:justify-center sm:gap-16 lg:gap-24 items-center shadow-[0_-10px_40px_rgba(0,0,0,0.05)] pb-[env(safe-area-inset-bottom,1.5rem)] sm:pb-3 shrink-0 transform-gpu pointer-events-auto"
    >
      {navItems.map((item) => {
        const isActive =
          currentView === item.id || (currentView === "details" && item.id === "home");
        const Icon = item.icon;
        const label = t(item.label);

        return (
          <button
            key={item.id}
            {...(isActive ? {} : { "data-sfx": item.sound, "data-sfx-channel": "bottom_nav" })}
            onPointerDown={() => {
              if (isActive) return;
              if (Date.now() < settledAt.current) return;
              onNavigate(item.id);
            }}
            className="relative flex flex-col items-center justify-center w-12 h-12"
            title={label}
          >
            {isActive && (
              <motion.div
                layoutId="nav-pill"
                className="absolute inset-0 bg-blue-100/50 rounded-xl"
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
              />
            )}
            {item.id === "cart" && count > 0 && (
              <div className="absolute top-0 right-0 -mr-2 -mt-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white z-20">
                {count}
              </div>
            )}
            <Icon
              className={`w-6 h-6 relative z-10 transition-colors duration-300 ${isActive ? "text-blue-600" : "text-muted-foreground"}`}
              {...(item.id === "home" ? { solid: isActive } : {})}
            />
          </button>
        );
      })}
    </div>
  );
}
