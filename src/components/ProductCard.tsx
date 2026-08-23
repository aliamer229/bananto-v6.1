import React from "react";
import { getProductCategory } from "@/lib/productSection";
import { GameCard } from "./cards/GameCard";
import { HardwareCard } from "./cards/HardwareCard";
import { AccessoryCard } from "./cards/AccessoryCard";

/**
 * Intelligent Grid Card Dispatcher.
 * Renders tailored card templates for Game, Hardware, and Accessory products.
 */
export function ProductCard({ product }: { product: any }) {
  if (!product) return null;

  const category = getProductCategory(product);

  if (category === "hardware") {
    return <HardwareCard product={product} />;
  }

  if (category === "accessory") {
    return <AccessoryCard product={product} />;
  }

  return <GameCard product={product} />;
}
