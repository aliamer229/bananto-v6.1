import { parseProductImport } from "./src/lib/productImport/parser";
import { HARDWARE_SCHEMA } from "./src/lib/productImport/hardwareSchema";

const text = "name=PlayStation 5\nprice=500";
const res = parseProductImport(text, HARDWARE_SCHEMA);
console.log(JSON.stringify(res, null, 2));
