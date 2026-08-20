import { importGameDataToDb } from "./src/lib/gameData/mapper";
import { parseGameImport } from "./src/lib/gameData/parser";
import { validateGameData } from "./src/lib/gameData/validator";

const input = `
[GAME]
name = The Legend of Zelda: Tears of the Kingdom
platform = Nintendo Switch
`;

async function main() {
  try {
    const parsed = parseGameImport(input);
    const valid = validateGameData(parsed.data);
    await importGameDataToDb(valid.data, "create");
    console.log("Success");
  } catch (e) {
    console.error("Failed:", e);
  }
}
main();
