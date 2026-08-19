import { getStore, updateStore } from "../src/lib/db.server";
import { SWITCH_GAMES } from "../src/lib/switch-games.data";
import type { StoreDoc, Product } from "../src/lib/types";

const GAMES_CATEGORY_ID = "nintendo-switch-games";

async function restore() {
  console.log("Restoring all games including old ones and Switch 2...");

  await updateStore((current) => {
    const products = [...(current.products ?? [])];
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

    // Restore from seed data
    for (const game of SWITCH_GAMES) {
      if (!products.some((p) => p.slug === game.slug)) {
        products.push({
          ...game,
          id: game.id || crypto.randomUUID(),
          kind: "account",
          categoryId: GAMES_CATEGORY_ID,
          category: GAMES_CATEGORY_ID,
          isActive: true,
          price: game.price || 0,
          stock: game.stock || 0,
          options: [{ name: "Account Offline", price: 0 }],
          variants: [{ name: "Base Package", price: 0 }],
          sources: ["Nintendo Official"],
        } as unknown as Product);
      }
    }

    // Ensure all existing Switch 2 games are in the correct category
    for (let i = 0; i < products.length; i++) {
      if (products[i].platform === "switch2") {
        products[i].categoryId = GAMES_CATEGORY_ID;
        products[i].category = GAMES_CATEGORY_ID;
      }
    }

    return { ...current, categories, products } as StoreDoc;
  });

  console.log("Restore complete.");
}

restore().catch(console.error);
