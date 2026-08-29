import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface CartLine {
  id: string;
  productId: string | number;
  kind?: string;
  title: string;
  price: number;
  quantity: number;
  image?: string;
  optionId?: string;
  typeId?: string;
  source?: Record<string, unknown>;
  meta?: Record<string, any>;
  [key: string]: any;
}

export function cartCount(lines: CartLine[] = []): number {
  return lines.reduce((acc, item) => acc + (Number(item.quantity) || 1), 0);
}

export function cartTotal(lines: CartLine[] = []): number {
  return lines.reduce(
    (acc, item) => acc + (Number(item.price) || 0) * (Number(item.quantity) || 1),
    0
  );
}

export function cartNeedsAddress(lines: CartLine[] = []): boolean {
  return lines.some((l) => {
    const k = String(l.kind || "").toLowerCase();
    if (k === "hardware" || k === "accessory" || k === "used") return true;
    if (l.source && typeof l.source === "object") {
      const src = l.source as Record<string, any>;
      if (src.requiresShipping || src.isPhysical) return true;
    }
    return false;
  });
}

interface CartState {
  lines: CartLine[];
  add: (item: Partial<CartLine> & { productId: string | number; title?: string; price?: number }) => void;
  remove: (idOrProductId: string | number) => void;
  setQuantity: (idOrProductId: string | number, quantity: number) => void;
  clear: () => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      lines: [],
      add: (item) =>
        set((state) => {
          const id = item.id || `${item.productId}_${item.optionId || item.kind || "default"}`;
          const existingIndex = state.lines.findIndex(
            (line) => line.id === id || (line.productId === item.productId && line.optionId === item.optionId)
          );

          if (existingIndex > -1) {
            const updated = [...state.lines];
            const existing = updated[existingIndex]!;
            updated[existingIndex] = {
              ...existing,
              ...item,
              quantity: (existing.quantity || 1) + (item.quantity || 1),
            };
            return { lines: updated };
          }

          const newLine: CartLine = {
            id,
            productId: item.productId,
            title: item.title || "منتج",
            price: Number(item.price) || 0,
            quantity: item.quantity || 1,
            kind: item.kind || "account",
            image: item.image,
            optionId: item.optionId,
            typeId: item.typeId,
            source: item.source,
            meta: item.meta,
            ...item,
          };

          return { lines: [...state.lines, newLine] };
        }),
      remove: (idOrProductId) =>
        set((state) => ({
          lines: state.lines.filter(
            (line) => line.id !== String(idOrProductId) && line.productId !== idOrProductId
          ),
        })),
      setQuantity: (idOrProductId, quantity) =>
        set((state) => {
          if (quantity <= 0) {
            return {
              lines: state.lines.filter(
                (line) => line.id !== String(idOrProductId) && line.productId !== idOrProductId
              ),
            };
          }
          return {
            lines: state.lines.map((line) => {
              if (line.id === String(idOrProductId) || line.productId === idOrProductId) {
                return { ...line, quantity };
              }
              return line;
            }),
          };
        }),
      clear: () => set({ lines: [] }),
    }),
    {
      name: "cart-storage",
      storage: createJSONStorage(() => (typeof window !== "undefined" ? localStorage : (undefined as any))),
    }
  )
);
