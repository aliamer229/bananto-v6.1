import fs from "fs";
import { parseGameImport } from "./src/lib/gameImportParser.ts";

const content = fs.readFileSync("cyberpunk_template.txt", "utf8");
const res = parseGameImport(content);
console.log(JSON.stringify(res, null, 2));
