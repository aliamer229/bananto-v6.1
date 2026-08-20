import fs from "fs";
import { parseGameImport } from "./src/lib/gameImportParser.ts";

const content = fs.readFileSync("cyberpunk_template.txt", "utf8");
const result = parseGameImport(content);
try {
  JSON.stringify(result.data);
  console.log("No circular reference in parseGameImport output.");
} catch (err) {
  console.error("Circular reference detected in parseGameImport output:", err);
}
