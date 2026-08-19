import { getStore, updateStore } from "../src/lib/db.server";
import { SWITCH_GAMES } from "../src/lib/switch-games.data";
import type { StoreDoc, Product } from "../src/lib/types";

const GAMES_CATEGORY_ID = "nintendo-switch-games";

async function forceRestore() {
  if (process.env.ALLOW_DESTRUCTIVE_OPERATION !== "YES_I_UNDERSTAND") {
    console.error("❌ Error: ALLOW_DESTRUCTIVE_OPERATION=YES_I_UNDERSTAND is required.");
    process.exit(1);
  }
  console.log("Forcing restore of all games from seed data and keeping Switch 2 games...");

  await updateStore((current) => {
    let products = [...(current.products ?? [])];
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

    // Add all from seed if missing
    for (const game of SWITCH_GAMES) {
      const exists = products.some((p) => p.slug === game.slug || p.title === game.title);
      if (!exists) {
        products.push({
          ...game,
          id: game.id || crypto.randomUUID(),
          kind: "account",
          categoryId: GAMES_CATEGORY_ID,
          category: GAMES_CATEGORY_ID,
          isActive: true,
          options: [{ name: "Account Offline", price: 0 }],
          variants: [{ name: "Base Package", price: 0 }],
          sources: ["Nintendo Official"],
        } as unknown as Product);
      }
    }

    // Re-verify category for all Switch products
    products = products.map((p) => {
      if (
        p.platform === "switch1" ||
        p.platform === "switch2" ||
        p.categoryId === "nintendo-switch-2"
      ) {
        return { ...p, categoryId: GAMES_CATEGORY_ID, category: GAMES_CATEGORY_ID };
      }
      return p;
    });

    return { ...current, categories, products } as StoreDoc;
  });

  console.log("Force restore complete.");
}

forceRestore().catch(console.error);
