import { mergeImportedProduct } from "./src/lib/productImport/merge";
import { parseProductImport } from "./src/lib/productImport/parser";
import { getProductSchema } from "./src/lib/productImport/registry";

const schema = getProductSchema("hardware");
const input = `name = Test`;
const parsed = parseProductImport(input, schema);
const result = mergeImportedProduct({}, parsed);
console.log(result);
