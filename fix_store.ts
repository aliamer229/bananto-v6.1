import { readFileSync, writeFileSync } from 'fs';
let file = readFileSync('src/routes/api/admin/store.ts', 'utf8');

file = file.replace(
  `          const store = await getStore();
          return json(store);`,
  `          const store = await getStore();
          const { products, ...storeWithoutProducts } = store as any;
          return json(storeWithoutProducts);`
);

writeFileSync('src/routes/api/admin/store.ts', file);
