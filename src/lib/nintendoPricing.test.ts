import { describe, expect, it } from "vitest";

import {
  CUSTOMER_LABELS,
  customerOptionName,
  customerTypeName,
  isExtrasRow,
  mapSupplierCosts,
  normalizeNintendoAccountPricing,
  priceGame,
  roundToStep,
} from "./nintendoPricing";

/** Super Smash Bros. Ultimate, exactly as the archive stores it. */
const SMASH = [
  {
    id: "regular_offline",
    name: "Regular / Offline",
    optionId: "offline_account",
    price: 1750,
    cost: 1750,
  },
  { id: "special", name: "Special", optionId: "offline_account", price: 3000, cost: 3000 },
  {
    id: "standard_online",
    name: "Standard / Online",
    optionId: "online_account",
    price: 25000,
    cost: 1750,
  },
  { id: "deluxe", name: "Deluxe", optionId: "online_account", price: 38000, cost: 3000 },
];

/** Mario Kart World, the two-row shape most templates use. */
const TWO_ROW = [
  { name: "Regular / Offline", optionId: "offline_account", price: 1500, cost: 1500 },
  { name: "Standard / Online", optionId: "online_account", price: 25000, cost: 1500 },
];

describe("isExtrasRow", () => {
  it("reads the account out of a name without calling it extra content", () => {
    expect(isExtrasRow("Regular / Offline")).toBe(false);
    expect(isExtrasRow("Standard / Online")).toBe(false);
    expect(isExtrasRow("Online Account")).toBe(false);
  });

  it("recognises the words the archive uses for extra content", () => {
    for (const name of [
      "Special",
      "Deluxe",
      "Complete",
      "Ultimate",
      "Offline — Special / Expansion Pass",
      "Bonus / Special Edition / Offline",
      "Deluxe Edition / Online",
    ]) {
      expect(isExtrasRow(name)).toBe(true);
    }
  });

  it("is not fooled by a price", () => {
    // FIFA's offline extras cost 6,000; Xenoblade's offline base costs 3,500.
    expect(isExtrasRow("Regular / Offline")).toBe(false);
  });
});

describe("mapSupplierCosts", () => {
  it("takes the online cost from the price field, not the copied cost field", () => {
    const costs = mapSupplierCosts(SMASH);
    expect(costs.offlineBase?.amount).toBe(1750);
    expect(costs.offlineExtras?.amount).toBe(3000);
    // The archive says cost=1750 on both online rows. That is the offline
    // number copied across; the real online figures are in `price`.
    expect(costs.onlineBase?.amount).toBe(25000);
    expect(costs.onlineExtras?.amount).toBe(38000);
    expect(costs.unmapped).toEqual([]);
  });

  it("records where each number came from", () => {
    const costs = mapSupplierCosts(SMASH);
    expect(costs.onlineBase?.source).toContain("price field");
    expect(costs.offlineBase?.source).toContain("cost field");
  });

  it("keeps a distinct corrected online cost instead of treating its selling price as cost", () => {
    const costs = mapSupplierCosts([
      { name: "Regular / Offline", optionId: "offline_account", price: 1_250, cost: 1_250 },
      {
        name: "Standard / Online",
        optionId: "online_account",
        price: 45_000,
        cost: 37_250,
        description: "Online supplier cost is stored separately",
      },
    ]);
    expect(costs.onlineBase?.amount).toBe(37_250);
    expect(costs.onlineBase?.source).toContain("cost field");
  });

  it("uses row order for base/extras when supplier edition names are misleading", () => {
    const costs = mapSupplierCosts([
      { name: "Regular", optionId: "offline_account", price: 1_750, cost: 1_750 },
      { name: "Deluxe", optionId: "offline_account", price: 6_000, cost: 6_000 },
      { name: "Complete", optionId: "online_account", price: 25_500, cost: 1_750 },
      { name: "Ultimate", optionId: "online_account", price: 37_250, cost: 6_000 },
    ]);
    expect(costs.onlineBase?.amount).toBe(25_500);
    expect(costs.onlineExtras?.amount).toBe(37_250);
    expect(costs.unmapped).toEqual([]);
  });

  it("leaves a tier undefined rather than borrowing from another", () => {
    const costs = mapSupplierCosts(TWO_ROW);
    expect(costs.offlineBase?.amount).toBe(1500);
    expect(costs.onlineBase?.amount).toBe(25000);
    expect(costs.offlineExtras).toBeUndefined();
    expect(costs.onlineExtras).toBeUndefined();
  });

  it("reports a row it cannot place instead of guessing a slot", () => {
    const costs = mapSupplierCosts([
      { name: "Mystery", optionId: "something_else", price: 100, cost: 100 },
    ]);
    expect(costs.unmapped).toHaveLength(1);
    expect(costs.offlineBase).toBeUndefined();
  });
});

describe("priceGame", () => {
  it("never lets a supplier cost reach the customer as a price", () => {
    const pricing = priceGame(mapSupplierCosts(SMASH), "switch1", "flagship");
    for (const tier of pricing.tiers) {
      expect(tier.price).not.toBe(tier.cost);
      expect(tier.margin).toBeGreaterThan(0);
    }
  });

  it("keeps the offline base inside its console band", () => {
    const one = priceGame(mapSupplierCosts(TWO_ROW), "switch1", "flagship");
    const two = priceGame(mapSupplierCosts(TWO_ROW), "switch2", "flagship");
    const base = (p: typeof one) =>
      p.tiers.find((t) => t.account === "offline" && t.content === "base")!.price;
    expect(base(one)).toBeLessThanOrEqual(15_000);
    expect(base(one)).toBeGreaterThanOrEqual(5_000);
    expect(base(two)).toBeLessThanOrEqual(20_000);
    expect(base(two)).toBeGreaterThan(base(one));
  });

  it("prices a flagship above a niche title on the same costs", () => {
    const flagship = priceGame(mapSupplierCosts(TWO_ROW), "switch1", "flagship");
    const niche = priceGame(mapSupplierCosts(TWO_ROW), "switch1", "niche");
    const base = (p: typeof flagship) => p.tiers.find((t) => t.account === "offline")!.price;
    expect(base(flagship)).toBeGreaterThan(base(niche));
  });

  it("prices online above its own acquisition cost, not inside the offline band", () => {
    const pricing = priceGame(mapSupplierCosts(SMASH), "switch1", "flagship");
    const online = pricing.tiers.find((t) => t.account === "online" && t.content === "base")!;
    expect(online.cost).toBe(25_000);
    expect(online.price).toBeGreaterThan(25_000);
    // An offline band would have priced this below cost, which is the bug.
    expect(online.price).toBeGreaterThan(15_000);
    expect(online.margin).toBeGreaterThanOrEqual(10_000);
  });

  it("prices extras above the base of the same account", () => {
    const pricing = priceGame(mapSupplierCosts(SMASH), "switch1", "flagship");
    const find = (account: string, content: string) =>
      pricing.tiers.find((t) => t.account === account && t.content === content)!;
    expect(find("offline", "extras").price).toBeGreaterThan(find("offline", "base").price);
    expect(find("online", "extras").price).toBeGreaterThan(find("online", "base").price);
  });

  it("moves the price further when the extra content cost more to acquire", () => {
    const cheap = priceGame(
      mapSupplierCosts([
        { name: "Regular / Offline", optionId: "offline_account", price: 1750, cost: 1750 },
        { name: "Special", optionId: "offline_account", price: 3000, cost: 3000 },
      ]),
      "switch1",
      "major",
    );
    const dear = priceGame(
      mapSupplierCosts([
        { name: "Regular / Offline", optionId: "offline_account", price: 1750, cost: 1750 },
        { name: "Special", optionId: "offline_account", price: 6000, cost: 6000 },
      ]),
      "switch1",
      "major",
    );
    const extras = (p: typeof cheap) => p.tiers.find((t) => t.content === "extras")!.price;
    expect(extras(dear)).toBeGreaterThan(extras(cheap));
  });

  it("reports a missing tier instead of inventing a cost for it", () => {
    const pricing = priceGame(mapSupplierCosts([TWO_ROW[0]!]), "switch1", "major");
    expect(pricing.needsReview.some((r) => r.includes("online base"))).toBe(true);
    expect(pricing.tiers.every((t) => t.account === "offline")).toBe(true);
  });

  it("gives the base product the offline base figures", () => {
    const pricing = priceGame(mapSupplierCosts(SMASH), "switch1", "flagship");
    expect(pricing.productCost).toBe(1750);
    expect(pricing.productPrice).toBe(
      pricing.tiers.find((t) => t.account === "offline" && t.content === "base")!.price,
    );
    expect(pricing.productPrice).not.toBe(pricing.productCost);
  });

  it("lands every price on a round 250", () => {
    for (const tier of priceGame(mapSupplierCosts(SMASH), "switch2", "standard").tiers) {
      expect(tier.price % 250).toBe(0);
    }
  });
});

describe("roundToStep", () => {
  it("rounds to the nearest step", () => {
    expect(roundToStep(12_340)).toBe(12_250);
    expect(roundToStep(12_400)).toBe(12_500);
  });
});

describe("customer labels", () => {
  it("uses the store's Arabic wording, never the supplier's", () => {
    expect(customerOptionName("offline")).toBe("حساب أوفلاين");
    expect(customerOptionName("online")).toBe("حساب أونلاين");
    expect(customerTypeName("offline", "base")).toBe("حساب أوفلاين — عادي");
    expect(customerTypeName("online", "extras")).toBe("حساب أونلاين — مع الإضافات");
  });

  it("carries no supplier or Chinese wording", () => {
    for (const label of Object.values(CUSTOMER_LABELS)) {
      expect(label).not.toMatch(/[A-Za-z一-鿿]/);
    }
  });
});

describe("normalizeNintendoAccountPricing", () => {
  it("migrates shared/private labels while preserving all four prices and costs", () => {
    const original = {
      options: [
        { id: "shared", name: "حساب مشترك" },
        { id: "private", name: "حساب خاص بك" },
      ],
      types: [
        {
          id: "s1",
          optionId: "shared",
          name: "مشترك — اللعبة الأساسية",
          price: 15_000,
          cost: 1_750,
        },
        { id: "s2", optionId: "shared", name: "مشترك — مع الإضافات", price: 17_500, cost: 3_000 },
        {
          id: "p1",
          optionId: "private",
          name: "خاص بك — اللعبة الأساسية",
          price: 25_000,
          cost: 1_750,
        },
        { id: "p2", optionId: "private", name: "خاص بك — مع الإضافات", price: 38_000, cost: 3_000 },
      ],
    };

    const normalized = normalizeNintendoAccountPricing(original);
    expect(normalized.options.map((option: any) => [option.id, option.name])).toEqual([
      ["shared", "حساب أوفلاين"],
      ["private", "حساب أونلاين"],
    ]);
    expect(normalized.types.map((type: any) => [type.id, type.optionId])).toEqual([
      ["s1", "shared"],
      ["s2", "shared"],
      ["p1", "private"],
      ["p2", "private"],
    ]);
    expect(normalized.types.map((type: any) => type.name)).toEqual([
      "حساب أوفلاين — عادي",
      "حساب أوفلاين — مع الإضافات",
      "حساب أونلاين — عادي",
      "حساب أونلاين — مع الإضافات",
    ]);
    expect(normalized.types.map((type: any) => [type.price, type.cost])).toEqual([
      [15_000, 1_750],
      [17_500, 3_000],
      [25_000, 1_750],
      [38_000, 3_000],
    ]);
  });

  it("leaves unrelated product options unchanged", () => {
    const hardware = { options: [{ id: "white", name: "أبيض" }], types: [] };
    expect(normalizeNintendoAccountPricing(hardware)).toBe(hardware);
  });
});
