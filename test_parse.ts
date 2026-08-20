import { parseGameImport } from "./src/lib/gameImportParser";
import { validateGameData } from "./src/lib/gameData/validator";

const input = `name = The Legend of Zelda: Tears of the Kingdom\nplatform = Nintendo Switch`;
const parsedImport = parseGameImport(input);
const parsed = { data: parsedImport.data, errors: parsedImport.errors.map((e) => e.message) };
const validated = validateGameData(parsed.data);
console.log(JSON.stringify(validated, null, 2));
