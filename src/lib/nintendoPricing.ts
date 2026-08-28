/**
 * Supplier cost and customer selling price are different numbers.
 *
 * The import templates do not keep them apart. Every `type.N.price` in the
 * archive is a supplier figure, and the shape it arrives in hides that:
 *
 * ```
 * type.1  Regular / Offline   option=offline  price=1750   cost=1750
 * type.2  Special             option=offline  price=3000   cost=3000
 * type.3  Standard / Online   option=online   price=25000  cost=1750
 * type.4  Deluxe              option=online   price=38000  cost=3000
 * ```
 *
 * The offline rows carry one supplier number written into both fields. The
 * online rows carry the *online* supplier number in `price` and a copy of the
 * *offline* cost in `cost` — in 67 of the 76 templates every online `cost` is
 * a value that also appears on the offline side, which is what a copy looks
 * like. So the four real acquisition costs are:
 *
 *   offline base    ← offline base row, either field
 *   offline extras  ← offline extras row, either field
 *   online base     ← online base row's *price*
 *   online extras   ← online extras row's *price*
 *
 * and not one of the four selling prices exists yet. This module maps the
 * costs and then prices each tier separately, so a supplier number can never
 * reach a customer by being left in a field nobody re-read.
 */

/** Which account the customer buys, and whether extra content comes with it. */
export type AccountKind = "offline" | "online";
export type ContentKind = "base" | "extras";

export interface SupplierCost {
  amount: number;
  /** Where the number came from, kept so a wrong mapping is traceable. */
  source: string;
}

export interface SupplierCosts {
  offlineBase?: SupplierCost;
  offlineExtras?: SupplierCost;
  onlineBase?: SupplierCost;
  onlineExtras?: SupplierCost;
  /** Rows that could not be placed. Never guessed into a slot. */
  unmapped: string[];
}

export interface TemplateType {
  id?: string;
  name?: string;
  optionId?: string;
  price?: number | null;
  cost?: number | null;
}

/**
 * Extra content, judged from the row rather than from its price.
 *
 * A dear row is not thereby a DLC row: FIFA's offline extras cost 6,000 while
 * Xenoblade's offline *base* costs 3,500, and reading the price would call one
 * of those wrong. The names the archive actually uses are the evidence.
 */
const EXTRAS = /\b(special|deluxe|complete|ultimate|bonus|expansion|premium|gold|dlc)\b/i;
const BASE = /\b(regular|standard|base|normal)\b/i;

export function isExtrasRow(name: string | undefined): boolean {
  const text = String(name ?? "");
  if (!text.trim()) return false;
  // "Standard / Online" and "Regular / Offline" name the account, not content.
  if (BASE.test(text) && !EXTRAS.test(text)) return false;
  return EXTRAS.test(text);
}

const num = (v: unknown): number | null => {
  const n = Number(String(v ?? "").replace(/[, ]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * Reads the four acquisition costs out of a template's type rows.
 *
 * A slot left undefined means the archive did not state it. That is reported,
 * never filled from the other account or the other tier.
 */
export function mapSupplierCosts(types: readonly TemplateType[]): SupplierCosts {
  const out: SupplierCosts = { unmapped: [] };

  for (const type of types) {
    const account: AccountKind | null =
      type.optionId === "offline_account" ? "offline" : type.optionId === "online_account" ? "online" : null;
    if (!account) {
      out.unmapped.push(`${type.name ?? type.id ?? "?"} — no recognisable option`);
      continue;
    }
    const content: ContentKind = isExtrasRow(type.name) ? "extras" : "base";

    /*
      Offline rows hold the same supplier number in both fields, so either will
      do. Online rows hold the online figure in `price`; their `cost` is the
      offline number copied across and is not read.
    */
    const amount = account === "offline" ? (num(type.cost) ?? num(type.price)) : num(type.price);
    if (amount === null) {
      out.unmapped.push(`${type.name ?? type.id ?? "?"} — no usable amount`);
      continue;
    }

    const key = `${account}${content === "base" ? "Base" : "Extras"}` as const;
    if (out[key]) {
      out.unmapped.push(`${type.name ?? type.id ?? "?"} — ${key} was already taken`);
      continue;
    }
    out[key] = {
      amount,
      source: `${type.name ?? type.id ?? "?"} (${account === "offline" ? "cost" : "price"} field)`,
    };
  }
  return out;
}

/* ------------------------------------------------------------------ pricing */

/**
 * How much the market will bear for this particular game.
 *
 * This is the judgement, and it is made per game from what the game is —
 * how well known it is, how old, whether it still sells. It is deliberately
 * not derived from the supplier cost: a cheap supplier line on a flagship
 * Nintendo title is a bargain, not a signal to price it low.
 */
export type DemandTier =
  /** Evergreen system seller — Mario Kart, Smash, Zelda, Animal Crossing. */
  | "flagship"
  /** Well known and still in demand — most first-party and big third-party. */
  | "major"
  /** Recognised but not a draw — solid mid-list. */
  | "standard"
  /** Older, niche, or long discounted. */
  | "niche";

export type Platform = "switch1" | "switch2";

/**
 * The bands the store sells offline accounts in, per console.
 *
 * Switch 2 reaches higher because the library is newer and less discounted.
 */
const OFFLINE_BAND: Record<Platform, { min: number; max: number }> = {
  switch1: { min: 5_000, max: 15_000 },
  switch2: { min: 5_000, max: 20_000 },
};

export interface PricedTier {
  account: AccountKind;
  content: ContentKind;
  /** What the customer pays. */
  price: number;
  /** What the copy costs to acquire. Admin-only; never rendered publicly. */
  cost: number;
  margin: number;
  reason: string;
}

export interface GamePricing {
  tiers: PricedTier[];
  /** The base product's own figures — the offline base tier. */
  productPrice?: number;
  productCost?: number;
  /** Tiers the archive did not give a cost for, so nothing was invented. */
  needsReview: string[];
}

/** Where in its band a tier sits, as a fraction from the floor to the ceiling. */
const TIER_POSITION: Record<DemandTier, number> = {
  flagship: 1,
  major: 0.65,
  standard: 0.35,
  niche: 0,
};

/** How much margin an online account carries, by how well the game sells. */
const ONLINE_UPLIFT: Record<DemandTier, number> = {
  flagship: 1.45,
  major: 1.35,
  standard: 1.28,
  niche: 1.22,
};

/** Prices land on a round 250 so the storefront never shows an odd figure. */
export function roundToStep(value: number, step = 250): number {
  return Math.round(value / step) * step;
}

/**
 * Prices every tier of one game.
 *
 * Offline sits inside the console's band, positioned by demand — the supplier
 * cost is an input to the decision, not a multiplier, so a flagship on a cheap
 * supplier line is still priced as a flagship.
 *
 * Online has no band. Acquiring an online account costs an order of magnitude
 * more than an offline copy of the same game — 25,000 against 1,750 for Smash —
 * so an offline band would price every online tier below its own cost. The
 * margin is taken on the cost instead, widening with demand.
 *
 * Extras are priced above their own base by what the extra content actually
 * cost to acquire, so a 6,000 season pass moves the price further than a 1,250
 * one does.
 */
export function priceGame(
  costs: SupplierCosts,
  platform: Platform,
  tier: DemandTier,
): GamePricing {
  const tiers: PricedTier[] = [];
  const needsReview = [...costs.unmapped];

  const band = OFFLINE_BAND[platform];
  const offlineBase = costs.offlineBase?.amount;

  let offlineBasePrice: number | undefined;
  if (offlineBase !== undefined) {
    let price = roundToStep(band.min + (band.max - band.min) * TIER_POSITION[tier]);
    let reason = `${tier} on ${platform}, placed in the ${band.min.toLocaleString()}–${band.max.toLocaleString()} band`;
    if (price <= offlineBase) {
      price = roundToStep(offlineBase * 1.6);
      reason = `${reason}; lifted clear of the ${offlineBase.toLocaleString()} acquisition cost`;
    }
    offlineBasePrice = price;
    tiers.push({
      account: "offline",
      content: "base",
      price,
      cost: offlineBase,
      margin: price - offlineBase,
      reason,
    });
  } else {
    needsReview.push("offline base — no supplier cost in the source");
  }

  const offlineExtras = costs.offlineExtras?.amount;
  if (offlineExtras !== undefined) {
    if (offlineBase !== undefined && offlineBasePrice !== undefined) {
      const extraContent = Math.max(0, offlineExtras - offlineBase);
      const price = roundToStep(offlineBasePrice + extraContent * 2);
      tiers.push({
        account: "offline",
        content: "extras",
        price,
        cost: offlineExtras,
        margin: price - offlineExtras,
        reason: `base plus ${extraContent.toLocaleString()} of extra content, at twice its acquisition cost`,
      });
    } else {
      needsReview.push("offline extras — priced against a base that has no cost");
    }
  }

  for (const [content, entry] of [
    ["base", costs.onlineBase],
    ["extras", costs.onlineExtras],
  ] as const) {
    if (!entry) continue;
    const price = roundToStep(entry.amount * ONLINE_UPLIFT[tier]);
    tiers.push({
      account: "online",
      content,
      price,
      cost: entry.amount,
      margin: price - entry.amount,
      reason: `${tier} online: ${Math.round((ONLINE_UPLIFT[tier] - 1) * 100)}% over the ${entry.amount.toLocaleString()} acquisition cost`,
    });
  }
  if (!costs.onlineBase) needsReview.push("online base — no supplier cost in the source");

  return {
    tiers,
    productPrice: offlineBasePrice,
    productCost: offlineBase,
    needsReview,
  };
}

/* ------------------------------------------------------- what the customer reads */

/** Arabic labels. Supplier wording and Chinese text never reach a customer. */
export const CUSTOMER_LABELS = {
  offline: "مشترك",
  online: "خاص بك",
  base: "اللعبة الأساسية",
  extras: "مع الإضافات",
} as const;

export function customerTypeName(account: AccountKind, content: ContentKind): string {
  return `${CUSTOMER_LABELS[account]} — ${CUSTOMER_LABELS[content]}`;
}

export function customerOptionName(account: AccountKind): string {
  return CUSTOMER_LABELS[account];
}
