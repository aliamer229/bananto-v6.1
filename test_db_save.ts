import { getStore, updateStore } from "./src/lib/db.server.ts";
import fs from "fs";
import { parseGameImport } from "./src/lib/gameImportParser.ts";

async function run() {
  console.log("Loading cyberpunk template...");
  const content = fs.readFileSync("cyberpunk_template.txt", "utf8");
  const res = parseGameImport(content);
  
  const formData = res.data;
  const selectedCategoryId = formData.category || "cat_nintendo";
  const cleanedData = {
    ...formData,
    id: "prd_test_" + Date.now(),
    category: selectedCategoryId,
    categoryId: selectedCategoryId,
    title: formData.titleEn || formData.title,
    titleEn: formData.titleEn || formData.title,
    description: formData.descriptionEn || formData.description || "",
    descriptionEn: formData.descriptionEn || formData.description || "",
    price: Number(formData.price) || 0,
    cost: Number(formData.cost) || 0,
    stock: formData.isInfiniteStock ? 999999 : Number(formData.stock) || 0,
    displayOrder: Number(formData.displayOrder) || 0,
    image: formData.coverImage || formData.cartridgeImage || formData.image || "",
    banner: formData.bannerImages?.[0] || formData.banner || "",
    schemaId: "",
    kind: formData.kind || "account",
  };
  
  if (formData.rawData) {
    Object.assign(cleanedData, formData.rawData);
    delete cleanedData.rawData;
  }

  console.log("Attempting to save to DB...");
  try {
    const nextStore = await updateStore((store) => {
      return {
        ...store,
        products: [cleanedData, ...(store.products || [])]
      }
    });
    console.log("SUCCESS. New product count:", nextStore.products.length);
  } catch (err) {
    console.error("DB SAVE ERROR:", err);
  }
}
run();
