import { PRODUCT_SCHEMAS } from "./productImport/registry";

interface StoreCategory {
  id: string;
  title: string;
  description?: string;
  image?: string;
  displayOrder?: number;
  /** Links the category to an import schema so the admin gets the right template. */
  schemaId?: string;
}

const SECTION_META: Record<string, { description: string; image: string }> = {
  cat_hardware: {
    description: "أجهزة وملحقات بمواصفات كاملة وتوافق موثّق",
    image: "https://images.unsplash.com/photo-1587202372775-e229f172b9d7?w=800&q=80",
  },
  cat_amiibo: {
    description: "amiibo والمجسمات مع تفاصيل الشخصية والتوافق مع الألعاب",
    image: "https://images.unsplash.com/photo-1591370874773-6702e8f12fd8?w=800&q=80",
  },
  cat_accessories: {
    description: "إكسسوارات بكل المواصفات والتوافق حسب النوع",
    image: "https://images.unsplash.com/photo-1600861195091-690c92f1d2cc?w=800&q=80",
  },
};

/**
 * Creates the storefront sections the app expects on first run, and only the
 * missing ones — an existing category keeps whatever title, image and ordering
 * the admin already gave it. Runs once at app start (see `src/routes/__root.tsx`).
 */
export const ensureNintendoCategory = async () => {
  try {
    const res = await fetch("/api/data");
    if (!res.ok) return;
    const { categories } = (await res.json()) as { categories?: StoreCategory[] };
    const existing = Array.isArray(categories) ? categories : [];
    const have = new Set(existing.map((c) => c.id));

    const missing: StoreCategory[] = [];

    if (!have.has("cat_nintendo") && !have.has("nintendo_games") && !have.has("nintendo-switch-games")) {
      missing.push({
        id: "cat_nintendo",
        title: "Nintendo Switch games",
        description: "ألعاب نينتندو سويتش 1 و 2 مع كافة التفاصيل والبحث العميق",
        image: "https://images.unsplash.com/photo-1578303512597-81e6cc155b3e?w=800&q=80",
        displayOrder: -1, // Always first
      });
    }

    for (const [index, schema] of PRODUCT_SCHEMAS.entries()) {
      if (have.has(schema.categoryId)) continue;
      const meta = SECTION_META[schema.categoryId];
      missing.push({
        id: schema.categoryId,
        title: schema.label,
        description: meta?.description ?? "",
        image: meta?.image ?? "",
        displayOrder: index,
        schemaId: schema.id,
      });
    }

    if (missing.length === 0) return;

    await fetch("/api/data", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categories: [...missing, ...existing] }),
    });
  } catch (err) {
    console.error("Failed to ensure store categories", err);
  }
};
