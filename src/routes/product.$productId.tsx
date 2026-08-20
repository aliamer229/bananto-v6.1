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
import { api } from "@/lib/api";
import { detectSchema } from "@/lib/productImport/registry";
import { resolveCategoryType, schemaForSection } from "@/lib/productSection";
import { isProductPurchasable } from "@/lib/purchasable";
import { recordView } from "@/lib/view-history";

export const Route = createFileRoute("/product/$productId")({
  head: () => ({
    meta: [
      { title: "تفاصيل اللعبة — بنانا ستور" },
      {
        name: "description",
        content: "كل تفاصيل اللعبة: الأسعار والتوفر، القصة، الفيديوهات، الأداء والمراجعات.",
      },
      { property: "og:title", content: "تفاصيل اللعبة — بنانا ستور" },
      {
        property: "og:description",
        content: "أسعار الحسابات وإقراض الكارتلج، مع كل معلومات اللعبة في صفحة واحدة.",
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

  const { data, isLoading } = useQuery({ queryKey: ["store", "full"], queryFn: () => api.store() });
  const found = data?.products.find((p) => String(p.id) === productId) as
    Record<string, unknown> | undefined;

  const lang = useI18n((s) => s.lang);
  const locale = lang === "ar" ? "ar" : "en";

  // Keep the found product regardless of whether it has strict purchase validation,
  // so admins and customers can always view the product details page.
  const product = found;

  /*
    The Game Hub belongs to Nintendo Switch Games and nothing else. Every other
    section — hardware, amiibo, accessories, gift cards, used, bundles — renders
    its own schema-driven details page, so a gift card never shows a game's
    story, trailers or cartridge pricing.
  */
  const section = useMemo(
    () =>
      product
        ? resolveCategoryType(
            String(product["category"] ?? product["categoryId"] ?? ""),
            String(product["categoryTitle"] ?? ""),
            String(product["kind"] ?? ""),
          )
        : undefined,
    [product],
  );

  const isGame = section === "game";

  const schema = useMemo(
    () =>
      product && !isGame
        ? ((section ? schemaForSection(section) : undefined) ?? detectSchema(product))
        : undefined,
    [product, section, isGame],
  );

  const game = useMemo(
    () => (product && isGame ? gameFromProduct(product, locale) : null),
    [product, isGame, locale],
  );

  // Kept on the user's device; sent with a support message as a hint only.
  useEffect(() => {
    if (product) recordView(String(product["id"] ?? productId), String(product["title"] ?? ""));
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

  if (product && (!isGame || !game || schema)) {
    return (
      <AppShell currentView="details" hideNav onBack={() => void navigate({ to: "/" })}>
        <ProductDetails product={product} schema={schema} />
        <ProductReviews productId={String(product["id"] ?? productId)} />
      </AppShell>
    );
  }

  if (!game) return null;

  return (
    <AppShell currentView="details" hideNav onBack={() => void navigate({ to: "/" })}>
      <I18nProvider>
        <CurrencyProvider>
          <NotificationProvider>
            <UserProvider>
              <GameHub game={game} />
              <ProductReviews productId={String(product?.["id"] ?? productId)} />
            </UserProvider>
          </NotificationProvider>
        </CurrencyProvider>
      </I18nProvider>
    </AppShell>
  );
}
