import { d1All } from "../src/lib/d1.server";

async function checkD1Tables() {
  const ids = await d1All(`SELECT * FROM product_identity`);
  console.log("product_identity count:", ids.length);
  ids.forEach(row => console.log(`- id=${row.product_id}, title=${row.canonical_title}, plat=${row.platform}`));

  const games = await d1All(`SELECT * FROM game_metadata`);
  console.log("game_metadata count:", games.length);
}
checkD1Tables();
