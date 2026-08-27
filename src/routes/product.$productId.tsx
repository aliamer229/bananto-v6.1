import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";

import AppShell from "@/components/AppShell";
import ProductReviews from "@/components/ProductReviews";

import { CurrencyProvider } from "@/hub/context/CurrencyContext";
import { NotificationProvider } from "@/hub/context/NotificationContext";
import { UserProvider } from "@/hub/context/UserContext";
import { ProductDetails } from "@/components/product-details/ProductDetails";
import { gameFromProduct } from "@/hub/data/fromProduct";
import { GameHub } from "@/hub/gamehub/GameHub";
import { I18nProvider } from "@/hub/i18n";
import { tr, useI18n } from "@/i18n";
import { useStoreData } from "@/hooks/useStoreData";
import { detectSchema } from "@/lib/productImport/registry";
import { getProductCategory, schemaForSection } from "@/lib/productSection";
import { findProductByIdOrSlug, getProductSlug } from "@/lib/productRouting";
import { isProductPurchasable } from "@/lib/purchasable";
import { recordView } from "@/lib/view-history";

export const Route = createFileRoute("/product/$productId")({
  head: () => ({
    meta: [
      { title: "تفاصيل المنتج — بنانا ستور" },
      {
        name: "description",
        content: "كل تفاصيل المنتج: الأسعار والتوفر، المواصفات، الأداء والمراجعات.",
      },
      { property: "og:title", content: "تفاصيل المنتج — بنانا ستور" },
      {
        property: "og:description",
        content: "كل تفاصيل المنتج والأسعار في صفحة واحدة.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProductPage,
});

function ProductPage() {
  const { productId } = Route.useParams();
  const navigate = useNavigate();

  // 1. Instant cache access via shared store data
  const { data: storeData } = useStoreData();
  const cachedProduct = useMemo(
    () => findProductByIdOrSlug(storeData?.products, productId) as Record<string, unknown> | undefined,
    [storeData?.products, productId],
  );

  // 2. Fetch full product payload if needed
  const { data: singleProductData, isLoading: isSingleLoading } = useQuery({
    queryKey: ["product", productId],
    queryFn: async () => {
      const res = await fetch(`/api/product?id=${encodeURIComponent(productId)}`);
      if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error("failed_to_fetch_product");
      }
      const body = await res.json();
      return body.product as Record<string, unknown>;
    },
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });

  // Merge: single full product takes precedence, fallback to cached product immediately
  const product = singleProductData || cachedProduct;
  const isLoading = !product && isSingleLoading && !storeData;

  const lang = useI18n((s) => s.lang);
  const locale = lang === "ar" ? "ar" : "en";

  /*
    The Game Hub belongs to Nintendo Switch Games and nothing else. Every other
    section — hardware, amiibo, accessories, gift cards, used, bundles — renders
    its own schema-driven details page.
  */
  const section = useMemo(() => (product ? getProductCategory(product) : undefined), [product]);
  const isGame = section === "game";

  const schema = useMemo(
    () =>
      product && !isGame
        ? ((section ? schemaForSection(section) : undefined) ?? detectSchema(product))
        : undefined,
    [product, section, isGame],
  );

  const game = useMemo(
    () => (product && isGame ? gameFromProduct(product, locale, storeData?.products as any) : null),
    [product, isGame, locale, storeData?.products],
  );

  // Kept on the user's device; sent with a support message as a hint only.
  useEffect(() => {
    if (product) {
      const productTitle = String(product["titleEn"] || product["title"] || product["name"] || "");
      document.title = `${productTitle} — بنانا ستور`;
      recordView(String(product["id"] ?? productId), productTitle);
    }
  }, [product, productId]);

  if (isLoading) {
    return (
      <AppShell currentView="details" hideNav>
        <div className="mx-auto max-w-6xl space-y-4 p-4">
          <div className="aspect-[16/9] w-full animate-pulse rounded-3xl bg-[var(--page-2)]" />
          <div className="h-6 w-1/2 animate-pulse rounded-full bg-[var(--page-2)]" />
          <div className="h-40 w-full animate-pulse rounded-3xl bg-[var(--page-2)]" />
        </div>
      </AppShell>
    );
  }

  if (!product) {
    return (
      <AppShell currentView="details" hideNav>
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
          <p className="text-muted-foreground">{tr("لم يتم العثور على هذا المنتج.")}</p>
          <button
            onClick={() => void navigate({ to: "/" })}
            className="rounded-xl bg-[var(--brand-red)] px-4 py-2 text-sm font-bold text-white"
          >
            {tr("رجوع للمتجر")}
          </button>
        </div>
      </AppShell>
    );
  }

  if (game && isGame) {
    return (
      <I18nProvider>
        <CurrencyProvider>
          <UserProvider>
            <NotificationProvider>
              <div className="relative min-h-screen bg-[rgb(var(--bg))] text-[rgb(var(--text))]">
                <GameHub
                  game={game}
                  onNavigateGuide={(slug) => {
                    const el = document.getElementById("guides");
                    el?.scrollIntoView({ behavior: "smooth" });
                  }}
                />
              </div>
            </NotificationProvider>
          </UserProvider>
        </CurrencyProvider>
      </I18nProvider>
    );
  }

  return (
    <AppShell currentView="details" hideNav>
      <div className="min-h-screen bg-[var(--page)]">
        <ProductDetails
          product={product}
          schema={schema}
        />
        <div className="mx-auto max-w-6xl px-4 py-8">
          <ProductReviews productId={String(product["id"])} />
        </div>
      </div>
    </AppShell>
  );
}
