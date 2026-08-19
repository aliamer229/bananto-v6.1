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
import { CartridgeStrip, ProductStrip, CartridgeSkeleton } from "./ProductStrips";
import { BundleStrip } from "./BundleStrip";
import type { AccountBundle } from "@/lib/types";
import { rankByPreference } from "@/lib/recommend";
import { useAuth } from "@/hooks/useAuth";
import { cdnImage } from "@/lib/img";
import { LazySection } from "./LazySection";
import { lazyWithRetry } from "@/lib/lazyRetry";

// Heavy components lazily loaded with retry
const NintendoNews = lazyWithRetry(() => import("./NintendoNews"));
const HomeBananaMarket = lazyWithRetry(() =>
  import("./HomeBananaMarket").then((m) => ({ default: m.HomeBananaMarket })),
);
const StoreServices = lazyWithRetry(() =>
  import("./StoreServices").then((m) => ({ default: m.StoreServices })),
);

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
 * Unified image selector for Nintendo game cards.
 * Ensures the clean front cover / key art is used instead of the 3D box or flat spread.
 */
export function getNintendoCardImage(product: Record<string, any>): string {
  if (!product) {
    return "https://images.unsplash.com/photo-1605901309584-818e25960b8f?q=80&w=400&h=400&fit=crop";
  }

  // 1. Explicit front cover or standard main image
  if (typeof product.cartridgeImage === "string" && product.cartridgeImage.trim()) {
    return product.cartridgeImage.trim();
  }
  if (typeof product.image === "string" && product.image.trim()) {
    return product.image.trim();
  }
  if (typeof product.coverImage === "string" && product.coverImage.trim()) {
    return product.coverImage.trim();
  }
  if (typeof product.coverUrl === "string" && product.coverUrl.trim()) {
    return product.coverUrl.trim();
  }

  // 2. First image from list
  if (Array.isArray(product.images) && product.images.length > 0) {
    const first = product.images[0];
    const url = typeof first === "string" ? first : first?.url;
    if (typeof url === "string" && url.trim()) return url.trim();
  }

  // 3. First gallery item
  if (Array.isArray(product.gallery) && product.gallery.length > 0) {
    const first = product.gallery[0];
    const url = typeof first === "string" ? first : first?.url;
    if (typeof url === "string" && url.trim()) return url.trim();
  }
  if (Array.isArray(product.galleryImages) && product.galleryImages.length > 0) {
    const first = product.galleryImages[0];
    const url = typeof first === "string" ? first : first?.url;
    if (typeof url === "string" && url.trim()) return url.trim();
  }

  // 4. Banner / key art fallback
  if (typeof product.bannerImage === "string" && product.bannerImage.trim()) {
    return product.bannerImage.trim();
  }
  if (typeof product.banner === "string" && product.banner.trim()) {
    return product.banner.trim();
  }

  return "https://images.unsplash.com/photo-1605901309584-818e25960b8f?q=80&w=400&h=400&fit=crop";
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

    setTimeout(() => setClickedCartridgeId(game.id), 0);

    // Preload image for smoother transition
    if (game.image) {
      const img = new Image();
      img.src = game.image;
    }

    // Delay split reveal so the cartridge pop animation can be seen
    setTimeout(() => {
      onGameClick(game, true);
    }, 400);
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
        className={`bg-[var(--page)] rounded-t-[24px] pt-0 -mt-6 pb-12 px-4 space-y-8 relative shadow-[0_-10px_20px_rgba(0,0,0,0.1)] z-10 flex-1`}
      >
        {/* Store Services and Guides - Moved outside categories loop to ensure it always renders */}
        <Suspense
          fallback={
            <div className="h-20 animate-pulse animate-skeleton-shimmer bg-muted/10 rounded-2xl mx-4" />
          }
        >
          <StoreServices />
        </Suspense>

        {/* Dynamic Categories */}

        {adminCategories.map((category, index) => {
          const mapGame = (p: any) => ({
            id: p.id,
            title: p.title,
            price: p.price,
            image: getNintendoCardImage(p),
            banner: p.banner,
            gallery: p.gallery,
            subtitle: p.developer || p.publisher || category.title,
            rating: p.metacriticRating ?? null,
            platform: p.platform,
          });

          // First section is the cartridge shelf: it shows every game on the
          // platform, not only the ones tagged with this category id.
          const categoryProducts = (
            index === 0 ? adminProducts : adminProducts.filter((p) => p.category === category.id)
          ).map(mapGame);

          if (
            categoryProducts.length === 0 ||
            (index > 0 && category.id === "nintendo-switch-games")
          )
            return null;

          if (index === 0) {
            return (
              <React.Fragment key={category.id}>
                <section className="relative mt-2 pb-6 -mx-4">
                  <div className="mb-3 px-8 flex items-center justify-between">
                    <h3 className="truncate text-xl font-bold text-foreground">
                      {t(category.title)}
                    </h3>
                    <Link
                      to="/category/$categoryId"
                      params={{ categoryId: category.id }}
                      className="text-[#EA8918] text-sm font-bold hover:underline"
                    >
                      {t("عرض الكل")}
                    </Link>
                  </div>

                  <div className="relative mb-8 mt-2 min-h-[200px]">
                    {isPending && adminProducts.length === 0 ? (
                      <CartridgeSkeleton />
                    ) : (
                      <CartridgeStrip
                        games={categoryProducts}
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
              </React.Fragment>
            );
          }

          return (
            <LazySection key={category.id}>
              <section className="-mx-4 mt-4">
                <h3 className="text-xl font-bold text-foreground mb-4 px-8">{t(category.title)}</h3>
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

        {/* Section 4: Latest Nintendo Games Added by Release Date */}
        <LazySection>
          <section className="-mx-4 mt-8">
            <div className="flex items-center gap-2 mb-4 px-8">
              <h3 className="text-xl font-bold text-foreground">
                {t("أحدث ألعاب نينتندو المضافة")}
              </h3>
              <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">
                New
              </span>
            </div>
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
                    catId === "nintendo-switch-games" ||
                    kind === "account" ||
                    kind === "offline_account" ||
                    kind === "online_account" ||
                    kind === "physical" ||
                    Boolean(p.releaseDate || p.release_date)
                  );
                })
                .sort((a, b) => {
                  const dateA = new Date(
                    a.releaseDate || a.release_date || a.createdAt || 0,
                  ).getTime();
                  const dateB = new Date(
                    b.releaseDate || b.release_date || b.createdAt || 0,
                  ).getTime();
                  return dateB - dateA;
                })
                .slice(0, 12)
                .map((p) => ({
                  id: p.id,
                  title: p.title,
                  subtitle:
                    p.releaseDate || p.release_date
                      ? `${t("تاريخ الإصدار") || "الإصدار"}: ${p.releaseDate || p.release_date}`
                      : p.developer || "Nintendo Switch",
                  price: p.price,
                  image: getNintendoCardImage(p),
                  banner: p.banner,
                  gallery: p.gallery,
                  rating: p.metacriticRating ?? 90,
                }))}
              onSelect={(product: any) => onGameClick(product)}
              formatPrice={formatGenericPrice}
              onPress={() => playSound("bumper_end", 0.6)}
              ratingIcon={<BananaIcon className="w-3 h-3 sm:w-4 sm:h-4" solid />}
              loading={isPending}
            />
          </section>
        </LazySection>

        {/* Section 5: Hardware */}
        <LazySection>
          <section className="-mx-4 mt-8">
            <div className="flex items-center gap-2 mb-4 px-8">
              <h3 className="text-xl font-bold text-foreground">أجهزة الهاردوير وملحقاتها</h3>
              <Link
                to="/category/$categoryId"
                params={{ categoryId: "hardware" }}
                className="text-[#EA8918] text-sm font-bold hover:underline me-auto"
              >
                عرض الكل
              </Link>
            </div>
            <ProductStrip
              products={adminProducts
                .filter((p) => p.category === "hardware")
                .slice(0, 8)
                .map((p) => ({
                  id: p.id,
                  title: p.title,
                  subtitle: p.developer || "Hardware",
                  price: p.price,
                  image:
                    p.image ||
                    p.coverImage ||
                    "https://images.unsplash.com/photo-1578271887552-5ac3a72752bc?q=80&w=400&h=400&fit=crop",
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
          <section className="-mx-4 mt-8">
            <div className="flex items-center gap-2 mb-4 px-8">
              <h3 className="text-xl font-bold text-foreground">مجسمات amiibo</h3>
              <Link
                to="/category/$categoryId"
                params={{ categoryId: "amiibo" }}
                className="text-[#EA8918] text-sm font-bold hover:underline me-auto"
              >
                عرض الكل
              </Link>
            </div>
            <ProductStrip
              products={adminProducts
                .filter((p) => p.category === "amiibo")
                .slice(0, 8)
                .map((p) => ({
                  id: p.id,
                  title: p.title,
                  subtitle: p.developer || "Amiibo",
                  price: p.price,
                  image:
                    p.image ||
                    p.coverImage ||
                    "https://images.unsplash.com/photo-1612404730960-5c71577fca11?q=80&w=400&h=400&fit=crop",
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

        {/* Section 7: Accessories */}
        <LazySection>
          <section className="-mx-4 mt-8">
            <div className="flex items-center gap-2 mb-4 px-8">
              <h3 className="text-xl font-bold text-foreground">الإكسسوارات</h3>
              <Link
                to="/category/$categoryId"
                params={{ categoryId: "accessories" }}
                className="text-[#EA8918] text-sm font-bold hover:underline me-auto"
              >
                عرض الكل
              </Link>
            </div>
            <ProductStrip
              products={adminProducts
                .filter((p) => p.category === "accessories")
                .slice(0, 8)
                .map((p) => ({
                  id: p.id,
                  title: p.title,
                  subtitle: p.developer || "Accessory",
                  price: p.price,
                  image:
                    p.image ||
                    p.coverImage ||
                    "https://images.unsplash.com/photo-1605901309584-818e25960b8f?q=80&w=400&h=400&fit=crop",
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

        {/* Section 8: Gift Cards */}
        <LazySection>
          <section className="-mx-4 mt-8">
            <div className="flex items-center gap-2 mb-4 px-8">
              <h3 className="text-xl font-bold text-foreground">
                كروت التعبئة Nintendo Gift Cards
              </h3>
            </div>
            <ProductStrip
              products={adminProducts
                .filter((p) => p.category === "gift-cards")
                .slice(0, 8)
                .map((p) => ({
                  id: p.id,
                  title: p.title,
                  subtitle: p.developer || "Gift Card",
                  price: p.price,
                  image:
                    p.image ||
                    p.coverImage ||
                    "https://images.unsplash.com/photo-1621932953986-15fcf084da0f?q=80&w=400&h=400&fit=crop",
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

        {/* Section 9: Used Parts & Games */}
        <LazySection>
          <section className="-mx-4 mt-8">
            <div className="flex items-center gap-2 mb-4 px-8">
              <h3 className="text-xl font-bold text-foreground">القطع والألعاب المستخدمة</h3>
              <Link
                to="/category/$categoryId"
                params={{ categoryId: "used" }}
                className="text-[#EA8918] text-sm font-bold hover:underline me-auto"
              >
                عرض الكل
              </Link>
            </div>
            <ProductStrip
              products={adminProducts
                .filter((p) => p.category === "used")
                .slice(0, 8)
                .map((p) => ({
                  id: p.id,
                  title: p.title,
                  subtitle: p.developer || "Used",
                  price: p.price,
                  image:
                    p.image ||
                    p.coverImage ||
                    "https://images.unsplash.com/photo-1593118247619-e2d6f056869e?q=80&w=400&h=400&fit=crop",
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
          <section className="-mx-4 mt-8 mb-12">
            <div className="flex items-center gap-2 mb-4 px-8">
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
