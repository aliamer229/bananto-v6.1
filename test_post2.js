import fs from "fs";
import { safeStringify } from "./src/utils/safeJson.ts";

const productData = {
  title: "Cyberpunk 2077",
  titleEn: "Cyberpunk 2077",
  price: 50,
  categoryId: "cat_nintendo"
};

// Instead of HTTP, let's just see if safeStringify is breaking
console.log(safeStringify(productData));
