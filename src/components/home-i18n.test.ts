/**
 * The storefront's copy, and what it does when the catalogue will not load.
 *
 * Both were visible on the same screenshot: `common.viewAll` rendered as a raw
 * dotted path next to an untranslated "Latest Nintendo releases", under section
 * headings with nothing beneath them.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { translate } from "@/lib/i18n";

const HOME = readFileSync(resolve(process.cwd(), "src/components/HomeView.tsx"), "utf8");

describe("dotted keys reach the keyed translator", () => {
  it("does not take `t` from the legacy source-string store", () => {
    /*
      `useI18n().t` looks copy up by its *Arabic source string* — `if (lang ===
      "ar") return key`. Handed "common.viewAll" it returns "common.viewAll",
      which is what shoppers saw.
    */
    expect(HOME).not.toMatch(/const\s*\{\s*t\s*\}\s*=\s*useI18n\(\)/);
    expect(HOME).toContain("useTranslation()");
  });

  it("no longer needs the key-equals-value workaround", () => {
    // `t(k) === k ? "…" : t(k)` was the symptom of the wrong translator, and it
    // hard-coded Arabic and English strings into the component.
    expect(HOME).not.toMatch(/t\("[a-z][\w.]*"\)\s*===\s*"[a-z][\w.]*"/);
  });

  it("resolves every dotted key the homepage renders", () => {
    const keys = [...HOME.matchAll(/\bt\(\s*"([a-z][a-zA-Z0-9_]*\.[a-zA-Z0-9_.]+)"/g)].map(
      (m) => m[1]!,
    );
    expect(keys.length).toBeGreaterThan(0);
    for (const locale of ["ar", "en", "tr"] as const) {
      for (const key of keys) {
        // A key that does not resolve comes back as itself.
        expect(translate(locale, key), `${key} in ${locale}`).not.toBe(key);
      }
    }
  });
});

describe("a catalogue that will not load says so", () => {
  it("renders an error with a retry rather than empty sections", () => {
    // `isError` used to be destructured and never used, so a failed request and
    // an empty store looked identical: headings over nothing.
    expect(HOME).toMatch(/isError\s*&&\s*!hasProducts/);
    expect(HOME).toContain("refetch()");
  });

  it("keeps the shell above it rendering", () => {
    // The error sits between the services and the product rows; the banner and
    // the header are not inside its branch.
    const errorAt = HOME.indexOf("isError && !hasProducts");
    const heroAt = HOME.indexOf("{/* Hero Banner Section */}");
    expect(errorAt).toBeGreaterThan(-1);
    expect(heroAt).toBeGreaterThan(errorAt);
  });
});
