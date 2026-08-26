import { readFileSync, writeFileSync } from 'fs';
let file = readFileSync('src/routes/api/admin/migrate-images.ts', 'utf8');

file = file.replace(
  `import { createFileRoute } from "@tanstack/react-router";`,
  `import { createAPIFileRoute } from "@tanstack/react-start/api";`
);

file = file.replace(
  `export const Route = createFileRoute("/api/admin/migrate-images")({`,
  `export const APIRoute = createAPIFileRoute("/api/admin/migrate-images")({`
);

file = file.replace(
  `server: { handlers: { GET: async ({ request }) =>`,
  `GET: async ({ request }) =>`
);

file = file.replace(
  `}) } } });`,
  `}) });`
);

writeFileSync('src/routes/api/admin/migrate-images.ts', file);
