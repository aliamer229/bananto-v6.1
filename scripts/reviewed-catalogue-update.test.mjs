import { describe, expect, it } from "vitest";

import {
  buildReviewedProduct,
  mergeOnlyRequestedMedia,
  verifyExpectedSnapshot,
} from "./lib/reviewed-catalogue-update.mjs";

const current = {
  id: "prd_1",
  title: "Old title",
  slug: "old-title-switch",
  platform: "switch1",
  price: 8500,
  cost: 1250,
  stock: 999,
  isHidden: true,
  category: "nintendo-switch-games",
  categoryId: "nintendo-switch-games",
  kind: "account",
  options: [{ id: "offline" }],
  types: [{ id: "offline_base" }],
  trade_enabled: true,
  trade_value_iqd: 8000,
  nintendoCardImage: "/api/admin-square.webp",
  coverImage: "/api/admin-cover.webp",
  galleryImages: [{ url: "/api/admin-shot.webp" }],
  amiiboSeries: "The Legend of Zelda",
};

const entry = {
  id: "prd_1",
  expected: {
    title: "Old title",
    slug: "old-title-switch",
    platform: "switch1",
    price: 8500,
    cost: 1250,
    isHidden: true,
    optionCount: 1,
    typeCount: 1,
  },
  official: { url: "https://www.nintendo.com/us/store/products/new-title-switch/" },
  patch: { title: "New title", slug: "new-title-switch" },
};

describe("reviewed catalogue update guard", () => {
  it("refuses production drift before making a document", () => {
    expect(verifyExpectedSnapshot({ ...current, price: 9000 }, entry.expected)).toContain(
      "price: expected 8500, found 9000",
    );
  });

  it("preserves every commercial field while clearing reviewed pollution", () => {
    const next = buildReviewedProduct({
      current,
      entry,
      metadata: {
        nsuid: "70010000000001",
        supportedLanguages: ["American English"],
        description: "Official description",
      },
      commonClearFields: ["amiiboSeries"],
      reviewedAt: "2026-09-01",
      updatedAt: "2026-09-01T00:00:00.000Z",
    });
    for (const field of [
      "price",
      "cost",
      "stock",
      "isHidden",
      "category",
      "categoryId",
      "kind",
      "options",
      "types",
      "trade_enabled",
      "trade_value_iqd",
    ]) {
      expect(next[field], field).toEqual(current[field]);
    }
    expect(next).not.toHaveProperty("amiiboSeries");
    expect(next.title).toBe("New title");
  });

  it("keeps verified admin media when only a missing role is requested", () => {
    const mediaPatch = mergeOnlyRequestedMedia(
      current,
      {
        cartridgeImage: "/api/new-front.webp",
        nintendoCardImage: "/api/replacement-square.webp",
        galleryImages: [{ url: "/api/replacement-shot.webp" }],
      },
      ["cartridgeImage"],
    );
    const next = { ...current, ...mediaPatch };
    expect(next.cartridgeImage).toBe("/api/new-front.webp");
    expect(next.nintendoCardImage).toBe("/api/admin-square.webp");
    expect(next.coverImage).toBe("/api/admin-cover.webp");
    expect(next.galleryImages).toEqual([{ url: "/api/admin-shot.webp" }]);
  });

  it("rejects any reviewed patch that tries to edit pricing", () => {
    expect(() =>
      buildReviewedProduct({
        current,
        entry: { ...entry, patch: { ...entry.patch, price: 1 } },
        metadata: {},
        reviewedAt: "2026-09-01",
        updatedAt: "2026-09-01T00:00:00.000Z",
      }),
    ).toThrow(/may not edit commercial fields: price/);
  });
});
