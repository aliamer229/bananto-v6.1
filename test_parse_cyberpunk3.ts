import fs from "fs";
import { parseGameImport } from "./src/lib/gameImportParser.ts";
import { safeStringify } from "./src/utils/safeJson.ts";

const content = fs.readFileSync("cyberpunk_template.txt", "utf8");
const res = parseGameImport(content);

const formData = res.data;
const selectedCategoryId = formData.category || "cat_nintendo";
const cleanedData = {
      ...formData,
      id: "prd_123",
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

const stringified = safeStringify(cleanedData);

// now call the endpoint locally to see if it fails
import fetch from "node-fetch";

async function run() {
  const req = await fetch("http://localhost:3000/api/admin/products", {
    method: "POST",
    headers: { "Content-Type": "application/json", "cookie": "adminToken=YOUR_TOKEN_HERE" }, // Wait we get 403 without token
    body: stringified
  });
  console.log(req.status, await req.text());
}
run();
