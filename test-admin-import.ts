import { parseGameImport } from "./src/lib/gameImportParser";
import { parseGameData } from "./src/lib/gameData/parser";
import { validateGameData } from "./src/lib/gameData/validator";

const inputText = "name=PlayStation 5\nprice=500";
const parsedImport = parseGameImport(inputText);
const parsed = inputText.includes("[GAME]")
  ? parseGameData(inputText)
  : { data: parsedImport.data, errors: parsedImport.errors.map((e) => e.message) };

const validated = validateGameData(parsed.data);
console.log(JSON.stringify(validated, null, 2));
