import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export interface CartLine {
  id?: string;
  productId: string | number;
  kind?: string;
  title: string;
  price: number;
  quantity: number;
  image?: string;
  offerKind?: string;
  offerLabel?: string;
  optionId?: string;
  optionName?: string;
  typeId?: string;
  typeName?: string;
  editionId?: string;
  dlcIds?: string[];
  requiresAddress?: boolean;
  source?: Record<string, unknown>;
  meta?: {
    editionId?: string | null;
    dlcIds?: string[] | null;
    optionId?: string | null;
    optionName?: string | null;
    typeId?: string | null;
    typeName?: string | null;
    [key: string]: unknown;
  };
}

/** Keep separate offers, options, types, and editions as separate cart lines. */
export const lineKey = (line: Partial<CartLine> & { productId: string | number }) =>
  `${String(line.productId)}::${line.offerKind ?? ""}::${line.optionId ?? ""}::${line.typeId ?? ""}::${line.editionId ?? ""}`;

export function cartCount(lines: CartLine[] = []): number {
  return lines.reduce((acc, item) => acc + (Number(item.quantity) || 1), 0);
}

export function cartTotal(lines: CartLine[] = []): number {
  return lines.reduce(
    (acc, item) => acc + (Number(item.price) || 0) * (Number(item.quantity) || 1),
    0,
  );
}

export function cartNeedsAddress(lines: CartLine[] = []): boolean {
  return lines.some((line) => {
    if (line.requiresAddress === true) return true;
    const kind = String(line.kind || "").toLowerCase();
    if (kind === "hardware" || kind === "accessory" || kind === "used") return true;
    return Boolean(line.source?.["requiresShipping"] || line.source?.["isPhysical"]);
  });
}

type NewCartLine = Omit<CartLine, "quantity"> & { quantity?: number };

interface CartState {
  lines: CartLine[];
  add: (item: NewCartLine, quantity?: number) => void;
  remove: (
    productId: string | number,
    offerKind?: string,
    optionId?: string,
    typeId?: string,
    editionId?: string,
  ) => void;
  setQuantity: (
    productId: string | number,
    quantity: number,
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
      add: (item, explicitQuantity) =>
        set((state) => {
          const quantity = Math.max(1, Number(explicitQuantity ?? item.quantity) || 1);
          const key = lineKey(item);
          const existingIndex = state.lines.findIndex((line) => lineKey(line) === key);

          if (existingIndex >= 0) {
            const lines = [...state.lines];
            const existing = lines[existingIndex]!;
            lines[existingIndex] = {
              ...existing,
              ...item,
              quantity: existing.quantity + quantity,
            };
            return { lines };
          }

          return {
            lines: [
              ...state.lines,
              {
                ...item,
                id: item.id || key,
                quantity,
              },
            ],
          };
        }),
      remove: (productId, offerKind, optionId, typeId, editionId) =>
        set((state) => {
          const key = lineKey({ productId, offerKind, optionId, typeId, editionId });
          return { lines: state.lines.filter((line) => lineKey(line) !== key) };
        }),
      setQuantity: (productId, quantity, offerKind, optionId, typeId, editionId) =>
        set((state) => {
          const key = lineKey({ productId, offerKind, optionId, typeId, editionId });
          return {
            lines: state.lines
              .map((line) =>
                lineKey(line) === key ? { ...line, quantity: Math.max(0, quantity) } : line,
              )
              .filter((line) => line.quantity > 0),
          };
        }),
      clear: () => set({ lines: [] }),
    }),
    {
      name: "cart-storage",
      storage: createJSONStorage(() =>
        typeof window !== "undefined" ? localStorage : (undefined as never),
      ),
    },
  ),
);
