import { parseProductImport } from "./src/lib/productImport/parser.ts";
import { HARDWARE_SCHEMA } from "./src/lib/productImport/hardwareSchema.ts";
import fs from "fs";

const content = fs.readFileSync("cyberpunk_template.txt", "utf8");
const result = parseProductImport(content, HARDWARE_SCHEMA);

console.log("Valid:", result.valid);
console.log("Data:", result.data);
