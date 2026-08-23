import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";

import AppShell from "@/components/AppShell";
import ProductReviews from "@/components/ProductReviews";
import { ProductDetails } from "@/components/product-details/ProductDetails";
import { api } from "@/lib/api";
import { HARDWARE_SCHEMA } from "@/lib/productImport/hardwareSchema";
import { findProductByIdOrSlug } from "@/lib/productRouting";
import { getProductCategory } from "@/lib/productSection";

export const Route = createFileRoute("/hardware/$slug")({
  head: () => ({
    meta: [
      { title: "Hardware Details — Banana Store" },
      {
        name: "description",
        content: "Complete device specifications, compatibility and verified game performance.",
      },
      { property: "og:type", content: "product" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HardwareDetailsPage,
});

function HardwareDetailsPage() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ["store", "full"], queryFn: () => api.store() });
  const product = useMemo(
    () => findProductByIdOrSlug(data?.products, slug) as Record<string, any> | undefined,
    [data?.products, slug],
  );

  useEffect(() => {
    if (!product) return;
    document.title = `${String(product.title || product.name || "Hardware")} — Banana Store`;
    const description = String(
      product.seoDescription || product.description_short || product.description || "",
    );
    const meta = document.querySelector('meta[name="description"]');
    if (meta && description) meta.setAttribute("content", description);
  }, [product]);

  if (isLoading) {
    return (
      <AppShell currentView="details" hideNav>
        <div className="mx-auto max-w-7xl space-y-5 p-4">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="aspect-square animate-pulse rounded-3xl bg-muted" />
            <div className="h-80 animate-pulse rounded-3xl bg-muted" />
          </div>
        </div>
      </AppShell>
    );
  }

  if (!product) {
    return (
      <AppShell currentView="details" hideNav onBack={() => void navigate({ to: "/" })}>
        <div className="flex min-h-[60vh] items-center justify-center text-muted-foreground">
          Hardware product not found.
        </div>
      </AppShell>
    );
  }

  const image = resolvePurchaseImage(product).url;
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: String(product.title || product.name || ""),
    description: String(
      product.seoDescription || product.description_short || product.description || "",
    ),
    image: image ? [image] : undefined,
    brand: product.brand ? { "@type": "Brand", name: String(product.brand) } : undefined,
    model: String(product.model || product.modelNumber || product.hardwareModel || "") || undefined,
    releaseDate: String(product.releaseDate || "") || undefined,
    sku: String(product.sku || product.modelNumber || "") || undefined,
  };

  return (
    <AppShell currentView="details" hideNav onBack={() => void navigate({ to: "/" })}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <ProductDetails product={product} schema={HARDWARE_SCHEMA} />
      <ProductReviews productId={String(product.id)} />
    </AppShell>
  );
}
