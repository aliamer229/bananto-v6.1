import { describe, expect, it } from "vitest";

import { parseGameImport } from "./gameImportParser";
import { BOOLEAN_ONLY_NOTE, generateGameImportTemplate } from "./gameImportGenerator";
import { GAME_IMPORT_SCHEMA, type FieldDef } from "./gameImportSchema";

const template = generateGameImportTemplate();
const lines = template.split("\n");
const NOTE = `# ${BOOLEAN_ONLY_NOTE}`;

/** The field a template line such as `device_performance.1.tv.hdr=` belongs to. */
function fieldForPath(path: string): FieldDef | undefined {
  const segments = path.split(".");
  const head = segments.shift();
  let field = GAME_IMPORT_SCHEMA.find((entry) => entry.key === head && entry.itemFields)
    ? GAME_IMPORT_SCHEMA.find((entry) => entry.key === head && entry.itemFields)
    : GAME_IMPORT_SCHEMA.find((entry) => entry.key === head);
  for (const segment of segments) {
    if (!field) return undefined;
    if (/^\d+$/.test(segment)) continue;
    field = field.itemFields?.[segment];
  }
  return field;
}

/** Every `key=` / `key<<EOF` line, with the line number it sits on. */
const valueLines = lines
  .map((text, index) => ({ text, index }))
  .filter(({ text }) => /^[a-z0-9_.]+(=|<<EOF)/i.test(text))
  .map(({ text, index }) => ({ index, path: text.split(/=|<</)[0]!.trim() }));

describe("the BOOLEAN ONLY note sits only above boolean fields", () => {
  it("is followed by a boolean field every single time", () => {
    const notes = lines.map((text, index) => ({ text, index })).filter(({ text }) => text === NOTE);
    expect(notes.length).toBeGreaterThan(0);

    for (const note of notes) {
      const next = valueLines.find((line) => line.index > note.index);
      expect(next, `note on line ${note.index + 1} has no field under it`).toBeDefined();
      const field = fieldForPath(next!.path);
      expect(field, `unknown field ${next!.path}`).toBeDefined();
      expect(field!.type, `${next!.path} is annotated BOOLEAN ONLY but is ${field!.type}`).toBe(
        "boolean",
      );
    }
  });

  it("never annotates the text fields of a device performance record", () => {
    for (const key of [
      "device",
      "device_slug",
      "device_model",
      "hardware_id",
      "information_status",
    ]) {
      for (const index of [1, 2, 3]) {
        const line = lines.indexOf(`device_performance.${index}.${key}=`);
        expect(line, `device_performance.${index}.${key} missing`).toBeGreaterThan(-1);
        expect(lines[line - 1]).not.toBe(NOTE);
      }
    }
  });

  it("never annotates a resolution, an fps, a mode or a notes field", () => {
    for (const key of [
      "resolution",
      "resolution_dynamic",
      "rendering_resolution",
      "output_resolution",
      "fps",
      "fps_min",
      "fps_max",
      "refresh_rate",
      "mode",
    ]) {
      for (const section of ["handheld", "tv"]) {
        const line = lines.indexOf(`device_performance.1.${section}.${key}=`);
        expect(line, `${section}.${key} missing`).toBeGreaterThan(-1);
        expect(lines[line - 1], `${section}.${key} was annotated as boolean`).not.toBe(NOTE);
      }
    }
    for (const key of ["ray_tracing_mode", "upscaling", "loading_time"]) {
      const line = lines.indexOf(`device_performance.1.${key}=`);
      expect(line).toBeGreaterThan(-1);
      expect(lines[line - 1], `${key} was annotated as boolean`).not.toBe(NOTE);
    }
  });

  it("annotates supported, hdr and vrr on every device index and both screens", () => {
    /*
      Covered by a note means: walking upwards from the field, every value line
      passed is itself boolean and the run is headed by the note. `vrr` sits
      directly under `hdr`, and one note covers both.
    */
    const annotated = (path: string) => {
      const line = lines.indexOf(`${path}=`);
      expect(line, `${path} missing from the template`).toBeGreaterThan(-1);
      for (let cursor = line - 1; cursor >= 0; cursor--) {
        const text = lines[cursor]!;
        if (text === NOTE) return true;
        if (!/^[a-z0-9_.]+(=|<<EOF)/i.test(text)) continue;
        const field = fieldForPath(text.split(/=|<</)[0]!.trim());
        if (field?.type !== "boolean") return false;
      }
      return false;
    };

    for (const index of [1, 2, 3]) {
      for (const section of ["handheld", "tv"]) {
        expect(annotated(`device_performance.${index}.${section}.supported`)).toBe(true);
        expect(annotated(`device_performance.${index}.${section}.hdr`)).toBe(true);
        expect(annotated(`device_performance.${index}.${section}.vrr`)).toBe(true);
      }
      for (const mode of [1, 2, 3]) {
        expect(annotated(`device_performance.${index}.mode.${mode}.hdr`)).toBe(true);
        expect(annotated(`device_performance.${index}.mode.${mode}.vrr`)).toBe(true);
      }
      expect(annotated(`device_performance.${index}.ray_tracing`)).toBe(true);
    }
  });

  it("annotates the four multiplayer flags once, and not the two player counts", () => {
    const noteLine = lines.findIndex(
      (text, index) => text === NOTE && lines[index + 2] === "multiplayer_cooperative=",
    );
    expect(noteLine).toBeGreaterThan(-1);
    // The player counts above it are text and carry no boolean note.
    expect(lines[lines.indexOf("multiplayer_local=") - 1]).not.toBe(NOTE);
    expect(lines[lines.indexOf("multiplayer_online=") - 1]).not.toBe(NOTE);
  });

  it("states the rule once at the top, including the three look-alike text fields", () => {
    expect(template).toContain("# BOOLEAN RULE:");
    expect(template).toContain("#   blank if unknown");
    expect(template).toContain("# Never write: Not Published / Unknown / N/A / Yes / No");
    expect(template).toContain("resolution_dynamic");
    expect(template).toContain("multiplayer_local       local player count");
  });
});

describe("validation sample from the request", () => {
  const SAMPLE = `
schema_version=1
name=Boolean Annotation Sample
platform=switch2

device_performance.1.device=Nintendo Switch 2
device_performance.1.handheld.supported=true
device_performance.1.handheld.resolution_dynamic=true
device_performance.1.handheld.output_resolution=1920x1080
device_performance.1.handheld.fps=60
device_performance.1.handheld.hdr=
device_performance.1.handheld.vrr=false

device_performance.1.tv.supported=true
device_performance.1.tv.resolution_dynamic=true
device_performance.1.tv.output_resolution=3840x2160
device_performance.1.tv.fps=60
device_performance.1.tv.hdr=false
device_performance.1.tv.vrr=

device_performance.1.ray_tracing=

multiplayer_local=true
multiplayer_online=true
multiplayer_cooperative=true
multiplayer_competitive=false
multiplayer_split_screen=true
multiplayer_local_wireless=false
`;

  const result = parseGameImport(SAMPLE);

  it("imports with no boolean validation error at all", () => {
    expect(result.errors.filter((issue) => issue.severity === "error")).toEqual([]);
    expect(result.errors.some((issue) => /boolean/i.test(issue.message))).toBe(false);
    expect(result.unknownFields).toEqual([]);
  });

  it("reads true, false and blank on every boolean in the sample", () => {
    const device = (result.data["devicePerformance"] as Record<string, any>[])[0]!;
    expect(device["handheld"].supported).toBe(true);
    expect(device["handheld"].vrr).toBe(false);
    expect(device["handheld"].hdr).toBeUndefined();
    expect(device["tv"].supported).toBe(true);
    expect(device["tv"].hdr).toBe(false);
    expect(device["tv"].vrr).toBeUndefined();
    // Blank ray tracing simply is not recorded.
    expect(device["rayTracing"]).toBeUndefined();

    expect(result.data["mpCoop"]).toBe(true);
    expect(result.data["mpCompetitive"]).toBe(false);
    expect(result.data["mpSplitScreen"]).toBe(true);
    expect(result.data["mpLocalWireless"]).toBe(false);
  });

  it("never coerces a string field into a boolean", () => {
    const device = (result.data["devicePerformance"] as Record<string, any>[])[0]!;
    expect(device["device"]).toBe("Nintendo Switch 2");
    expect(device["handheld"].outputResolution).toBe("1920x1080");
    expect(device["handheld"].fps).toBe("60");
    // resolution_dynamic and the player counts are text; "true" stays the text
    // "true" rather than becoming a boolean.
    expect(device["handheld"].resolutionDynamic).toBe("true");
    expect(result.data["mpLocalPlayers"]).toBe("true");
    expect(typeof result.data["mpLocalPlayers"]).toBe("string");
  });
});
