import { importGameDataToDb } from "./src/lib/gameData/mapper";
import { parseGameData } from "./src/lib/gameData/parser";
import { validateGameData } from "./src/lib/gameData/validator";

const input = `[IMPORT]
schema_version = 1

[GAME]
name = The Legend of Zelda
platform = Nintendo Switch
release_status = RELEASED`;

async function main() {
  const parsed = parseGameData(input);
  const validated = validateGameData(parsed.data);
  try {
      console.log(validated.data.GAME);
      await importGameDataToDb(validated.data, "create");
      console.log("Success");
  } catch (e) {
      console.error(e);
  }
}
main();
