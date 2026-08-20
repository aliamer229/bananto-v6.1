import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Advanced product filter and sort for "View All" pages.
 * Specifically optimized for Nintendo Switch games and account products.
 */
export const getSortedProducts = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        products: z.array(z.any()),
        categoryId: z.string().optional(),
        sortBy: z.enum(["newest", "price_asc", "price_desc", "rating", "release_date"]).optional(),
        platform: z.enum(["all", "switch1", "switch2"]).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { products, categoryId, sortBy = "newest", platform = "all" } = data;

    let filtered = products.filter((p) => {
      // 1. Basic active/purchasable check
      if (p.status === "غير نشط" || p.isActive === false) return false;
      
      // 2. Category filter
      if (categoryId && categoryId !== "all") {
        const pCat = String(p.category || p.categoryId || "").toLowerCase();
        const targetCat = categoryId.toLowerCase();
        if (pCat !== targetCat && p.kind !== targetCat) return false;
      }

      // 3. Platform filter
      if (platform !== "all") {
        const pPlat = String(p.platform || "").toLowerCase();
        if (platform === "switch1") {
          // Both/Switch/Switch1 count as Switch 1
          if (pPlat !== "switch1" && pPlat !== "switch" && pPlat !== "both" && pPlat !== "") return false;
        } else if (platform === "switch2") {
          if (pPlat !== "switch2" && pPlat !== "both") return false;
        }
      }

      return true;
    });

    // 4. Sort logic
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "price_asc":
          return (Number(a.price) || 0) - (Number(b.price) || 0);
        case "price_desc":
          return (Number(b.price) || 0) - (Number(a.price) || 0);
        case "rating":
          return (Number(b.metacriticRating) || 0) - (Number(a.metacriticRating) || 0);
        case "release_date": {
          const dateA = new Date(a.releaseDate || a.release_date || 0).getTime();
          const dateB = new Date(b.releaseDate || b.release_date || 0).getTime();
          return dateB - dateA;
        }
        case "newest":
        default: {
          const timeA = new Date(a.createdAt || 0).getTime();
          const timeB = new Date(b.createdAt || 0).getTime();
          return timeB - timeA;
        }
      }
    });

    return filtered;
  });
