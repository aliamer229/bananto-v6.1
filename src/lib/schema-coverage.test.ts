import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Every column the application writes must exist somewhere in the schema.
 *
 * Several features were dead in production because they wrote to columns no
 * CREATE TABLE or migration ever added: disc trade submission, the trade payout
 * credit batch, the banana market buyer link, the legacy claim lock, and the
 * verified-buyer lookup behind product reviews. D1 raised "no such column" and
 * the surrounding helpers swallowed it, so nothing surfaced until the feature
 * was used.
 *
 * This walks the same sources the database is built from and cross-checks every
 * INSERT column list and UPDATE assignment in the codebase against them.
 */

const ROOT = join(import.meta.dirname, "..", "..");
const IDENT = /^[a-z_][a-z0-9_]*$/;
const NON_COLUMN = new Set(["primary", "foreign", "unique", "check", "constraint"]);

function walk(dir: string, match: RegExp, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules") walk(full, match, out);
    } else if (match.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Split a CREATE TABLE body on top-level commas. */
function columnNames(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of body) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts
    .map((part) => part.trim().split(/\s+/)[0]?.replace(/[`"]/g, "") ?? "")
    .filter((name) => IDENT.test(name) && !NON_COLUMN.has(name));
}

function buildSchema(): Map<string, Set<string>> {
  const schema = new Map<string, Set<string>>();
  const sources = [
    ...walk(join(ROOT, "migrations"), /\.sql$/),
    ...walk(join(ROOT, "src"), /\.ts$/),
  ];

  for (const file of sources) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(
      /CREATE TABLE (?:IF NOT EXISTS )?[`"]?(\w+)[`"]?\s*\(([\s\S]*?)\)\s*(?:;|`)/g,
    )) {
      const table = schema.get(match[1]!) ?? new Set<string>();
      for (const column of columnNames(match[2]!)) table.add(column);
      schema.set(match[1]!, table);
    }
    for (const match of text.matchAll(/ALTER TABLE [`"]?(\w+)[`"]?\s+ADD COLUMN [`"]?(\w+)/g)) {
      const table = schema.get(match[1]!) ?? new Set<string>();
      table.add(match[2]!);
      schema.set(match[1]!, table);
    }
  }
  return schema;
}

describe("SQL column coverage", () => {
  const schema = buildSchema();
  const files = walk(join(ROOT, "src"), /\.ts$/).filter((f) => !f.endsWith(".test.ts"));

  it("knows about the core tables", () => {
    expect(schema.get("orders")).toContain("doc");
    expect(schema.get("users")).toContain("wallet_balance");
    expect(schema.get("disc_trades")).toContain("payout_credited");
  });

  it("every INSERT writes only columns that exist", () => {
    const missing: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(/INSERT (?:OR \w+ )?INTO\s+(\w+)\s*\(([^)]*)\)/g)) {
        const columns = schema.get(match[1]!);
        if (!columns) continue;
        for (const raw of match[2]!.split(",")) {
          const column = raw.trim().replace(/[`"]/g, "");
          if (!IDENT.test(column) || columns.has(column)) continue;
          missing.push(`${file.slice(ROOT.length + 1)}: INSERT INTO ${match[1]}.${column}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("every UPDATE assigns only columns that exist", () => {
    const missing: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(/UPDATE\s+(\w+)\s+SET\s+([\s\S]*?)(?:WHERE|`)/g)) {
        const columns = schema.get(match[1]!);
        if (!columns) continue;
        for (const found of match[2]!.matchAll(/(?:^|,)\s*([a-z_][a-z0-9_]*)\s*=/g)) {
          const column = found[1]!;
          if (columns.has(column)) continue;
          missing.push(`${file.slice(ROOT.length + 1)}: UPDATE ${match[1]}.${column}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("every single-table WHERE filters only on columns that exist", () => {
    const reserved = new Set([
      "and",
      "or",
      "not",
      "where",
      "null",
      "changes",
      "case",
      "when",
      "then",
      "else",
      "end",
      "datetime",
      "date",
      "count",
      "coalesce",
      "upper",
      "lower",
      "cast",
      "max",
      "min",
      "sum",
      "select",
    ]);
    const missing: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(
        /(SELECT\s+[\s\S]*?\s+FROM\s+(\w+)\s+WHERE\s+([\s\S]*?))(?:LIMIT|ORDER BY|GROUP BY|`|\)\s*;)/g,
      )) {
        if (/\bJOIN\b/i.test(match[1]!)) continue;
        const columns = schema.get(match[2]!);
        if (!columns) continue;
        for (const found of match[3]!.matchAll(
          /\b([a-z_][a-z0-9_]{2,})\s*(?:=|>=|<=|<|>|LIKE|IS|IN)\s/gi,
        )) {
          const column = found[1]!.toLowerCase();
          if (reserved.has(column) || columns.has(column)) continue;
          missing.push(`${file.slice(ROOT.length + 1)}: SELECT FROM ${match[2]} WHERE ${column}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
