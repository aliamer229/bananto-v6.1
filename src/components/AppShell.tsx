import { useEffect, useState, useMemo, type ReactNode } from "react";
import { playSound } from "../utils/audio";
import {
  Search,
  ChevronRight,
  Shield,
  Globe,
  Coins,
  User,
  Palette,
  MapPin,
  Loader2,
} from "lucide-react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { motion, AnimatePresence } from "motion/react";
import { useI18n } from "../i18n";
import { useCurrency } from "../context/CurrencyContext";
import { useAuth } from "../hooks/useAuth";
import { useStoreData } from "../hooks/useStoreData";
import { availableThemes } from "../lib/themes";
import { THEME_COOKIE, writeCookie } from "../lib/prefs";
import CurrencyModal from "./CurrencyModal";
import FlowerMenu from "./FlowerMenu";
import { cdnImage } from "@/lib/img";
import BottomNav from "./BottomNav";
import Header from "./Header";
import { trackBrowsing, getSessionId } from "@/lib/activity.functions";

/**
 * Background catalogue worker: imports the games once and then enriches one
 * game per tick, automatically, with no admin action.
 */
function useAutoCatalogue() {
  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      let delay = 120_000;
      try {
        const res = await fetch("/api/auto-enrich", { method: "POST" });
        const data = (await res.json()) as { progress?: { remaining?: number } | null };
        const remaining = data.progress?.remaining;
        if (typeof remaining === "number" && remaining > 0) delay = 15_000;
      } catch {
        delay = 60_000;
      }
      if (!stop) timer = setTimeout(tick, delay);
    };

    // Never compete with the first paint: start only once the page is idle.
    const idle = (globalThis as { requestIdleCallback?: (cb: () => void) => number })
      .requestIdleCallback;
    if (idle)
      idle(() => {
        if (!stop) timer = setTimeout(tick, 6_000);
      });
    else timer = setTimeout(tick, 6_000);

    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, []);
}

const viewToPath: Record<string, string> = {
  home: "/",
  store: "/",
  market: "/banana_market",
  orders: "/orders",
  cart: "/cart",
  profile: "/profile",
  wallet: "/wallet",
  admin: "/admin",
};

export default function AppShell({
  children,
  currentView = "home",
  hideNav = false,
  onBack,
}: {
  children: ReactNode;
  currentView?: string;
  hideNav?: boolean;
  onBack?: () => void;
}) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const lang = useI18n((state) => state.lang);
  const { t } = useI18n();
  const { data: store } = useStoreData();
  const isLoading = useRouterState({ select: (s) => s.status === "pending" });
  useAutoCatalogue();

  // Track browsing history on route change
  useEffect(() => {
    const sid = getSessionId();
    trackBrowsing({
      data: {
        path: pathname,
        sessionId: sid || undefined,
        metadata: { referrer: document.referrer },
      },
    }).catch(console.error);
  }, [pathname]);

  const handleNavigate = (view: string) => {
    if (view.startsWith("product/")) {
      const id = view.split("/")[1];
      void navigate({ to: "/product/$productId", params: { productId: id || "" } });
      return;
    }
    const path = viewToPath[view] ?? "/";
    if (path !== pathname) void navigate({ to: path });
  };

  const isTelegramMiniApp =
    typeof window !== "undefined" &&
    (window.location.search.includes("tgWebAppStartParam") ||
      window.location.search.includes("tgWebAppData") ||
      !!(window as any).Telegram?.WebApp?.initData);

  return (
    <div
      className="flex min-h-screen flex-col bg-[var(--page)]"
      dir={lang === "en" ? "ltr" : "rtl"}
    >
      {!isTelegramMiniApp && (
        <Header
          currentView={currentView}
          onBack={onBack ?? (() => void navigate({ to: "/" }))}
          onNavigate={handleNavigate}
          products={store?.products ?? []}
        />
      )}
      <main className={`relative flex-1 ${!hideNav && !isTelegramMiniApp ? "pb-[72px]" : ""}`}>
        <AnimatePresence mode="wait">
          <motion.div
            key={pathname}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
            className="flex-1"
          >
            {/* We only show a global loader if the shell itself hasn't mounted yet or for heavy transitions */}
            {isLoading && pathname !== "/" && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center bg-transparent">
                <div className="flex flex-col items-center gap-3">
                  <div className="relative">
                    <div className="h-12 w-12 rounded-2xl border-4 border-[var(--brand-red)]/10" />
                    <div className="absolute inset-0 h-12 w-12 rounded-2xl border-4 border-[var(--brand-red)] border-t-transparent animate-spin" />
                  </div>
                  <p className="text-xs font-black tracking-widest text-[var(--ink-base)] uppercase pointer-events-none">
                    {t("جاري التحميل...")}
                  </p>
                </div>
              </div>
            )}

            {children}
          </motion.div>
        </AnimatePresence>
      </main>

      {!hideNav && !isTelegramMiniApp && (
        <div id="app-bottom-nav" className="fixed bottom-0 left-0 right-0 z-50">
          <BottomNav currentView={currentView} onNavigate={handleNavigate} />
        </div>
      )}
    </div>
  );
}
