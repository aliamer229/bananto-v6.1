import { getStore } from "../src/lib/db.server";

async function listAll() {
  const store = await getStore();
  const products = store.products || [];
  console.log(`Total: ${products.length}`);
  products.forEach((p, i) => {
    console.log(`[${i}] valid=${typeof p?.id === "string" && typeof p?.title === "string" && typeof p?.slug === "string"} | id=${p?.id} | title=${p?.title} | slug=${p?.slug}`);
  });
}
listAll();
