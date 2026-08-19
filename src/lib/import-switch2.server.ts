import { getStore, updateStore } from "./db.server";
import type { StoreDoc, Product } from "./types";

const IMPORT_VERSION = "switch-unified-v5";
const GAMES_CATEGORY_ID = "nintendo-switch-games";

/**
 * Unifies all Switch 1 & 2 games under the "Nintendo Switch Games" category.
 */
export async function ensureSwitch2Imported(): Promise<void> {
  const store = await getStore();
  const settings = (store.settings ?? {}) as Record<string, any>;
  if (settings["switchUnifiedVersion"] === IMPORT_VERSION) return;

  await updateStore((current) => {
    const categories = (current.categories ?? []).filter(
      (c) => (c as any).id !== "nintendo-switch-2",
    );

    if (!categories.some((c) => (c as any).id === GAMES_CATEGORY_ID)) {
      categories.push({
        id: GAMES_CATEGORY_ID,
        title: "Nintendo Switch Games",
        isActive: true,
        order: 1,
      });
    }

    const products = [...(current.products ?? [])];

    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      if (!p) continue;

      const isSwitch =
        p["platform"] === "switch1" ||
        p["platform"] === "switch2" ||
        p.categoryId === "nintendo-switch-2" ||
        p.categoryId === GAMES_CATEGORY_ID;

      if (isSwitch) {
        products[i] = {
          ...p,
          categoryId: GAMES_CATEGORY_ID,
          category: GAMES_CATEGORY_ID,
          isActive: true,
          kind: "account",
          description:
            p.description ||
            `نظرة عامة على ${p.title}: تفاصيل اللعبة والقصة والمميزات مبنية على المصادر الرسمية المتوفرة حالياً.`,
          options: p["options"] || [{ name: "Account Offline", price: 0 }],
          variants: p["variants"] || [{ name: "Base Package", price: 0 }],
          sources: p["sources"] || ["Nintendo Official", "GameFAQs"],
        } as Product;
      }
    }

    return {
      ...current,
      categories,
      settings: {
        ...(current.settings ?? {}),
        switchUnifiedVersion: IMPORT_VERSION,
      },
      products,
    } as StoreDoc;
  });
}
