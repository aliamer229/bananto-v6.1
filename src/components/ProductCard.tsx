import React from "react";
import { Link } from "@tanstack/react-router";
import { Star } from "lucide-react";

import { cdnImage } from "@/lib/img";

export function ProductCard({
  product,
  forceStandardImage,
}: {
  product: any;
  forceStandardImage?: boolean;
}) {
  // If forceStandardImage is true, we ignore cartridgeImage and use the standard product image
  const displayImage = forceStandardImage
    ? product.image || product.coverImage || product.coverUrl
    : product.cartridgeImage || product.image || product.coverImage || product.coverUrl;

  return (
    <Link
      to="/product/$productId"
      params={{ productId: product.id }}
      className="bg-card rounded-2xl p-2 shadow-sm border border-border cursor-pointer hover:shadow-md transition-all group block"
    >
      <div className="overflow-hidden rounded-xl mb-3 relative aspect-[3/4] bg-muted/20">
        <img
          src={cdnImage(
            displayImage ||
              "https://images.unsplash.com/photo-1612404730960-5c71577fca11?q=80&w=400&h=400&fit=crop",
          )}
          loading="lazy"
          decoding="async"
          className="w-[200%] max-w-none h-full object-cover object-right group-hover:scale-105 transition-transform duration-300"
          style={{
            marginLeft: "-100%",
            maskImage: "linear-gradient(to right, transparent 50%, black 50%)",
            WebkitMaskImage: "linear-gradient(to right, transparent 50%, black 50%)",
          }}
          alt={product.title}
        />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors"></div>
      </div>
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
          ${product.price}
        </div>
      </div>
    </Link>
  );
}
