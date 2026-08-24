import { getStore } from "../src/lib/db.server";

async function inspectCategories() {
  const store = await getStore();
  console.log("Categories:", JSON.stringify(store.categories, null, 2));
}

inspectCategories().catch(console.error);
