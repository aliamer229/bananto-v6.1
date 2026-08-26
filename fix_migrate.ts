import { readFileSync, writeFileSync } from 'fs';
let file = readFileSync('src/routes/api/admin/migrate-images.ts', 'utf8');

file = file.replace(
  `import { d1Run, d1Query } from "@/lib/d1.server";`,
  `import { d1Run, d1All } from "@/lib/d1.server";`
);

file = file.replace(
  `import { computeSha256 } from "@/lib/crypto.server";`,
  `async function computeSha256(bytes: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}`
);

file = file.replace(/d1Query/g, "d1All");

writeFileSync('src/routes/api/admin/migrate-images.ts', file);
