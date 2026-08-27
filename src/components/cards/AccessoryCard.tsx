import React from "react";
import { Link } from "@tanstack/react-router";
import { Headphones, CheckCircle2 } from "lucide-react";
import { useCurrency } from "@/context/CurrencyContext";
import { productImageUrl } from "@/lib/productImages";
import { getProductSlug } from "@/lib/productRouting";

export function AccessoryCard({ product }: { product: any }) {
  const { formatIQDPrice } = useCurrency();
  const slug = getProductSlug(product) || String(product.id || "");
  const title = product.titleEn || product.english_name || product.title || "";
  const subtitle = product.categoryTitle || product.category || "إكسسوار نينتندو";
  const price = Number(product.price) || 0;
  /*
    The listing chain, not the purchase chain: a card wants
    `listing_image → main_image → front_image → packaging_front_image`, which
    is the picture cropped for a grid. The cart and the toast keep the purchase
    chain so the line item matches what was clicked.
  */
  const image = productImageUrl(product, "listing");

  return (
    <Link
      to="/product/$productId"
      params={{ productId: slug }}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-border/80 bg-card p-3 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-primary/50"
    >
      <div className="relative mb-3 flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl bg-gradient-to-b from-muted/30 to-muted/10 p-3">
        {image ? (
          <img
            src={image}
            alt={title}
            loading="lazy"
            className="h-full w-full object-contain transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <Headphones className="h-10 w-10 stroke-[1.2]" />
          </div>
        )}

        <div className="absolute start-2 top-2 z-10">
          <span className="inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-[11px] font-semibold text-secondary-foreground shadow-sm">
            Accessory
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col justify-between gap-2" dir="ltr">
        <div>
          <h4
            className="line-clamp-2 text-sm font-bold leading-snug text-foreground transition-colors group-hover:text-primary sm:text-base"
            title={title} dir="auto"
          >
            {title}
          </h4>
          <p className="mt-0.5 truncate text-xs text-muted-foreground" dir="auto">{subtitle}</p>
        </div>

        <div className="flex items-baseline justify-between border-t border-border/50 pt-2">
          <span className="text-xs text-muted-foreground">السعر</span>
          <span className="text-sm font-extrabold text-foreground sm:text-base">
            {formatIQDPrice(price)}
          </span>
        </div>
      </div>
    </Link>
  );
}
