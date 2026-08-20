import fs from "fs";
import { parseGameImport } from "./src/lib/gameImportParser.ts";

const content = fs.readFileSync("cyberpunk_template.txt", "utf8");
const result = parseGameImport(content);
console.log(Object.keys(result.data));
