import { describe, expect, it } from "vitest";
import {
  ARABIC_WARNING,
  VERDICTS,
  classify,
  iCode,
  matchJp,
  platformOfHard,
} from "./lib/region-language.mjs";

describe("iCode", () => {
  it("takes the five characters Nintendo keys the catalogue by", () => {
    expect(iCode("HACPAAAAA")).toBe("AAAAA");
    expect(iCode("HACAAGAA")).toBe("AAGAA");
    expect(iCode("hacpa3jma")).toBe("A3JMA");
  });

  it("returns nothing rather than a guess when there is no code", () => {
    expect(iCode("")).toBe("");
    expect(iCode(undefined)).toBe("");
    expect(iCode("HAC")).toBe("");
  });
});

describe("platformOfHard", () => {
  it("reads Nintendo's own hardware tags", () => {
    expect(platformOfHard("1_HAC")).toBe("switch1");
    expect(platformOfHard("05_BEE")).toBe("switch2");
  });

  it("does not claim a Switch for a 3DS row", () => {
    expect(platformOfHard("2_CTR")).toBe(null);
  });
});

const row = (over) => ({
  icode: "AAAAA",
  title: "x",
  platform: "switch1",
  hard: "1_HAC",
  sform: "PKG_DL",
  nsuid: "1",
  maker: "Nintendo",
  releaseDate: "2017.3.3",
  status: "onsale",
  languages: ["ja", "en"],
  ...over,
});

describe("matchJp", () => {
  it("matches the one row for the code on this platform", () => {
    const got = matchJp([row({})], { code: "AAAAA", platform: "switch1" });
    expect(got.row?.nsuid).toBe("1");
  });

  it("never takes a row from the other console", () => {
    const got = matchJp([row({ platform: "switch2", hard: "05_BEE" })], {
      code: "AAAAA",
      platform: "switch1",
    });
    expect(got.row).toBe(null);
  });

  it("ignores add-on content, which states no language of its own", () => {
    const got = matchJp([row({ sform: "DL_DLC", languages: null })], {
      code: "AAAAA",
      platform: "switch1",
    });
    expect(got.row).toBe(null);
  });

  it("separates two games sharing a code by release year", () => {
    const rows = [
      row({ nsuid: "botw", releaseDate: "2017.3.3" }),
      row({ nsuid: "mkw", releaseDate: "2025.6.5" }),
    ];
    const got = matchJp(rows, { code: "AAAAA", platform: "switch1", releaseDate: "2017-03-03" });
    expect(got.row?.nsuid).toBe("botw");
  });

  it("refuses rather than picking one of two it cannot tell apart", () => {
    const rows = [row({ nsuid: "a" }), row({ nsuid: "b" })];
    const got = matchJp(rows, { code: "AAAAA", platform: "switch1", releaseDate: "" });
    expect(got.row).toBe(null);
    expect(got.reason).toMatch(/ambiguous/);
  });
});

describe("classify", () => {
  it("clears a game only when both regional SKUs carry English", () => {
    const got = classify({ jpLanguages: ["ja", "en"], hkLanguages: ["zh", "en"] });
    expect(got.verdict).toBe(VERDICTS.UNLOCKED);
    expect(ARABIC_WARNING[got.verdict]).toBe("");
  });

  it("locks a game neither region sells in English", () => {
    const got = classify({ jpLanguages: ["ja"], hkLanguages: ["zh", "ja"] });
    expect(got.verdict).toBe(VERDICTS.LOCKED);
    expect(ARABIC_WARNING[got.verdict]).toContain("لا تدعم");
  });

  it("calls out the Persona case, where the regions disagree", () => {
    const got = classify({ jpLanguages: ["ja"], hkLanguages: ["zh", "en"] });
    expect(got.verdict).toBe(VERDICTS.VARIANT);
    expect(got.why).toContain("Hong Kong");
  });

  it("does not let one region stand in for the other", () => {
    const got = classify({ jpLanguages: ["ja", "en"], hkLanguages: null });
    expect(got.verdict).toBe(VERDICTS.RESEARCH);
    expect(got.why).toContain("Hong Kong not established");
  });

  it("reports nothing known as nothing known", () => {
    expect(classify({ jpLanguages: null, hkLanguages: null }).verdict).toBe(VERDICTS.RESEARCH);
  });
});
