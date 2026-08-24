import { getStore } from "../src/lib/db.server";

async function inspectProducts() {
  const store = await getStore();
  const products = store.products || [];
  console.log(`Total products: ${products.length}`);
  for (const p of products) {
    console.log({
      id: p.id,
      title: p.title,
      category: p.category,
      categoryId: p.categoryId,
      kind: p.kind,
      schemaId: p.schemaId,
      platform: p.platform,
      hidden: p.hidden,
      status: p.status,
      isActive: p.isActive,
      visibility: (p as any).visibility,
    });
  }
}

inspectProducts().catch(console.error);
