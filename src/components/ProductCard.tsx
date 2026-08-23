import React from "react";
import { Link } from "@tanstack/react-router";
import { Star } from "lucide-react";

import NintendoCover from "./NintendoCover";

/**
 * Grid card for the category pages.
 *
 * The artwork used to be rendered at `w-[200%]` with `margin-left: -100%` and a
 * gradient mask that hid the left half. That assumed every source file was a
 * double-wide back│front spread, which almost none of them are — so an ordinary
 * front cover had its left half thrown away and the right half blown up to
 * twice size. It also meant each card held an element twice as wide as itself,
 * contained only by the parent's `overflow-hidden`.
 *
 * Both are gone. `NintendoCover` frames the real artwork at the shared cover
 * ratio, and nothing in the card is wider than the card.
 */
export function ProductCard({ product }: { product: any }) {
  return (
    <Link
      to="/product/$productId"
      params={{ productId: product.id }}
      className="bg-card rounded-2xl p-2 shadow-sm border border-border cursor-pointer hover:shadow-md transition-all group block"
    >
      <NintendoCover
        product={product}
        usage="listing-card"
        alt={product.title}
        className="mb-3 rounded-xl bg-muted/20"
        imgClassName="group-hover:scale-105 transition-transform duration-300"
      />
      <h4 className="font-bold text-sm sm:text-base text-foreground truncate" dir="ltr">
        {product.titleEn || product.english_name || product.title}
      </h4>
      <p className="text-xs sm:text-sm text-muted-foreground truncate" dir="ltr">
        {product.subtitle || product.category}
      </p>
      <div className="flex justify-between items-center mt-3">
        <div className="flex items-center text-amber-500 text-xs sm:text-sm font-bold gap-1 flex-row-reverse">
          {product.rating || "4.9"} <Star className="w-3 h-3 sm:w-4 sm:h-4 fill-current" />
        </div>
        <div className="text-foreground text-xs sm:text-sm font-bold" dir="ltr">
          {(Number(product.price) || 0).toLocaleString()} د.ع
        </div>
      </div>
    </Link>
  );
}
