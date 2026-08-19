import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { ProductKind } from "@/lib/types";

export interface CartLine {
  productId: string | number;
  title: string;
  image?: string;
  price: number;
  kind: ProductKind;
  quantity: number;
  /** Which hub offer this line came from (account / lend / disc). */
  offerKind?: string;
  offerLabel?: string;
  /** Specific option selection (e.g. Offline account, Online account) */
  optionId?: string;
  optionName?: string;
  /** Specific type / variant selection (e.g. Standard, DLC) */
  typeId?: string;
  typeName?: string;
  editionId?: string;
  /** Physical offers need a delivery address at checkout. */
  requiresAddress?: boolean;
  meta?: {
    editionId?: string | null;
    dlcIds?: string[] | null;
    optionId?: string | null;
    optionName?: string | null;
    typeId?: string | null;
    typeName?: string | null;
  };
}

/** Lines are unique per product, offer, option, type, and edition so separate combinations don't merge by mistake. */
export const lineKey = (line: Partial<CartLine> & { productId: string | number }) =>
  `${String(line.productId)}::${line.offerKind ?? ""}::${line.optionId ?? ""}::${line.typeId ?? ""}::${line.editionId ?? ""}`;

interface CartState {
  lines: CartLine[];
  add: (line: Omit<CartLine, "quantity">, quantity?: number) => void;
  setQuantity: (
    productId: string | number,
    quantity: number,
    offerKind?: string,
    optionId?: string,
    typeId?: string,
    editionId?: string,
  ) => void;
  remove: (
    productId: string | number,
    offerKind?: string,
    optionId?: string,
    typeId?: string,
    editionId?: string,
  ) => void;
  clear: () => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      lines: [],
      add: (line, quantity = 1) =>
        set((state) => {
          const key = lineKey(line);
          if (state.lines.some((l) => lineKey(l) === key)) {
            return {
              lines: state.lines.map((l) =>
                lineKey(l) === key ? { ...l, quantity: l.quantity + quantity } : l,
              ),
            };
          }
          return { lines: [...state.lines, { ...line, quantity }] };
        }),
      setQuantity: (productId, quantity, offerKind, optionId, typeId, editionId) =>
        set((state) => {
          const key = lineKey({ productId, offerKind, optionId, typeId, editionId });
          return {
            lines: state.lines
              .map((l) => (lineKey(l) === key ? { ...l, quantity: Math.max(0, quantity) } : l))
              .filter((l) => l.quantity > 0),
          };
        }),
      remove: (productId, offerKind, optionId, typeId, editionId) =>
        set((state) => {
          const key = lineKey({ productId, offerKind, optionId, typeId, editionId });
          return { lines: state.lines.filter((l) => lineKey(l) !== key) };
        }),
      clear: () => set({ lines: [] }),
    }),
    { name: "banana_cart_v1" },
  ),
);

export const cartCount = (lines: CartLine[]) => lines.reduce((sum, l) => sum + l.quantity, 0);
export const cartTotal = (lines: CartLine[]) =>
  lines.reduce((sum, l) => sum + l.price * l.quantity, 0);
export const cartNeedsAddress = (lines: CartLine[]) =>
  lines.some((l) => l.requiresAddress === true || l.kind === "hardware");
