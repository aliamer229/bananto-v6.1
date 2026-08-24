import { getStore } from "../src/lib/db.server";
import { d1All } from "../src/lib/d1.server";

async function auditStoreData() {
  console.log("Auditing current store data in D1...");
  const store = await getStore();
  
  console.log("Categories count:", store.categories?.length);
  for (let i = 0; i < (store.categories || []).length; i++) {
    const cat = store.categories[i];
    if (!cat || typeof cat !== "object") {
      console.error(`Corrupted category at index ${i}:`, cat);
    } else if (typeof cat.title !== "string" || !cat.title) {
      console.error(`Category with invalid title at index ${i}:`, cat);
    }
  }

  console.log("Banners count:", store.banners?.length);
  for (let i = 0; i < (store.banners || []).length; i++) {
    const b = store.banners[i];
    if (!b || typeof b !== "object") {
      console.error(`Corrupted banner at index ${i}:`, b);
    } else if (b.title !== undefined && typeof b.title !== "string") {
      console.error(`Banner with invalid title at index ${i}:`, b);
    }
  }

  console.log("Bundles count:", store.bundles?.length);
  for (let i = 0; i < (store.bundles || []).length; i++) {
    const b = store.bundles[i];
    if (!b || typeof b !== "object") {
      console.error(`Corrupted bundle at index ${i}:`, b);
    } else if (typeof b.title !== "string" || !b.title) {
      console.error(`Bundle with invalid title at index ${i}:`, b);
    }
  }

  console.log("Products count:", store.products?.length);
  let badProductsCount = 0;
  for (let i = 0; i < (store.products || []).length; i++) {
    const p = store.products[i];
    if (!p || typeof p !== "object") {
      console.error(`Corrupted product item (not an object) at index ${i}:`, p);
      badProductsCount++;
    } else {
      if (typeof p.id !== "string" || !p.id) {
        console.error(`Product with invalid ID at index ${i}:`, p);
        badProductsCount++;
      }
      if (typeof p.title !== "string" || !p.title) {
        console.error(`Product with invalid title at index ${i}:`, {
          id: p.id,
          title: p.title,
          type: typeof p.title,
          slug: p.slug
        });
        badProductsCount++;
      }
      if (typeof p.slug !== "string") {
        console.error(`Product with invalid slug at index ${i}:`, {
          id: p.id,
          slug: p.slug,
          type: typeof p.slug
        });
        badProductsCount++;
      }
    }
  }

  console.log("Total bad products found:", badProductsCount);
}

auditStoreData();
