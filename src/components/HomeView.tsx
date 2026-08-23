import { motion, AnimatePresence } from "motion/react";
import { Link } from "@tanstack/react-router";
import React, { useState, useEffect, useMemo, Suspense, lazy } from "react";
import { useStoreData } from "../hooks/useStoreData";
import { useI18n } from "../i18n";
import { useCurrency } from "../context/CurrencyContext";
import { BananaIcon } from "./Icons";
import { Headset, CreditCard, Wallet, Star, Trophy } from "lucide-react";
import { playSound, preloadSound } from "../utils/audio";
import { filterPurchasable } from "@/lib/purchasable";
import { getProductCategory, isGameProduct } from "@/lib/productSection";
import { CartridgeStrip, ProductStrip, CartridgeSkeleton } from "./ProductStrips";
import { BundleStrip } from "./BundleStrip";
import type { AccountBundle } from "@/lib/types";
import { rankByPreference } from "@/lib/recommend";
import { useAuth } from "@/hooks/useAuth";
import { cdnImage } from "@/lib/img";
import { NINTENDO_IMAGE_PLACEHOLDER, resolveNintendoImageUrl } from "@/lib/nintendoImages";
import { LazySection } from "./LazySection";
import NintendoNews from "./NintendoNews";
import { HomeBananaMarket } from "./HomeBananaMarket";
import { StoreServices } from "./StoreServices";

preloadSound("hover");
preloadSound("hover_s");

const iconMap: Record<string, any> = {
  Headset,
  CreditCard,
  Wallet,
  Star,
  Trophy,
};

/**
 * Deprecated shim.
 *
 * This module used to own image selection for every Nintendo surface, via a
 * `getNintendoCardImage` chain that ended in a hardcoded table of "known"
 * covers matched by title substring — so any product whose name contained
 * "mario party" advertised a different game's *banner*. Selection now lives in
 * `@/lib/nintendoImages`, which has one documented fallback order per usage and
 * no per-game entries at all.
 *
 * Kept only so callers outside this file keep compiling; prefer
 * `resolveNintendoImage(product, usage)` or `<NintendoCover>` directly.
 *
 * @deprecated Use `resolveNintendoImage` from `@/lib/nintendoImages`.
 */
export function getNintendoCardImage(product: Record<string, any>): string {
  return resolveNintendoImageUrl(product, "listing-card");
}

export default function HomeView({
  onGameClick,
}: {
  onGameClick: (game: any, withTransition?: boolean) => void;
}) {
  const [clickedCartridgeId, setClickedCartridgeId] = useState<number | string | null>(null);
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);
  const { t } = useI18n();
  const { formatGenericPrice } = useCurrency();

  const { data: store, isPending, isPlaceholderData } = useStoreData();
  const isDbLoaded = !isPending || isPlaceholderData || !!store;

  const banners: any[] = store?.banners ?? [];
  const { user } = useAuth();
  // Suggestions follow the genres the member picked at signup / in preferences.
  const adminProducts: any[] = useMemo(
    () => rankByPreference(filterPurchasable<any>(store?.products ?? []), user?.preferredGenres),
    [store?.products, user?.preferredGenres],
  );
  const adminCategories: any[] = store?.categories ?? [];

  const activeBanners = banners.filter((b) => b.isActive !== false);

  useEffect(() => {
    if (activeBanners.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentBannerIndex((prev) => (prev + 1) % activeBanners.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [activeBanners.length]);

  const playHoverSound1 = () => playSound("hover_s", 0.8);
  const playHoverSound2 = () => playSound("hover", 0.8);

  const handleCartridgeClick = (game: any, isSwitch2: boolean) => {
    if (isSwitch2) {
      playSound("hover", 0.8);
    } else {
      playSound("hover_s", 0.8);
    }

    setClickedCartridgeId(game.id);

    // Navigate immediately without artificial delay
    onGameClick(game, true);
  };

  const PageSkeleton = () => (
    <div className="relative z-10 flex flex-1 flex-col bg-[var(--page)] pt-24 min-h-screen">
      <div className="mx-4 h-[250px] md:h-[400px] rounded-3xl bg-[var(--surface)] animate-pulse animate-skeleton-shimmer" />
      {[0, 1].map((row) => (
        <div key={row} className="mt-8 space-y-3 px-4">
          <div className="h-6 w-48 rounded-full bg-[var(--surface)] animate-pulse" />
          <div className="flex gap-4 overflow-hidden">
            {[0, 1, 2, 3].map((cell) => (
              <div
                key={cell}
                className="h-[200px] w-[140px] shrink-0 rounded-2xl bg-[var(--surface)] animate-pulse animate-skeleton-shimmer"
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  if (!isDbLoaded && !store) {
    return <PageSkeleton />;
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="relative z-10 flex flex-col"
    >
      {/* Hero Banner */}
      <div className="w-full aspect-[16/9] md:aspect-[21/9] relative z-0 overflow-hidden flex bg-[var(--shell-2)]">
        {activeBanners.length > 0 ? (
          <div
            className="w-full h-full relative"
            style={{ backgroundColor: activeBanners[currentBannerIndex]?.bgColor || "transparent" }}
          >
            <AnimatePresence mode="wait" initial={false}>
              {(() => {
                const banner = activeBanners[currentBannerIndex];
                if (!banner) return null;
                return (
                  <motion.div
                    key={banner.id}
                    className="absolute inset-0 cursor-pointer"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.4, ease: "easeInOut" }}
                    onClick={() => {
                      if (banner.targetUrl) {
                        try {
                          const opened = window.open(
                            banner.targetUrl,
                            "_blank",
                            "noopener,noreferrer",
                          );
                          if (!opened) {
                            window.location.href = banner.targetUrl;
                          }
                        } catch (err) {
                          console.warn("Frame blocked window.open:", err);
                        }
                      } else {
                        onGameClick({ title: "Banner", id: banner.id }, false);
                      }
                    }}
                  >
                    {banner.imageUrl ? (
                      <img
                        src={cdnImage(banner.imageUrl)}
                        alt="Hero"
                        className="w-full h-full object-cover"
                        decoding="async"
                        loading="eager"
                        fetchPriority={currentBannerIndex === 0 ? "high" : "auto"}
                        style={{
                          transform: `translate(${banner.posX || 0}px, ${banner.posY || 0}px) scale(${banner.scale || 1})`,
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col justify-center items-center text-center p-6 bg-gradient-to-br from-blue-900 to-black">
                        {banner.title && (
                          <h2 className="text-white text-3xl font-black mb-2">{banner.title}</h2>
                        )}
                        {banner.subtitle && (
                          <p className="text-white/80 text-lg">{banner.subtitle}</p>
                        )}
                      </div>
                    )}
                  </motion.div>
                );
              })()}
            </AnimatePresence>

            {activeBanners.length > 1 && (
              <div className="absolute bottom-12 sm:bottom-16 left-1/2 -translate-x-1/2 flex gap-1.5 flex-row-reverse z-10">
                {activeBanners.map((_, idx) => (
                  <button
                    key={idx}
                    className={`h-1.5 rounded-full transition-all ${currentBannerIndex === idx ? "w-4 bg-card" : "w-1.5 bg-card/40"}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setCurrentBannerIndex(idx);
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        ) : isPending ? (
          <div className="w-full h-full bg-[var(--surface)] animate-pulse animate-skeleton-shimmer" />
        ) : (
          <div className="w-full h-full flex flex-col justify-center items-center text-center p-6 bg-gradient-to-br from-[#E60012] to-[#B3000E]">
            <h2 className="text-white text-3xl font-black mb-2">Nintendo Switch 2</h2>
            <p className="text-white/80 text-lg">Coming soon to Banana Store</p>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div
        className={`bg-[var(--page)] rounded-t-[24px] pt-0 -mt-6 pb-12 px-0 space-y-8 relative shadow-[0_-10px_20px_rgba(0,0,0,0.1)] z-10 flex-1 max-w-full overflow-hidden`}
      >
        {/* Store Services and Guides - Moved outside categories loop to ensure it always renders */}
        <Suspense
          fallback={
            <div className="h-20 animate-pulse animate-skeleton-shimmer bg-muted/10 rounded-2xl mx-4" />
          }
        >
          <StoreServices />
        </Suspense>

        {/* Section 1: Cartridge Shelf (Nintendo Switch Games) */}
        <section className="relative mt-2 pb-2 w-full max-w-full">
          <div className="mb-3 px-4 sm:px-8 flex items-center justify-between">
            <h3 className="truncate text-xl font-bold text-foreground">
              {t("home.nintendoSwitchGames") === "home.nintendoSwitchGames"
                ? "ألعاب نينتندو سويتش"
                : t("home.nintendoSwitchGames")}
            </h3>
            <Link
              to="/category/$categoryId"
              params={{ categoryId: "nintendo_games" }}
              className="text-orange-500 hover:text-orange-600 px-2 py-1 text-sm font-bold transition-colors"
            >
              {t("common.viewAll")}
            </Link>
          </div>

          <div className="relative mb-6 mt-2 min-h-[200px] w-full max-w-full">
            {isPending && adminProducts.length === 0 ? (
              <CartridgeSkeleton />
            ) : (
              <CartridgeStrip
                games={adminProducts
                  .filter((p) => isGameProduct(p))
                  .map((p) => ({
                    id: p.id,
                    slug: p.slug,
                    title: p.titleEn || p.english_name || p.title,
                    price: p.price,
                    image: resolveNintendoImageUrl(p, "listing-card"),
                    source: p,
                    subtitle: p.developer || p.publisher || "Nintendo Switch",
                    rating: p.metacriticRating ?? null,
                    platform: p.platform,
                  }))}
                clickedId={clickedCartridgeId}
                onSelect={(game: any) => {
                  if (clickedCartridgeId != null) return;
                  setClickedCartridgeId(game.id);
                  setTimeout(() => {
                    onGameClick(game, true);
                  }, 400);
                  setTimeout(() => setClickedCartridgeId(null), 6000);
                }}
              />
            )}

            <div className="absolute bottom-[-18px] left-0 right-0 flex flex-col z-0">
              <div className="h-[6px] w-full bg-gradient-to-b from-[var(--gray-1)] to-[var(--gray-2)]"></div>
              <div className="h-[12px] w-full bg-gradient-to-b from-[var(--gray-3)] to-[var(--gray-4)] shadow-[0_15px_25px_rgba(0,0,0,0.15)]"></div>
            </div>
          </div>
        </section>

        {/* Section 2: Account Bundles (Horizontal Strip) */}
        <BundleStrip
          bundles={(store?.bundles ?? []) as AccountBundle[]}
          products={store?.products ?? []}
        />

        {/* Section 3: Latest Nintendo Games Added by Release Date */}
        <LazySection>
          <section className="mt-2 w-full max-w-full">
            <div className="flex items-center justify-between gap-2 mb-4 px-4 sm:px-8">
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-bold text-foreground">
                  {t("home.latestNintendoGames") === "home.latestNintendoGames"
                    ? "Latest Nintendo releases"
                    : t("home.latestNintendoGames")}
                </h3>
                <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">
                  New
                </span>
              </div>
            </div>

            <div dir="ltr" className="w-full max-w-full">
              <ProductStrip
                products={adminProducts
                  .filter((p) => {
                    const catId = (p.category || p.categoryId || "").toLowerCase();
                    const kind = (p.kind || "").toLowerCase();
                    // Include Nintendo switch games
                    return (
                      !catId ||
                      catId === "cat_1" ||
                      catId === "cat_nintendo" ||
                      catId === "nintendo_games" ||
                      catId === "nintendo-switch-games" ||
                      kind === "account" ||
                      kind === "offline_account" ||
                      kind === "online_account" ||
                      kind === "physical" ||
                      Boolean(
                        p.releaseDate ||
                        p.release_date ||
                        p.metadata?.releaseDate ||
                        p.metadata?.release_date ||
                        p.releaseYear ||
                        p.release_year,
                      )
                    );
                  })
                  .sort((a, b) => {
                    const getVal = (p: any) => {
                      const d =
                        p.releaseDate ||
                        p.release_date ||
                        p.metadata?.releaseDate ||
                        p.metadata?.release_date ||
                        p.releaseYear ||
                        p.release_year;
                      if (!d) return 0;

                      const dStr = String(d).trim();

                      // 1. Try YYYY-MM-DD or YYYY-M-D (like 2026-7-23)
                      const ymdMatch = dStr.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
                      if (ymdMatch && ymdMatch[1] && ymdMatch[2] && ymdMatch[3]) {
                        return new Date(
                          `${ymdMatch[1]}-${ymdMatch[2].padStart(2, "0")}-${ymdMatch[3].padStart(2, "0")}`,
                        ).getTime();
                      }

                      // 2. Try DD/MM/YYYY or DD-MM-YYYY
                      const dmMatch = dStr.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
                      if (dmMatch && dmMatch[1] && dmMatch[2] && dmMatch[3]) {
                        return new Date(
                          `${dmMatch[3]}-${dmMatch[2].padStart(2, "0")}-${dmMatch[1].padStart(2, "0")}`,
                        ).getTime();
                      }

                      // 3. Try YYYYMMDD (Nintendo eShop format)
                      const ymdCompact = dStr.match(/^(\d{4})(\d{2})(\d{2})$/);
                      if (ymdCompact) {
                        return new Date(
                          `${ymdCompact[1]}-${ymdCompact[2]}-${ymdCompact[3]}`,
                        ).getTime();
                      }

                      // 4. Fallback to standard Date parsing
                      const parsed = new Date(dStr).getTime();
                      if (!isNaN(parsed) && parsed > 0) return parsed;

                      // 5. Fallback to just extracting a year
                      const yearMatch = dStr.match(/\b(20\d{2}|19\d{2})\b/);
                      if (yearMatch) return new Date(`${yearMatch[0]}-01-01`).getTime();

                      return 0;
                    };

                    const valA = getVal(a);
                    const valB = getVal(b);

                    // Sort descending purely by release date
                    if (valA !== valB) return valB - valA;
                    return String(b.id || "").localeCompare(String(a.id || ""));
                  })
                  .slice(0, 12)
                  .map((p) => {
                    const getYear = (val: any) => {
                      const dateStr = String(val || "");
                      const match = dateStr.match(/\b(20\d{2}|19\d{2})\b/);
                      return match ? match[0] : null;
                    };
                    const year = getYear(
                      p.releaseDate ||
                        p.release_date ||
                        p.metadata?.releaseDate ||
                        p.metadata?.release_date ||
                        p.releaseYear ||
                        p.release_year,
                    );

                    return {
                      id: p.id,
                      title: p.titleEn || p.english_name || p.title,
                      price: p.price,
                      image: resolveNintendoImageUrl(p, "listing-card"),
                      source: p,
                      subtitle: year
                        ? `${year} · ${p.developer || p.publisher || ""}`
                        : p.releaseDate || p.release_date || p.developer || p.publisher,
                      rating: p.metacriticRating ?? null,
                      platform: p.platform,
                    };
                  })}
                onSelect={(product: any) => onGameClick(product)}
                formatPrice={formatGenericPrice}
                onPress={() => playSound("bumper_end", 0.6)}
                ratingIcon={<BananaIcon className="w-3 h-3 sm:w-4 sm:h-4" solid />}
                loading={isPending}
              />
            </div>
          </section>
        </LazySection>

        {/* Dynamic / Custom Categories (excluding standard sections handled above and below) */}
        {adminCategories
          .filter((category) => {
            const catId = String(category.id || category.key || "").toLowerCase();
            const catTitle = String(category.title || category.name || "").toLowerCase();
            // Skip categories that correspond to known standard sections to prevent duplicate rendering
            if (
              catId === "nintendo-switch-games" ||
              catId === "cat_nintendo" ||
              catId === "nintendo_games" ||
              catId === "cat_1" ||
              catId === "hardware" ||
              catId === "cat_hardware" ||
              catId === "accessories" ||
              catId === "cat_accessories" ||
              catId === "amiibo" ||
              catId === "cat_amiibo" ||
              catId === "gift-cards" ||
              catId === "cat_gift_cards" ||
              catId === "used" ||
              catId === "cat_used" ||
              catId === "bundles" ||
              catTitle.includes("nintendo switch") ||
              catTitle.includes("هاردوير") ||
              catTitle.includes("إكسسوار") ||
              catTitle.includes("amiibo") ||
              catTitle.includes("تعبئة") ||
              catTitle.includes("مستخدم")
            ) {
              return false;
            }
            return true;
          })
          .map((category) => {
            const mapGame = (p: any) => ({
              id: p.id,
              slug: p.slug,
              title: p.titleEn || p.english_name || p.title,
              price: p.price,
              image: resolveNintendoImageUrl(p, "listing-card"),
              source: p,
              subtitle: p.developer || p.publisher || category.title || category.name,
              rating: p.metacriticRating ?? null,
              platform: p.platform,
            });

            const categoryProducts = adminProducts
              .filter((p) => p.category === category.id || p.categoryId === category.id)
              .map(mapGame);

            if (categoryProducts.length === 0) return null;

            return (
              <LazySection key={category.id}>
                <section className="mt-6 w-full max-w-full">
                  <div className="flex items-center justify-between gap-2 mb-4 px-4 sm:px-8">
                    <h3 className="text-xl font-bold text-foreground">
                      {t(category.title || category.name)}
                    </h3>
                    <Link
                      to="/category/$categoryId"
                      params={{ categoryId: category.id }}
                      className="text-orange-500 hover:text-orange-600 px-2 py-1 text-sm font-bold transition-colors"
                    >
                      {t("common.viewAll")}
                    </Link>
                  </div>
                  <ProductStrip
                    products={categoryProducts}
                    onSelect={(product: any) => onGameClick(product)}
                    formatPrice={formatGenericPrice}
                    onPress={() => playSound("bumper_end", 0.6)}
                    ratingIcon={<BananaIcon className="w-3 h-3 sm:w-4 sm:h-4" solid />}
                    loading={isPending}
                  />
                </section>
              </LazySection>
            );
          })}

        {/* Section 5: Hardware & Accessories (Single Unified Section) */}
        <LazySection>
          <section className="mt-8 w-full max-w-full">
            <div className="flex items-center justify-between gap-2 mb-4 px-4 sm:px-8">
              <h3 className="text-xl font-bold text-foreground">أجهزة الهاردوير وملحقاتها</h3>
              <Link
                to="/category/$categoryId"
                params={{ categoryId: "hardware" }}
                className="text-[#EA8918] text-sm font-bold hover:underline"
              >
                عرض الكل
              </Link>
            </div>
            <ProductStrip
              products={adminProducts
                .filter((p) => {
                  const resolved = getProductCategory(p);
                  return (
                    resolved === "hardware" ||
                    resolved === "accessory" ||
                    p.category === "hardware" ||
                    p.category === "accessories" ||
                    p.categoryId === "hardware" ||
                    p.categoryId === "accessories"
                  );
                })
                .slice(0, 12)
                .map((p) => ({
                  id: p.id,
                  slug: p.slug,
                  title: p.titleEn || p.english_name || p.title,
                  subtitle: p.developer || p.publisher || "Hardware & Accessories",
                  price: p.price,
                  image: resolveNintendoImageUrl(p, "listing-card"),
                  source: p,
                  rating: p.metacriticRating,
                }))}
              onSelect={(product: any) => onGameClick(product)}
              formatPrice={formatGenericPrice}
              onPress={() => playSound("bumper_end", 0.6)}
              ratingIcon={<BananaIcon className="w-3 h-3 sm:w-4 sm:h-4" solid />}
              loading={isPending}
            />
          </section>
        </LazySection>

        {/* Section 6: Amiibo */}
        <LazySection>
          <section className="mt-8 w-full max-w-full">
            <div className="flex items-center justify-between gap-2 mb-4 px-4 sm:px-8">
              <h3 className="text-xl font-bold text-foreground">مجسمات amiibo</h3>
              <Link
                to="/category/$categoryId"
                params={{ categoryId: "amiibo" }}
                className="text-[#EA8918] text-sm font-bold hover:underline"
              >
                عرض الكل
              </Link>
            </div>
            <ProductStrip
              products={adminProducts
                .filter(
                  (p) =>
                    getProductCategory(p) === "amiibo" ||
                    p.category === "amiibo" ||
                    p.categoryId === "amiibo",
                )
                .slice(0, 12)
                .map((p) => ({
                  id: p.id,
                  slug: p.slug,
                  title: p.titleEn || p.english_name || p.title,
                  subtitle: p.developer || "Amiibo",
                  price: p.price,
                  image: resolveNintendoImageUrl(p, "listing-card"),
                  source: p,
                  rating: p.metacriticRating,
                }))}
              onSelect={(product: any) => onGameClick(product)}
              formatPrice={formatGenericPrice}
              onPress={() => playSound("bumper_end", 0.6)}
              ratingIcon={<BananaIcon className="w-3 h-3 sm:w-4 sm:h-4" solid />}
              loading={isPending}
            />
          </section>
        </LazySection>

        {/* Section 7: Gift Cards */}
        <LazySection>
          <section className="mt-8 w-full max-w-full">
            <div className="flex items-center justify-between gap-2 mb-4 px-4 sm:px-8">
              <h3 className="text-xl font-bold text-foreground">
                كروت التعبئة Nintendo Gift Cards
              </h3>
              <Link
                to="/category/$categoryId"
                params={{ categoryId: "gift-cards" }}
                className="text-[#EA8918] text-sm font-bold hover:underline"
              >
                عرض الكل
              </Link>
            </div>
            <ProductStrip
              products={adminProducts
                .filter(
                  (p) =>
                    getProductCategory(p) === "gift_card" ||
                    p.category === "gift-cards" ||
                    p.categoryId === "gift-cards",
                )
                .slice(0, 12)
                .map((p) => ({
                  id: p.id,
                  slug: p.slug,
                  title: p.titleEn || p.english_name || p.title,
                  subtitle: p.developer || "Gift Card",
                  price: p.price,
                  image: resolveNintendoImageUrl(p, "listing-card"),
                  source: p,
                  rating: p.metacriticRating,
                }))}
              onSelect={(product: any) => onGameClick(product)}
              formatPrice={formatGenericPrice}
              onPress={() => playSound("bumper_end", 0.6)}
              ratingIcon={<BananaIcon className="w-3 h-3 sm:w-4 sm:h-4" solid />}
              loading={isPending}
            />
          </section>
        </LazySection>

        {/* Section 8: Used Parts & Games */}
        <LazySection>
          <section className="mt-8 w-full max-w-full">
            <div className="flex items-center justify-between gap-2 mb-4 px-4 sm:px-8">
              <h3 className="text-xl font-bold text-foreground">القطع والألعاب المستخدمة</h3>
              <Link
                to="/category/$categoryId"
                params={{ categoryId: "used" }}
                className="text-[#EA8918] text-sm font-bold hover:underline"
              >
                عرض الكل
              </Link>
            </div>
            <ProductStrip
              products={adminProducts
                .filter(
                  (p) =>
                    getProductCategory(p) === "used" ||
                    p.category === "used" ||
                    p.categoryId === "used",
                )
                .slice(0, 12)
                .map((p) => ({
                  id: p.id,
                  slug: p.slug,
                  title: p.titleEn || p.english_name || p.title,
                  subtitle: p.developer || "Used",
                  price: p.price,
                  image: resolveNintendoImageUrl(p, "listing-card"),
                  source: p,
                  rating: p.metacriticRating,
                }))}
              onSelect={(product: any) => onGameClick(product)}
              formatPrice={formatGenericPrice}
              onPress={() => playSound("bumper_end", 0.6)}
              ratingIcon={<BananaIcon className="w-3 h-3 sm:w-4 sm:h-4" solid />}
              loading={isPending}
            />
          </section>
        </LazySection>

        <LazySection>
          <Suspense
            fallback={
              <div className="h-40 animate-pulse animate-skeleton-shimmer bg-muted/10 rounded-3xl mx-4" />
            }
          >
            <HomeBananaMarket />
          </Suspense>
        </LazySection>

        {/* Section 11: News */}
        <LazySection>
          <section className="mt-8 mb-12 w-full max-w-full">
            <div className="flex items-center gap-2 mb-4 px-4 sm:px-8">
              <h3 className="text-xl font-bold text-foreground">{t("أحدث أخبار نينتندو")}</h3>
            </div>
            <Suspense
              fallback={
                <div className="h-40 animate-pulse animate-skeleton-shimmer bg-muted/10 rounded-3xl mx-4" />
              }
            >
              <NintendoNews />
            </Suspense>
          </section>
        </LazySection>
      </div>
    </motion.div>
  );
}
