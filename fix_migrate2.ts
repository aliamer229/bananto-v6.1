import { readFileSync, writeFileSync } from 'fs';
let file = readFileSync('src/routes/api/admin/migrate-images.ts', 'utf8');

file = file.replace(
  \`  GET: async ({ request }) =>\`,
  \`  server: {
    handlers: {
      GET: async ({ request }) =>\`
);

file = file.replace(
  \`    }),
});\`,
  \`    })
    }
  }
});\`
);

writeFileSync('src/routes/api/admin/migrate-images.ts', file);
