import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ACCESSORY_SCHEMA } from "./accessorySchema";
import { AMIIBO_SCHEMA } from "./amiiboSchema";
import { countSchemaFields, generateTemplate } from "./generator";
import { HARDWARE_SCHEMA } from "./hardwareSchema";
import { mergeImportedProduct } from "./merge";
import { parseProductImport } from "./parser";
import { PRODUCT_SCHEMAS, detectSchemaId } from "./registry";
import type { ImportIssue } from "./types";

const templateDir = join(process.cwd(), "public", "templates");

function errorsOf(result: { errors: ImportIssue[] }): ImportIssue[] {
  return result.errors.filter((e) => e.severity === "error");
}

describe("product import templates", () => {
  it("meets the information-coverage targets for each section", () => {
    expect(countSchemaFields(HARDWARE_SCHEMA)).toBeGreaterThanOrEqual(120);
    expect(countSchemaFields(AMIIBO_SCHEMA)).toBeGreaterThanOrEqual(70);
    expect(countSchemaFields(ACCESSORY_SCHEMA)).toBeGreaterThanOrEqual(90);
  });

  // A duplicate top-level key silently shadows the earlier definition in the
  // parser's lookup map, which turns a working field into a confusing error.
  it("has no duplicate keys or targets within a schema", () => {
    for (const schema of PRODUCT_SCHEMAS) {
      const keys = schema.fields.map((f) => f.key);
      const dupeKeys = keys.filter((k, i) => keys.indexOf(k) !== i);
      expect(dupeKeys, `${schema.id} duplicate keys`).toEqual([]);

      const targets = schema.fields.map((f) => f.target);
      const dupeTargets = targets.filter((t, i) => targets.indexOf(t) !== i);
      expect(dupeTargets, `${schema.id} duplicate targets`).toEqual([]);
    }
  });

  it("ships a checked-in template that matches the live schema", () => {
    for (const schema of PRODUCT_SCHEMAS) {
      const onDisk = readFileSync(join(templateDir, schema.templateFile), "utf8");
      expect(onDisk, schema.templateFile).toBe(generateTemplate(schema));
    }
  });

  it("parses a blank template without errors, since every field is optional", () => {
    for (const schema of PRODUCT_SCHEMAS) {
      const blank = generateTemplate(schema);
      const result = parseProductImport(blank, schema);
      // `name` (and accessory_type) are the only required fields, so a blank
      // template reports exactly those and nothing else.
      const keys = errorsOf(result)
        .map((e) => e.key)
        .sort();
      const expected = schema.fields
        .filter((f) => f.required && f.key !== "schema_version")
        .map((f) => f.key)
        .sort();
      expect(keys, schema.id).toEqual(expected);
      expect(result.unknownFields, schema.id).toEqual([]);
    }
  });
});

describe("hardware import", () => {
  const file = `
schema_version=1
name=Nintendo Switch 2 Dock
brand=Nintendo
model_number=HAC-007
release_date=2025-06-05
warranty=سنة واحدة
bluetooth=true
bluetooth_version=5.3
power_consumption=39
product_weight=327
description_full<<EOF
قاعدة رسمية بمنفذ HDMI 2.1.
تدعم الإخراج بدقة 4K.
EOF

feature.1=إخراج 4K عبر HDMI 2.1
feature.2=منفذ إيثرنت مدمج
feature.3=منفذان USB

port.1.type=HDMI
port.1.version=2.1
port.1.count=1
port.2.type=USB-A
port.2.count=2

spec_group.1.name=Connectivity
spec_group.1.key=connectivity
spec_group.1.spec.1.key=hdmi
spec_group.1.spec.1.value=2.1
spec_group.1.spec.2.key=ethernet
spec_group.1.spec.2.value=1 Gbps
spec_group.2.name=Power
spec_group.2.key=power
spec_group.2.spec.1.key=power_consumption
spec_group.2.spec.1.value=39
spec_group.2.spec.1.unit=W

compatibility.1.name=Nintendo Switch 2
compatibility.1.status=compatible
compatibility.2.name=Nintendo Switch
compatibility.2.status=partial
compatibility.2.notes=يعمل للشحن فقط

gallery.1.image=https://example.com/dock-front.jpg
gallery.1.title=المنظر الأمامي
video.1.title=طريقة التركيب
video.1.url=https://youtube.com/watch?v=abc
video.1.type=setup

source.1.name=Nintendo
source.1.url=https://www.nintendo.com/
source.1.type=manufacturer
`;

  const result = parseProductImport(file, HARDWARE_SCHEMA);

  it("imports cleanly", () => {
    expect(errorsOf(result)).toEqual([]);
    expect(result.unknownFields).toEqual([]);
  });

  it("coerces scalars to their declared types", () => {
    expect(result.data["title"]).toBe("Nintendo Switch 2 Dock");
    expect(result.data["warranty"]).toBe("سنة واحدة");
    expect(result.data["bluetooth"]).toBe(true);
    expect(result.data["releaseDate"]).toBe("2025-06-05");
    expect(result.data["description"]).toContain("قاعدة رسمية");
  });

  it("builds unbounded repeatable arrays", () => {
    expect(result.data["features"]).toEqual([
      "إخراج 4K عبر HDMI 2.1",
      "منفذ إيثرنت مدمج",
      "منفذان USB",
    ]);
    expect(result.data["ports"]).toHaveLength(2);
  });

  it("builds nested dynamic specification groups", () => {
    const groups = result.data["specGroups"] as {
      key: string;
      specs: { key: string; value: string }[];
    }[];
    expect(groups).toHaveLength(2);
    expect(groups[0]?.specs).toHaveLength(2);
    expect(groups[0]?.specs?.[1]).toMatchObject({ key: "ethernet", value: "1 Gbps" });
    expect(groups[1]?.specs?.[0]).toMatchObject({ key: "power_consumption", unit: "W" });
  });

  it("reports accurate preview stats", () => {
    expect(result.stats.specGroups).toBe(2);
    expect(result.stats.specs).toBe(3);
    expect(result.stats.compatibility).toBe(2);
    expect(result.stats.videos).toBe(1);
    expect(result.stats.sources).toBe(1);
  });
});

describe("validation", () => {
  const bad = `
schema_version=1
name=Test Device
power_consumption=abc
release_date=2025-13-99
official_url=not-a-url
bluetooth=maybe
review_score=42
totally_made_up_field=1
availability_status=teleporting
`;
  const result = parseProductImport(bad, HARDWARE_SCHEMA);
  const messages = Object.fromEntries(result.errors.map((e) => [e.key, e]));

  it("rejects malformed numbers, dates, URLs and booleans", () => {
    expect(messages["power_consumption"]?.severity).toBe("error");
    expect(messages["release_date"]?.severity).toBe("error");
    expect(messages["official_url"]?.severity).toBe("error");
    expect(messages["bluetooth"]?.severity).toBe("error");
  });

  it("enforces numeric ranges", () => {
    expect(messages["review_score"]?.severity).toBe("error");
  });

  it("warns rather than fails on unknown enum values", () => {
    expect(messages["availability_status"]?.severity).toBe("warning");
    expect(result.data["availabilityStatus"]).toBe("teleporting");
  });

  it("collects unknown fields as warnings, not failures", () => {
    expect(result.unknownFields).toContain("totally_made_up_field");
  });

  it("fails when a required field is missing", () => {
    const missing = parseProductImport("schema_version=1\nbrand=Nintendo", HARDWARE_SCHEMA);
    expect(errorsOf(missing).map((e) => e.key)).toContain("name");
  });

  it("rejects a schema version newer than the code supports", () => {
    const future = parseProductImport("schema_version=99\nname=X", HARDWARE_SCHEMA);
    expect(errorsOf(future).map((e) => e.key)).toContain("schema_version");
  });

  it("flags an unterminated EOF block", () => {
    const open = parseProductImport(
      "schema_version=1\nname=X\ndescription_full<<EOF\nhello",
      HARDWARE_SCHEMA,
    );
    expect(errorsOf(open).map((e) => e.key)).toContain("description_full");
  });
});

describe("accessory conditional specifications", () => {
  it("warns when a field does not belong to the declared accessory type", () => {
    const file = `
schema_version=1
name=USB-C Cable 2m
accessory_type=cable
connector_a=USB-C
connector_b=USB-C
hall_effect=true
`;
    const result = parseProductImport(file, ACCESSORY_SCHEMA);
    expect(errorsOf(result)).toEqual([]);
    const warning = result.errors.find((e) => e.key === "hall_effect");
    expect(warning?.severity).toBe("warning");
    // Still imported — the admin stays in control of their own data.
    expect(result.data["hallEffect"]).toBe(true);
  });

  it("requires the accessory type", () => {
    const result = parseProductImport("schema_version=1\nname=Mystery Thing", ACCESSORY_SCHEMA);
    expect(errorsOf(result).map((e) => e.key)).toContain("accessory_type");
  });
});

describe("amiibo game compatibility", () => {
  it("captures what the figure does inside each game", () => {
    const file = `
schema_version=1
name=amiibo — Link (Tears of the Kingdom)
character=Link
franchise=The Legend of Zelda
figure_type=amiibo
rarity=common
game_compatibility.1.game=The Legend of Zelda: Tears of the Kingdom
game_compatibility.1.platform=Nintendo Switch
game_compatibility.1.function=استدعاء مواد ومعدات
game_compatibility.1.reward=قماش الطائرة الشراعية
game_compatibility.2.game=Super Smash Bros. Ultimate
game_compatibility.2.function=رفيق قابل للتدريب
material.1=PVC
material.2=ABS
`;
    const result = parseProductImport(file, AMIIBO_SCHEMA);
    expect(errorsOf(result)).toEqual([]);
    const compat = result.data["gameCompatibility"] as { game: string; reward?: string }[];
    expect(compat).toHaveLength(2);
    expect(compat[0]?.reward).toBe("قماش الطائرة الشراعية");
    expect(result.data["materials"]).toEqual(["PVC", "ABS"]);
  });
});

describe("re-import merge strategy", () => {
  const existing = { title: "Old name", brand: "Old brand", warrantyNotes: "ضمان سنة" };

  it("keeps fields the file does not mention", () => {
    const result = parseProductImport(
      "schema_version=1\nname=New name\nbrand=Nintendo",
      HARDWARE_SCHEMA,
    );
    const { product, summary } = mergeImportedProduct(existing, result);
    expect(product["title"]).toBe("New name");
    expect(product["brand"]).toBe("Nintendo");
    expect(product["warrantyNotes"]).toBe("ضمان سنة");
    expect(summary.kept).toContain("warrantyNotes");
    expect(summary.updated).toContain("brand");
  });

  it("does not clear a value just because the template line is blank", () => {
    const result = parseProductImport(
      "schema_version=1\nname=New name\nwarranty_notes=",
      HARDWARE_SCHEMA,
    );
    const { product } = mergeImportedProduct(existing, result);
    expect(product["warrantyNotes"]).toBe("ضمان سنة");
  });

  it("clears a value when an empty block is explicitly opened", () => {
    const result = parseProductImport(
      "schema_version=1\nname=New name\nwarranty_notes<<EOF\nEOF",
      HARDWARE_SCHEMA,
    );
    const { product, summary } = mergeImportedProduct(existing, result);
    expect(product["warrantyNotes"]).toBeUndefined();
    expect(summary.cleared).toContain("warrantyNotes");
  });
});

describe("schema detection", () => {
  it("resolves stored products back to their schema", () => {
    expect(detectSchemaId({ schemaId: "amiibo" })).toBe("amiibo");
    expect(detectSchemaId({ category: "cat_hardware" })).toBe("hardware");
    expect(detectSchemaId({ kind: "accessory" })).toBe("accessory");
    expect(detectSchemaId({ category: "cat_nintendo", kind: "account" })).toBeUndefined();
  });
});
