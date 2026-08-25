const fs = require('fs');
let file = fs.readFileSync('src/routes/api/admin/knowledge-base.ts', 'utf8');

file = file.replace(/import \{ json, body, guard, requireAdmin \} from "@\/lib\/http\.server";/, `import { createFileRoute } from "@tanstack/react-router";\nimport { json, body, guard } from "@/lib/http.server";\nimport { requireAdmin } from "@/lib/session.server";`);
file = file.replace(/import type \{ ApiRoute \} from "@\/lib\/types";/, '');
file = file.replace(/export const route: ApiRoute = \{/, 'export const Route = createFileRoute("/api/admin/knowledge-base")({\n  server: {\n    handlers: {');
file = file.replace(/getStore, saveStore/g, 'getStore, updateStore');
file = file.replace(/await saveStore\(\{[\s\S]*?\}\);/, 'await updateStore((doc) => ({ ...doc, settings: { ...(doc.settings || {}), kbArticles: currentKb } }));');
file = file.replace(/}\);$/, '    }\n  }\n});');

fs.writeFileSync('src/routes/api/admin/knowledge-base.ts', file);
