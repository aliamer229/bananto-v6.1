import { HARDWARE_SCHEMA } from "../src/lib/productImport/hardwareSchema";
import { generateTemplate } from "../src/lib/productImport/generator";
import { parseProductImport } from "../src/lib/productImport/parser";
const tpl = generateTemplate(HARDWARE_SCHEMA);
console.log("has hardware_model in generated:", tpl.includes("hardware_model="));
const sample = `product_name=Switch OLED
hardware_model=HEG-001
color_edition=White
screen_specs=7 inch OLED
battery_life=4.5-9h
warranty_condition=New sealed
box_contents_text=Console, Dock, Joy-Con
ports_connectivity=USB-C, HDMI
`;
const r = parseProductImport(sample, HARDWARE_SCHEMA);
console.log(JSON.stringify(r.data, null, 1).slice(0, 1500));
console.log(r.errors.filter(e=>e.severity==="error").slice(0,5));
