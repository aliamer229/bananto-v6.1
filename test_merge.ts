import { parseGameImport } from "./src/lib/gameImportParser.ts";
import fs from "fs";

const content = fs.readFileSync("cyberpunk_template.txt", "utf8");
const result = parseGameImport(content);

const prev = { id: "test", categoryId: "cat_nintendo", titleEn: "" };
const importedData = result.data;

const newData = { ...prev };
Object.entries(importedData).forEach(([key, value]) => {
  if (value !== undefined && value !== null && value !== "") {
    newData[key] = value;
  }
});

console.log("Title En:", newData.titleEn);
console.log("Title:", newData.title);
console.log("Description:", newData.description);
console.log("Description En:", newData.descriptionEn);
console.log("Price:", newData.price);
console.log("Types:", newData.types?.length);
