import { getStore } from "../src/lib/db.server";
import { d1All } from "../src/lib/d1.server";

async function inspectAllCurrentProducts() {
  const store = await getStore();
  const products = store.products || [];
  console.log(`Total products in store: ${products.length}`);
  products.forEach((p, idx) => {
    console.log(`[${idx}] id=${p.id}, title=${p.title}, slug=${p.slug}, price=${p.price}, platform=${p.platform}, keys=${Object.keys(p).join(",")}`);
  });
}

inspectAllCurrentProducts();
