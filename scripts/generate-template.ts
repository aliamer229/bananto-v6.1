import { generateGameImportTemplate } from "../src/lib/gameImportGenerator";
import fs from "fs";
import path from "path";

const template = generateGameImportTemplate();
const dir = path.join(process.cwd(), "public", "templates");
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}
fs.writeFileSync(path.join(dir, "nintendo-switch-game-template.txt"), template);
console.log("Template generated successfully.");
