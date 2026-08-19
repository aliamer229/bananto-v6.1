/**
 * Writes the blank import templates into public/templates/ so the admin panel
 * can serve them as static downloads. Run with: bun scripts/generate-product-templates.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { countSchemaFields, generateTemplate } from "../src/lib/productImport/generator";
import { PRODUCT_SCHEMAS } from "../src/lib/productImport/registry";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "templates");
mkdirSync(outDir, { recursive: true });

for (const schema of PRODUCT_SCHEMAS) {
  const body = generateTemplate(schema);
  writeFileSync(join(outDir, schema.templateFile), body, "utf8");
  console.log(
    `${schema.templateFile.padEnd(36)} ${countSchemaFields(schema)} fields, ${body.split("\n").length} lines`,
  );
}
