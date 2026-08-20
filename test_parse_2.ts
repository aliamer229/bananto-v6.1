import { parseGameData } from "./src/lib/gameData/parser";
import { validateGameData } from "./src/lib/gameData/validator";

const input = `[IMPORT]
schema_version = 1

[GAME]
name = The Legend of Zelda
platform = Nintendo Switch
release_status = RELEASED`;

const parsed = parseGameData(input);
const validated = validateGameData(parsed.data);
console.log("Validated:", validated.valid);
