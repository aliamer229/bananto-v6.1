import { describe, expect, it } from "vitest";

import {
  candidateKeys,
  galleryFrom,
  identityMatch,
  metadataFrom,
  slugifyTitle,
} from "./lib/nintendo-store.mjs";

describe("slugifyTitle", () => {
  it("drops the trademark marks Nintendo leaves out of its own url keys", () => {
    expect(slugifyTitle("Pikmin™ 4")).toBe("pikmin-4");
    expect(slugifyTitle("The Legend of Zelda™: Tears of the Kingdom")).toBe(
      "the-legend-of-zelda-tears-of-the-kingdom",
    );
    expect(slugifyTitle("Bayonetta 3 — Trinity Masquerade")).toBe("bayonetta-3-trinity-masquerade");
  });
});

describe("candidateKeys", () => {
  it("prefers a url key the product already stores", () => {
    const keys = candidateKeys({
      title: "Pikmin 4",
      platform: "Nintendo Switch",
      nintendoEshopUrl: "https://www.nintendo.com/us/store/products/pikmin-4-switch/",
    });
    expect(keys[0]).toBe("pikmin-4-switch");
  });

  it("asks for the Switch 2 keys first when the product is a Switch 2 edition", () => {
    const keys = candidateKeys({
      title: "Metroid Prime 4: Beyond – Nintendo Switch 2 Edition",
      platform: "Nintendo Switch 2",
      slug: "metroid-prime-4-beyond-switch-2",
    });
    expect(keys[0]).toContain("switch-2");
    expect(keys).toContain("metroid-prime-4-beyond-nintendo-switch-2-edition-switch-2");
  });

  it("asks for the Switch 1 key first for a Switch 1 product", () => {
    const keys = candidateKeys({ title: "Pikmin 4", platform: "Nintendo Switch" });
    expect(keys[0]).toBe("pikmin-4-switch");
  });
});

describe("identityMatch", () => {
  const switch1 = { platform: { label: "Nintendo Switch" } };
  const switch2 = { platform: { label: "Nintendo Switch 2" } };

  it("accepts a page whose nsuid matches, whatever the titles say", () => {
    const verdict = identityMatch(
      { title: "Pikmin 4", nsuid: "70010000005308" },
      { ...switch1, name: "Pikmin™ 4 (Digital)", nsuid: "70010000005308" },
    );
    expect(verdict.ok).toBe(true);
    expect(verdict.confidence).toBe("nsuid");
  });

  it("refuses a page whose nsuid is a different game", () => {
    const verdict = identityMatch(
      { title: "Pikmin 4", nsuid: "70010000005308" },
      { ...switch1, name: "Pikmin™ 4", nsuid: "70010000005302" },
    );
    expect(verdict.ok).toBe(false);
  });

  it("accepts a title match once the platform generation agrees", () => {
    expect(identityMatch({ title: "Pikmin 4", platform: "Nintendo Switch" }, { ...switch1, name: "Pikmin™ 4" }).ok).toBe(
      true,
    );
  });

  it("keeps the Switch 2 edition off the Switch 1 page", () => {
    const verdict = identityMatch(
      { title: "Metroid Prime 4: Beyond – Nintendo Switch 2 Edition", platform: "Nintendo Switch 2" },
      { ...switch1, name: "Metroid Prime™ 4: Beyond" },
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toMatch(/platform generation/);
  });

  it("matches the Switch 2 edition against its own page", () => {
    const verdict = identityMatch(
      { title: "Metroid Prime 4: Beyond – Nintendo Switch 2 Edition", platform: "Nintendo Switch 2" },
      { ...switch2, name: "Metroid Prime™ 4: Beyond – Nintendo Switch™ 2 Edition" },
    );
    expect(verdict.ok).toBe(true);
  });

  it("refuses a different game with a similar name", () => {
    expect(
      identityMatch({ title: "Pikmin 4", platform: "Nintendo Switch" }, { ...switch1, name: "Pikmin™ 3 Deluxe" }).ok,
    ).toBe(false);
  });
});

describe("galleryFrom", () => {
  const product = {
    productImage: { publicId: "store/software/switch/700100/cover" },
    productGallery: [
      { publicId: "/store/software/switch/700100/Video/trailer", resourceType: "video" },
      { publicId: "store/software/switch/700100/cover", resourceType: "image" },
      { publicId: "store/software/switch/700100/shot-a", resourceType: "image" },
      { publicId: "store/software/switch/700100/shot-a", resourceType: "image" },
      { publicId: "store/software/switch/700100/shot-b", resourceType: "image" },
    ],
  };

  it("returns screenshots only — no trailers, no box art, no repeats", () => {
    const shots = galleryFrom(product);
    expect(shots.map((s) => s.publicId)).toEqual([
      "store/software/switch/700100/shot-a",
      "store/software/switch/700100/shot-b",
    ]);
    expect(shots[0].url).toContain("https://assets.nintendo.com/image/upload/");
  });

  it("does not impose a count of its own", () => {
    const many = {
      productImage: {},
      productGallery: Array.from({ length: 14 }, (_, i) => ({
        publicId: `store/software/switch/700100/s${i}`,
        resourceType: "image",
      })),
    };
    expect(galleryFrom(many)).toHaveLength(14);
  });
});

describe("metadataFrom", () => {
  it("states only what the page states, and leaves the rest absent", () => {
    const md = metadataFrom({
      nsuid: "70010000005308",
      softwarePublisher: "Nintendo",
      softwareDeveloper: null,
      releaseDate: "2023-07-21T00:00:00.000Z",
      supportedLanguages: ["American English", "French"],
      numberOfPlayers: { system: { min: 1, max: 2 } },
      playModes: [{ code: "TV_MODE", label: "TV mode" }],
      nsoFeatures: [{ code: "SAVE_DATA_CLOUD" }],
      softwareDetails: { romSizes: [{ totalRomSize: "12086935552" }] },
      tags: { genres: [{ label: "Action" }] },
      contentRating: { label: "Everyone 10+" },
      downloadableContents: [],
    });

    expect(md.publisher).toBe("Nintendo");
    expect(md.releaseDate).toBe("2023-07-21");
    expect(md.numberOfPlayers).toBe("1-2");
    expect(md.downloadSizeGb).toBe(11.26);
    expect(md.size).toBe("11.26 GB");
    expect(md.ageRating).toBe("Everyone 10+");
    expect(md.genres).toEqual(["Action"]);
    expect(md.tvMode).toBe(true);
    expect(md.handheldMode).toBe(false);
    expect(md.nintendoCloudSaves).toBe(true);
    expect(md.arabicSupport).toBe(false);

    // Absent on the page means absent here — never an empty string or a guess.
    expect("developer" in md).toBe(false);
    expect("dlc" in md).toBe(false);
    expect("tagline" in md).toBe(false);
  });

  it("puts the Switch 2 compatibility caption in the Nintendo notes, not the device list", () => {
    const md = metadataFrom({
      compatibility: { status: "PLAYABLE", caption: "Supported – Game behavior is consistent with Nintendo Switch." },
    });
    expect(md.nintendoNotes).toMatch(/^Supported/);
    expect("compatibility" in md).toBe(false);
  });

  it("reports Arabic support when the page lists it", () => {
    const md = metadataFrom({ supportedLanguages: ["American English", "Arabic"] });
    expect(md.arabicSupport).toBe(true);
  });

  it("takes the download size for the console the product is sold on", () => {
    const romSizes = [
      { totalRomSize: "28292677632", platform: "HAC" },
      { totalRomSize: "29696720896", platform: "BEE" },
    ];
    const one = metadataFrom({ platform: { code: "NINTENDO_SWITCH" }, softwareDetails: { romSizes } });
    const two = metadataFrom({ platform: { code: "NINTENDO_SWITCH_2" }, softwareDetails: { romSizes } });
    expect(one.downloadSizeGb).toBe(26.35);
    expect(two.downloadSizeGb).toBe(27.66);
  });

  it("falls back to the one rom size a single-console title has", () => {
    const md = metadataFrom({
      platform: { code: "NINTENDO_SWITCH_2" },
      softwareDetails: { romSizes: [{ totalRomSize: "12086935552", platform: "HAC" }] },
    });
    expect(md.downloadSizeGb).toBe(11.26);
  });

  it("gives a single-player game a plain player count", () => {
    const md = metadataFrom({ numberOfPlayers: { system: { min: 1, max: 1 } } });
    expect(md.numberOfPlayers).toBe("1");
  });
});
