import { parseProductImport } from "./src/lib/productImport/parser";
import { HARDWARE_SCHEMA } from "./src/lib/productImport/hardwareSchema";

const text = "name<<EOF\nbad data";
const res = parseProductImport(text, HARDWARE_SCHEMA);
console.log("Success");
