const fs = require("fs");
let code = fs.readFileSync("src/lib/d1.server.ts", "utf-8");

const newTables = `  \`CREATE INDEX IF NOT EXISTS game_images_game_idx ON game_images (game_id, kind)\`,
  \`CREATE TABLE IF NOT EXISTS game_variants (
    id TEXT PRIMARY KEY, game_id TEXT NOT NULL, variant_type TEXT NOT NULL, name TEXT NOT NULL,
    price_usd REAL, features TEXT, created_at TEXT NOT NULL)\`,
  \`CREATE INDEX IF NOT EXISTS game_variants_game_idx ON game_variants (game_id)\`,
  \`CREATE TABLE IF NOT EXISTS game_import_logs (
    id TEXT PRIMARY KEY, game_id TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL)\`,
  \`CREATE INDEX IF NOT EXISTS game_import_logs_game_idx ON game_import_logs (game_id)\`,`;

code = code.replace(
  "  `CREATE INDEX IF NOT EXISTS game_images_game_idx ON game_images (game_id, kind)`,",
  newTables,
);

fs.writeFileSync("src/lib/d1.server.ts", code);
