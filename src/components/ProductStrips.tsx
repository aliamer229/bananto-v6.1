import React, { useState } from "react";
import Cartridge, { type CartridgeGame } from "./Cartridge";
import StaggerItem from "./StaggerItem";
import { useBatches } from "@/hooks/useBatches";
import { cdnImage } from "@/lib/img";

/**
 * Horizontal cartridge shelf. Renders in batches: reaching the end of the strip
 * reveals the next batch with the staggered fade-in.
 */
export function CartridgeStrip({
  games,
  clickedId,
  onSelect,
}: {
  games: (CartridgeGame & { [k: string]: any })[];
  clickedId: string | number | null;
  onSelect: (game: any) => void;
}) {
  const { visible, hasMore, sentinelRef, delayFor } = useBatches(games, 8);

  return (
    <div
      className="flex gap-3.5 overflow-x-auto pt-2 px-8 no-scrollbar snap-x relative z-10 items-end"
      dir="ltr"
    >
      {visible.map((game, i) => (
        <StaggerItem key={game.id} className="shrink-0" delay={delayFor(i)}>
          <Cartridge
            game={game}
            index={i}
            animate={false}
            clicked={clickedId === game.id}
            onSelect={() => onSelect(game)}
          />
        </StaggerItem>
      ))}
      {hasMore && (
        <div
          ref={sentinelRef}
          className="shrink-0 w-[115px] h-[196px] flex items-center justify-center"
        >
          <div className="w-6 h-6 border-2 border-border border-t-red-500 rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}

export function CartridgeSkeleton() {
  return (
    <div className="flex gap-3.5 overflow-x-auto pt-2 px-8 no-scrollbar items-end">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="shrink-0 w-[115px] h-[196px] bg-muted/20 rounded-2xl animate-pulse animate-skeleton-shimmer"
        />
      ))}
    </div>
  );
}

/** Horizontal card strip used by the non-cartridge sections. */

export function ProductStrip({
  products,
  onSelect,
  formatPrice,
  onPress,
  ratingIcon,
  loading = false,
}: {
  products: any[];
  onSelect: (product: any) => void;
  formatPrice: (value: any) => string;
  onPress: () => void;
  ratingIcon: React.ReactNode;
  loading?: boolean;
}) {
  const [clickedId, setClickedId] = useState<string | number | null>(null);
  const { visible, hasMore, sentinelRef, delayFor } = useBatches(products, 8);

  if (loading && products.length === 0) {
    return (
      <div className="flex gap-3 overflow-x-auto no-scrollbar pb-4 px-8">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="w-[140px] sm:w-[160px] h-[200px] shrink-0 bg-muted/20 rounded-2xl animate-pulse animate-skeleton-shimmer"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-3 overflow-x-auto no-scrollbar pb-4 snap-x px-8">
      {visible.map((product, i) => (
        <StaggerItem key={product.id || i} className="shrink-0" delay={delayFor(i)}>
          <div
            className={`w-[140px] sm:w-[160px] bg-card rounded-2xl p-2 shadow-sm border border-border snap-start cursor-pointer hover:shadow-md transition-all group relative ${clickedId === product.id ? "scale-[0.98] opacity-90" : ""}`}
            onPointerDown={onPress}
            onClick={() => {
              if (clickedId != null) return;
              setClickedId(product.id);
              setTimeout(() => onSelect(product), 50);
            }}
          >
            <div className="overflow-hidden rounded-xl mb-3 relative">
              <img
                src={cdnImage(product.image)}
                loading="lazy"
                decoding="async"
                className="w-full aspect-square object-cover group-hover:scale-105 transition-transform duration-300"
                alt={product.title}
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors"></div>
              {clickedId === product.id && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                </div>
              )}
            </div>
            <h4 className="font-bold text-sm sm:text-base text-foreground truncate" dir="ltr">
              {product.title}
            </h4>
            <p className="text-xs sm:text-sm text-muted-foreground truncate" dir="ltr">
              {product.subtitle}
            </p>
            <div className="flex justify-between items-center mt-3">
              <div className="flex items-center text-amber-500 text-xs sm:text-sm font-bold gap-1 flex-row-reverse">
                {product.rating} {ratingIcon}
              </div>
              <div className="text-foreground text-xs sm:text-sm font-bold" dir="ltr">
                {formatPrice(product.price)}
              </div>
            </div>
          </div>
        </StaggerItem>
      ))}
      {hasMore && (
        <div ref={sentinelRef} className="shrink-0 w-[140px] flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-border border-t-red-500 rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}
