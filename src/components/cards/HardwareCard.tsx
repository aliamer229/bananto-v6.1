import React from "react";
import { Link } from "@tanstack/react-router";
import { Cpu, CheckCircle2, ShieldCheck } from "lucide-react";
import { useCurrency } from "@/context/CurrencyContext";
import { productImageUrl } from "@/lib/productImages";
import { getProductSlug } from "@/lib/productRouting";

export function HardwareCard({ product }: { product: any }) {
  const { formatIQDPrice } = useCurrency();
  const slug = getProductSlug(product) || String(product.id || "");
  const title = product.titleEn || product.english_name || product.title || "";
  const model = product.model || product.modelNumber || product.hardwareModel || "";
  const price = Number(product.price) || 0;
  /*
    The listing chain, not the purchase chain: a card wants
    `listing_image → main_image → front_image → packaging_front_image`, which
    is the picture cropped for a grid. The cart and the toast keep the purchase
    chain so the line item matches what was clicked.
  */
  const image = productImageUrl(product, "listing");

  // Extract key specs
  const displaySpec = product.displayTech || product.screen || product.display || "120Hz OLED";
  const storageSpec = product.storage || product.internalStorage || "256GB";

  return (
    <Link
      to="/product/$productId"
      params={{ productId: slug }}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-border/80 bg-card p-4 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-primary/50"
    >
      <div className="relative mb-3 flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl bg-gradient-to-b from-muted/30 to-muted/10 p-4">
        {image ? (
          <img
            src={image}
            alt={title}
            loading="lazy"
            className="h-full w-full object-contain transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <Cpu className="h-12 w-12 stroke-[1.2]" />
          </div>
        )}

        <div className="absolute start-3 top-3 z-10 flex flex-wrap gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-md bg-foreground/90 px-2 py-0.5 text-[11px] font-bold text-background shadow-sm">
            Nintendo Hardware
          </span>
        </div>

        <div className="absolute bottom-3 end-3 z-10">
          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-3 w-3" />
            متوفر
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col justify-between gap-3" dir="ltr">
        <div>
          {model ? (
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {model}
            </span>
          ) : null}
          <h4
            className="line-clamp-2 text-base font-extrabold text-foreground transition-colors group-hover:text-primary"
            title={title} dir="auto"
          >
            {title}
          </h4>

          {/* Quick Specs Snippet */}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {displaySpec ? (
              <span className="rounded-md border border-border/60 bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-foreground">
                {displaySpec}
              </span>
            ) : null}
            {storageSpec ? (
              <span className="rounded-md border border-border/60 bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-foreground">
                {storageSpec}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex items-baseline justify-between border-t border-border/50 pt-3">
          <span className="text-xs text-muted-foreground">السعر الرسمي</span>
          <span className="text-base font-black text-foreground sm:text-lg">
            {formatIQDPrice(price)}
          </span>
        </div>
      </div>
    </Link>
  );
}
