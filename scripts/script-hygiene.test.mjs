import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A `const` used above the line that defines it.
 *
 * `node --check` does not catch this — the file parses, and the crash only
 * arrives at runtime as "Cannot access 'x' before initialization". That is
 * exactly how a merge script that writes to production got as far as being
 * dispatched with `--apply` before failing. These scripts are run against real
 * data from a workflow, so the cheapest place to catch it is here.
 */

/**
 * Comments, string bodies and regex literals, blanked.
 *
 * Prose about a helper is not a use of it, and neither is a name that happens
 * to appear inside a pattern — `/(banan\.to|r2\.dev)/` is not a reference to a
 * const called `r2`, which an earlier version of this test insisted it was.
 */
const strip = (source) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => " ".repeat(m.length))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m) => " ".repeat(m.length))
    .replace(/`(?:[^`\\]|\\.)*`/g, (m) => " ".repeat(m.length))
    .replace(/"(?:[^"\\]|\\.)*"/g, (m) => " ".repeat(m.length))
    .replace(/'(?:[^'\\]|\\.)*'/g, (m) => " ".repeat(m.length))
    .replace(/(^|[=(,:[!&|?{;+\s])\/(?![/*])(?:[^/\\\n[]|\\.|\[(?:[^\]\\]|\\.)*\])+\/[gimsuy]*/g, (m) =>
      " ".repeat(m.length),
    );

/*
  Only module-level lines are compared.

  A name used inside a function body may be that function's own parameter or
  local, and telling those apart needs real scope analysis rather than a
  regular expression — the first version of this test called every such
  shadowed name a hazard. Module-level statements in these scripts start at
  column zero, and it is only the module level that runs top to bottom, so that
  is where a const used above its definition actually throws.
*/
function hazards(source) {
  const src = strip(source);
  const lines = src.split("\n");
  const offsets = [];
  let at = 0;
  for (const line of lines) {
    offsets.push(at);
    at += line.length + 1;
  }
  const topLevel = (index) => {
    let lo = 0;
    let hi = offsets.length - 1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (offsets[mid] <= index) lo = mid;
      else hi = mid - 1;
    }
    return !/^\s/.test(lines[lo] ?? "");
  };

  const declared = [
    ...source.matchAll(/^(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=/gm),
  ].map((m) => m[1]);
  const found = [];
  for (const name of [...new Set(declared)]) {
    const def = src.search(new RegExp(`^(?:const|let)\\s+${name}\\s*=`, "m"));
    if (def < 0) continue;
    /*
      Only calls count.

      `.find(` is a method, and a bare name at module level is as likely to be a
      function parameter on a `function f(raw)` line as a reference to the
      const. Calling a not-yet-initialised const is the shape that actually
      threw here — `await step(...)` above `const step = ...` — and it is
      unambiguous, so that is what this looks for.
    */
    const uses = [...src.matchAll(new RegExp(`(^|[^.\\w$])${name}\\s*\\(`, "g"))]
      .map((m) => m.index)
      .filter((i) => i < def && topLevel(i));
    if (uses.length) {
      found.push({
        name,
        useLine: source.slice(0, uses[0]).split("\n").length,
        defLine: source.slice(0, def).split("\n").length,
      });
    }
  }
  return found;
}

const dir = path.resolve("scripts");
const files = readdirSync(dir).filter((f) => f.endsWith(".mjs") && !f.endsWith(".test.mjs"));

describe("scripts have no temporal dead zone hazards", () => {
  it("finds the pattern it exists to catch", () => {
    const broken = `const out = await step("x", work);\nconst step = async (l, w) => w();\n`;
    expect(hazards(broken).map((h) => h.name)).toEqual(["step"]);
  });

  it("does not mistake a method call for a reference", () => {
    const fine = `const flag = (n) => process.argv.find((a) => a === n);\nconst find = (k) => k;\n`;
    expect(hazards(fine)).toEqual([]);
  });

  it("does not mistake a name inside a regex literal for a reference", () => {
    const fine = `const HOST = /(^|\\.)(banan\\.to|r2\\.dev)$/i;\nconst r2 = make();\n`;
    expect(hazards(fine)).toEqual([]);
  });

  it("does not mistake a function parameter for a reference", () => {
    const fine = `function parse(raw) {\n  return raw;\n}\nconst raw = read();\n`;
    expect(hazards(fine)).toEqual([]);
  });

  it("does not mistake prose in a comment for a reference", () => {
    const fine = `/* The step helper times each query. */\nconst step = 1;\n`;
    expect(hazards(fine)).toEqual([]);
  });

  it.each(files)("%s", (file) => {
    const found = hazards(readFileSync(path.join(dir, file), "utf8"));
    expect(
      found.map((h) => `${h.name}: used line ${h.useLine}, defined line ${h.defLine}`),
    ).toEqual([]);
  });
});
