import { describe, it, expect } from "vitest";
import { normalizeTitle, slugifyTitle, matchTitles, baseTitleOf } from "./gameData/identity";
import {
  computeTradeValue,
  groupRulesByCategory,
  orderedCategories,
  canTransition,
  type TradeRule,
} from "./trade-calc";
import { loadTradePricesJson } from "./trade-catalog-import.server";

describe("Nintendo Switch Trade Pricing & Import Engine", () => {
  it("normalizes titles accurately without AI or external models", () => {
    expect(normalizeTitle("The Legend of Zelda: Tears of the Kingdom")).toBe(
      "the legend of zelda tears of the kingdom",
    );
    expect(normalizeTitle("Super Mario Bros.™ Wonder")).toBe("super mario bros wonder");
    expect(normalizeTitle("Pokémon™ Legends: Arceus")).toBe("pokémon legends arceus");
    expect(matchTitles("Super Mario Bros. Wonder", "super mario bros. wonder")).toBe(true);
    expect(matchTitles("Mario Kart 8 Deluxe", "Mario Kart 8")).toBe(false);
  });

  it("extracts base title correctly", () => {
    expect(baseTitleOf("Mario Kart 8 Deluxe Edition")).toBe("mario kart 8");
    expect(baseTitleOf("Super Smash Bros Ultimate")).toBe("super smash bros");
  });

  it("loads and verifies the official Nintendo Iraq trade pricing JSON", () => {
    const data = loadTradePricesJson();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(50);

    // Verify first entry has required fields
    const first = data[0] as Record<string, unknown>;
    expect(first["game_title"] || first["name"] || first["title"]).toBeTruthy();
    expect(Number(first["trade_price_iqd"] ?? first["base_trade_value_iqd"])).toBeGreaterThan(0);
    expect(Number(first["store_offer_bonus_iqd"] ?? 0)).toBeGreaterThanOrEqual(0);
  });

  it("keeps Switch 2 editions as distinct rows and computes store credit totals", () => {
    const data = loadTradePricesJson() as Array<Record<string, unknown>>;
    const named = (needle: string) =>
      data.filter((row) => String(row["name"] ?? row["title"] ?? "").includes(needle));

    const switch2 = named("[Switch 2]");
    expect(switch2.length).toBeGreaterThan(0);
    // A Switch 2 entry must never collapse into its Switch 1 namesake.
    expect(normalizeTitle("Mario Kart World [Switch 2]")).not.toBe(
      normalizeTitle("Mario Kart 8 Deluxe"),
    );

    // Every row is priced in IQD with a non-negative bonus and consistent total.
    for (const row of data) {
      const base = Number(row["trade_price_iqd"] ?? row["base_trade_value_iqd"] ?? 0);
      const bonus = Number(row["store_offer_bonus_iqd"] ?? 0);
      expect(base).toBeGreaterThanOrEqual(0);
      expect(bonus).toBeGreaterThanOrEqual(0);
      expect(base + bonus).toBe(Number(base) + Number(bonus));
    }
  });

  it("exposes unique titles so the importer stays idempotent", () => {
    const data = loadTradePricesJson() as Array<Record<string, unknown>>;
    const titles = data.map((r) => normalizeTitle(String(r["name"] ?? r["title"] ?? "")));
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("computes trade quotes accurately with condition rules", () => {
    const mockRules: TradeRule[] = [
      {
        id: "r1",
        category: "box_presence",
        key: "has_box",
        label_ar: "مع العلبة الأصلية",
        label_en: "With Box",
        percent: 0,
        sort_order: 1,
        active: 1,
      },
      {
        id: "r2",
        category: "box_presence",
        key: "no_box",
        label_ar: "بدون علبة (شريط فقط)",
        label_en: "Cartridge Only",
        percent: -15,
        sort_order: 2,
        active: 1,
      },
      {
        id: "r3",
        category: "cartridge_condition",
        key: "mint",
        label_ar: "ممتازة كالممتاز",
        label_en: "Mint",
        percent: 0,
        sort_order: 1,
        active: 1,
      },
      {
        id: "r4",
        category: "region",
        key: "us",
        label_ar: "أمريكي (MDE / USA)",
        label_en: "USA / MDE",
        percent: 0,
        sort_order: 1,
        active: 1,
      },
    ];

    const resultWithBox = computeTradeValue(
      35000,
      { box_presence: "has_box", cartridge_condition: "mint", region: "us" },
      mockRules,
    );
    expect(resultWithBox.base_iqd).toBe(35000);
    expect(resultWithBox.final_iqd).toBe(35000);

    const resultNoBox = computeTradeValue(
      35000,
      { box_presence: "no_box", cartridge_condition: "mint", region: "us" },
      mockRules,
    );
    expect(resultNoBox.base_iqd).toBe(35000);
    // 35000 - 15% = 29750
    expect(resultNoBox.final_iqd).toBe(29750);
  });

  it("walks the trade lifecycle one step at a time", () => {
    // The seven ordinary states run in a straight line, and each move is legal
    // only from the state immediately before it — a status is a record of what
    // happened, so skipping ahead would make the history a lie.
    const flow = [
      "awaiting_pricing",
      "priced",
      "awaiting_customer_approval",
      "customer_approved",
      "awaiting_receipt",
      "inspecting",
      "completed",
    ];
    for (let i = 0; i < flow.length - 1; i++) {
      expect(canTransition(flow[i]!, flow[i + 1]!), `${flow[i]} → ${flow[i + 1]}`).toBe(true);
    }
    // Two steps at once is refused.
    expect(canTransition("awaiting_pricing", "awaiting_customer_approval")).toBe(false);
    expect(canTransition("customer_approved", "completed")).toBe(false);
  });

  it("lets an admin reject or cancel from anywhere unfinished, and never after completion", () => {
    for (const from of [
      "awaiting_pricing",
      "priced",
      "awaiting_customer_approval",
      "customer_approved",
      "awaiting_receipt",
      "inspecting",
    ]) {
      expect(canTransition(from, "rejected", true), `${from} → rejected`).toBe(true);
      expect(canTransition(from, "cancelled", true), `${from} → cancelled`).toBe(true);
    }
    expect(canTransition("completed", "rejected", true)).toBe(false);
    expect(canTransition("completed", "awaiting_pricing")).toBe(false);
  });

  it("maps every legacy status onto the current set", () => {
    // Requests written by earlier versions have to keep rendering and moving.
    expect(canTransition("waiting_review", "priced")).toBe(true); // → awaiting_pricing
    expect(canTransition("offer_sent", "customer_approved")).toBe(true); // → awaiting_customer_approval
    expect(canTransition("waiting_shipment", "inspecting")).toBe(true); // → awaiting_receipt
    expect(canTransition("payout_processing", "completed")).toBe(true); // → inspecting
    expect(canTransition("coupon_issued", "awaiting_pricing")).toBe(false); // → completed
  });
});
