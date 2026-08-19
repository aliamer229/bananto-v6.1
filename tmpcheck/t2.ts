import { HARDWARE_SCHEMA } from "../src/lib/productImport/hardwareSchema";
import { parseProductImport } from "../src/lib/productImport/parser";
const r = parseProductImport(`box_contents_text=Console, Dock, Joy-Con
hardware_model=HEG-001
storage_capacity=64 GB
`, HARDWARE_SCHEMA);
console.log(r.data);
