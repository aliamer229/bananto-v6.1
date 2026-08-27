/**
 * Database / Catalogue Migration Script
 *
 * Iterates through all products and updates option / type / edition descriptions
 * to strict standardized Arabic definitions:
 * - "حساب مشترك" (Offline Account)
 * - "حساب خاص بك" (Online Account)
 * - "اللعبة الأساسية" (Base / Standard Game)
 * - "اللعبة مع الإضافات" (Deluxe / DLC / Ultimate)
 *
 * Any internal/supplier notes are cleanly segregated to `internalImportNote` and never shown to buyers.
 */

import { getStore, updateStore } from "../src/lib/db.server";
import { normalizeProductOption, normalizeProductType } from "../src/lib/productOptionDescriptions";

export async function runMigration() {
  console.log("[migration] Starting product option descriptions migration...");
  const store = await getStore();
  const products = store.products || [];
  console.log(`[migration] Found ${products.length} products to check.`);

  let updatedProducts = 0;
  let totalOptionsCleaned = 0;
  let totalTypesCleaned = 0;

  const newProducts = products.map((p) => {
    let changed = false;

    const newOptions = (p.options || []).map((o) => {
      const norm = normalizeProductOption(o);
      if (norm.description !== o.description || norm.internalImportNote !== o.internalImportNote) {
        changed = true;
        totalOptionsCleaned++;
      }
      return norm;
    });

    const newTypes = (p.types || []).map((t) => {
      const norm = normalizeProductType(t);
      if (norm.description !== t.description || norm.internalImportNote !== t.internalImportNote) {
        changed = true;
        totalTypesCleaned++;
      }
      return norm;
    });

    const newEditions = (p.editions || []).map((e) => {
      const norm = normalizeProductType(e);
      if (norm.description !== e.description || norm.internalImportNote !== e.internalImportNote) {
        changed = true;
        totalTypesCleaned++;
      }
      return norm;
    });

    if (changed) {
      updatedProducts++;
      return {
        ...p,
        options: newOptions,
        types: newTypes,
        editions: newEditions,
      };
    }
    return p;
  });

  if (updatedProducts > 0) {
    console.log(`[migration] Writing changes: ${updatedProducts} products modified (${totalOptionsCleaned} options, ${totalTypesCleaned} types/editions).`);
    await updateStore({ products: newProducts });
    console.log("[migration] Successfully persisted updated products to database!");
  } else {
    console.log("[migration] All products already meet strict standardization rules. No updates needed.");
  }

  return {
    totalProducts: products.length,
    updatedProducts,
    totalOptionsCleaned,
    totalTypesCleaned,
  };
}

if (require.main === module || (typeof process !== "undefined" && process.argv[1]?.includes("migrateProductOptionDescriptions"))) {
  runMigration()
    .then((res) => {
      console.log("[migration] Done!", res);
      process.exit(0);
    })
    .catch((err) => {
      console.error("[migration] Error during migration:", err);
      process.exit(1);
    });
}
