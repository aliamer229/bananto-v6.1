import { getStore, updateStore } from "./db.server";
import type { StoreDoc } from "./types";
import { v4 as uuidv4 } from "uuid";
import { generateSeedBundles } from "./bundles";

/**
 * Versioned import to ensure database state is correct.
 * Increment version to force a re-import and cleanup.
 */
const IMPORT_VERSION = "v28-restore-nintendo-category";
const GAMES_CATEGORY_ID = "nintendo-switch-games";

const SWITCH2_GAMES: any[] = [];

/**
 * Resets the database and imports the initial Switch 2 catalog.
 */
export async function forceFullImport(): Promise<void> {
  // Quick check in-memory to avoid D1 read for already imported workers
  const store = await getStore();
  const settings = (store.settings ?? {}) as Record<string, any>;

  if (settings["importVersion"] === IMPORT_VERSION) {
    return;
  }

  console.log("Starting forced full import for Switch 2. Version:", IMPORT_VERSION);

  await updateStore((current) => {
    // 1. Keep essential categories and ensure they exist
    const categories = (current.categories ?? [])
      .map((c: any) => {
        if (
          c.id === "nintendo-switch-games" &&
          (c.title?.includes("الأكثر مبيع") || c.title?.includes("Best Sellers"))
        ) {
          return { ...c, title: "Nintendo Switch Games" };
        }
        return c;
      })
      .filter((c) =>
        [
          "nintendo-switch-games",
          "hardware",
          "amiibo",
          "accessories",
          "gift-cards",
          "used",
        ].includes((c as any).id),
      );

    const defaultCats = [
      { id: "nintendo-switch-games", title: "Nintendo Switch Games", order: 1 },
      { id: "hardware", title: "أجهزة الهاردوير وملحقاتها", order: 2 },
      { id: "amiibo", title: "مجسمات amiibo", order: 3 },
      { id: "accessories", title: "الإكسسوارات", order: 4 },
      { id: "gift-cards", title: "كروت التعبئة Nintendo Gift Cards", order: 5 },
      { id: "used", title: "القطع والألعاب المستخدمة", order: 6 },
    ];

    for (const cat of defaultCats) {
      if (!categories.some((c: any) => c.id === cat.id)) {
        categories.push({ ...cat, isActive: true });
      }
    }

    // 3. Map new Switch 2 products
    const newProducts = SWITCH2_GAMES.map((game, index) => ({
      id: uuidv4(),
      title: game.title,
      slug: game.slug,
      categoryId: GAMES_CATEGORY_ID,
      price: 0, // Admin handles pricing
      cost: 0, // Admin handles cost
      stock: 0, // Admin handles stock
      status: "نشط",
      displayOrder: index + 1,
      platform: game.platform,
      description: game.description,
      descriptionEn: (game as any).descriptionEn,
      coverImage: game.coverImage,
      cartridgeImage: (game as any).cartridgeImage || game.coverImage,
      banner: (game as any).banner,
      gallery: (game as any).gallery,
      youtubeTrailer: game.youtubeTrailer,
      trailerUrl: game.youtubeTrailer,
      size: game.size,
      releaseDate: game.releaseDate,
      publisher: game.publisher,
      developer: game.developer,
      series: game.series,
      genre: (game as any).genre,
      languages: (game as any).languages,
      players: (game as any).players,
      ageRating: (game as any).ageRating,
      metacriticScore: (game as any).metacriticScore,
      features: (game as any).features,
      options: (game as any).options,
      types: (game as any).types,
      isInfiniteStock: true,
    }));

    // 4. Return new state. We don't overwrite products anymore if we already have some,
    // to avoid wiping Splatoon Raiders or other extracted games.
    const products = current.products?.length > 0 ? current.products : newProducts;
    const bundles =
      Array.isArray(current.bundles) && current.bundles.length > 0
        ? current.bundles
        : generateSeedBundles(products);

    return {
      ...current,
      categories,
      products,
      bundles,

      settings: {
        ...(current.settings ?? {}),
        importVersion: IMPORT_VERSION,
      },
    } as StoreDoc;
  });
}
