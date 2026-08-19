/**
 * Reads a raw product record (the admin panel writes it as loose JSON) into the
 * shape the product hub renders. Everything is optional: a section with no data
 * is simply absent, and the page drops it along with its nav entry.
 */

import { toAmount } from "./purchasable";

export type OfferKind = "account" | "accountOnline" | "lend" | "disc";

export interface HubOffer {
  kind: OfferKind;
  label: string;
  price: number;
  /** undefined = unlimited */
  stock?: number;
  available: boolean;
  /** lend/disc need a delivery address, an account does not. */
  requiresAddress: boolean;
  note?: string;
  meta?: string;
  preorder?: boolean;
}

export interface ListRow {
  [key: string]: unknown;
}

export const getTextValue = (item: unknown): string => {
  if (typeof item === "string") return item;
  if (item && typeof item === "object") {
    if ("value" in item) {
      return String((item as any).value ?? "");
    }
    if ("name" in item && typeof (item as any).name === "string") {
      return String((item as any).name ?? "");
    }
    if ("title" in item && typeof (item as any).title === "string") {
      return String((item as any).title ?? "");
    }
    if ("label" in item && typeof (item as any).label === "string") {
      return String((item as any).label ?? "");
    }
  }
  return "";
};

export const str = (v: unknown): string => {
  if (typeof v === "string") return v.trim();
  if (v && typeof v === "object") {
    if ("value" in v) return String((v as any).value ?? "").trim();
    if ("name" in v) return String((v as any).name ?? "").trim();
    if ("title" in v) return String((v as any).title ?? "").trim();
    if ("label" in v) return String((v as any).label ?? "").trim();
    return "";
  }
  return v == null ? "" : String(v).trim();
};
export const bool = (v: unknown) => v === true || v === "true" || v === 1 || v === "1";
export const num = (v: unknown) => {
  const n = toAmount(v);
  return n > 0 ? n : 0;
};

export const slugify = (s: string) =>
  str(s)
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF]+/g, "-")
    .replace(/^-+|-+$/g, "") || Math.random().toString(36).slice(2, 8);

/** Splits a textarea field into trimmed lines. */
export function lines(v: unknown): string[] {
  return str(v)
    .split(/\r?\n|،|;/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function rows(v: unknown): ListRow[] {
  if (!Array.isArray(v)) return [];
  return (v as ListRow[]).filter(
    (row) => row && Object.values(row).some((x) => str(x) !== "" || x === true),
  );
}

export function youtubeEmbed(raw: unknown) {
  const value = str(raw);
  if (!value) return undefined;
  const id =
    /(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{6,})/.exec(value)?.[1] ??
    (value.length < 20 ? value : undefined);
  return id ? `https://www.youtube.com/embed/${id}` : undefined;
}

export interface HubGame {
  id: string;
  raw: Record<string, unknown>;
  title: string;
  titleEn: string;
  tagline: string;
  description: string;
  platform: "switch" | "switch2";
  isSwitch2: boolean;
  coverUrl?: string;
  sleeveUrl?: string;
  banners: string[];
  genres: string[];
  publisher: string;
  developer: string;
  releaseDate: string;
  ageRating: string;
  metacritic: number;
  offers: HubOffer[];
  basePrice: number;
}

/** Reads every field the hub needs; unknown/legacy keys are tolerated. */
export function normalizeHubGame(product: Record<string, unknown>): HubGame {
  const p = product;
  const platform =
    str(p["platform"]) === "switch2" ||
    (bool(p["switch2Enhanced"]) && str(p["platform"]) === "switch2")
      ? "switch2"
      : "switch";

  const banners = [
    ...(Array.isArray(p["bannerImages"]) ? (p["bannerImages"] as unknown[]) : []),
    p["bannerImage"],
    p["banner"],
    ...(Array.isArray(p["gallery"]) ? (p["gallery"] as unknown[]) : []),
  ]
    .map(str)
    .filter(Boolean);

  const cover =
    str(p["coverImage"]) || str(p["cartridgeImage"]) || str(p["image"]) || banners[0] || "";

  const genres = Array.isArray(p["genres"])
    ? (p["genres"] as unknown[]).map(str).filter(Boolean)
    : lines(p["genre"]);

  return {
    id: String(p["id"] ?? ""),
    raw: p,
    title: str(p["title"]) || "منتج",
    titleEn: str(p["titleEn"]) || str(p["english_title"]),
    tagline: str(p["tagline"]),
    description: str(p["descriptionAr"]) || str(p["description"]),
    platform,
    isSwitch2: platform === "switch2" || bool(p["switch2Enhanced"]),
    ...(cover ? { coverUrl: cover } : {}),
    ...(str(p["sleeveImage"]) ? { sleeveUrl: str(p["sleeveImage"]) } : {}),
    banners: [...new Set(banners)],
    genres,
    publisher: str(p["publisher"]),
    developer: str(p["developer"]) || str(p["studioName"]),
    releaseDate: str(p["releaseDate"]),
    ageRating: str(p["ageRating"]),
    metacritic: num(p["metacriticRating"]),
    offers: readOffers(p),
    basePrice: num(p["price"]),
  };
}

/**
 * Availability, exactly as the admin configured it. An offer whose toggle is off
 * never reaches the page; one that is on but out of stock is returned with
 * `available: false` so the page can show "notify me" instead of a dead button.
 */
export function readOffers(p: Record<string, unknown>): HubOffer[] {
  const list: HubOffer[] = [];

  const accountPrice = num(p["accountPrice"]) || num(p["price"]);
  const accountInfinite = bool(p["accountInfinite"]) || bool(p["isInfiniteStock"]);
  const accountStock = accountInfinite
    ? undefined
    : Math.trunc(num(p["accountStock"]) || num(p["stock"]));
  if (bool(p["accountEnabled"]) || (!("accountEnabled" in p) && accountPrice > 0)) {
    list.push({
      kind: "account",
      label: "حساب أوفلاين",
      price: accountPrice,
      ...(accountStock === undefined ? {} : { stock: accountStock }),
      available: accountPrice > 0 && (accountStock === undefined || accountStock > 0),
      requiresAddress: false,
      ...(str(p["accountNote"]) ? { note: str(p["accountNote"]) } : {}),
      meta: "تسليم فوري عبر المحادثة",
    });
  }

  // An online (shared/legit) digital account is stocked only sometimes, so it is
  // opt-in per product instead of derived from the base price.
  if (bool(p["accountOnlineEnabled"])) {
    const onlinePrice = num(p["accountOnlinePrice"]);
    const onlineStock = bool(p["accountOnlineInfinite"])
      ? undefined
      : Math.trunc(num(p["accountOnlineStock"]));
    list.push({
      kind: "accountOnline",
      label: "حساب أونلاين",
      price: onlinePrice,
      ...(onlineStock === undefined ? {} : { stock: onlineStock }),
      available: onlinePrice > 0 && (onlineStock === undefined || onlineStock > 0),
      requiresAddress: false,
      ...(str(p["accountOnlineNote"]) ? { note: str(p["accountOnlineNote"]) } : {}),
      meta: "تسليم عبر المحادثة",
    });
  }

  if (bool(p["lendEnabled"])) {
    const copies = Math.trunc(num(p["lendCopies"]));
    const availableNow = bool(p["lendAvailableNow"]) && copies > 0;
    list.push({
      kind: "lend",
      label: "إقراض كارتلج",
      price: num(p["lendPrice"]),
      stock: copies,
      available: availableNow || bool(p["lendPreorder"]),
      requiresAddress: true,
      ...(str(p["lendTerms"]) ? { note: str(p["lendTerms"]) } : {}),
      ...(str(p["lendRegion"]) ? { meta: str(p["lendRegion"]) } : {}),
      preorder: !availableNow && bool(p["lendPreorder"]),
    });
  }

  if (bool(p["discEnabled"])) {
    const stock = Math.trunc(num(p["discStock"]));
    list.push({
      kind: "disc",
      label: str(p["discCondition"]) === "used" ? "قرص مستعمل" : "قرص جديد",
      price: num(p["discPrice"]),
      stock,
      available: stock > 0 && num(p["discPrice"]) > 0,
      requiresAddress: true,
      meta: "توصيل داخل العراق",
    });
  }

  return list;
}

export function cheapestOffer(offers: HubOffer[]): HubOffer | undefined {
  const buyable = offers.filter((o) => o.available && o.price > 0);
  if (!buyable.length) return offers[0];
  return buyable.reduce((min, o) => (o.price < min.price ? o : min), buyable[0]!);
}

/** True when at least one field of the group carries data. */
export function groupHasData(p: Record<string, unknown>, keys: string[]): boolean {
  return keys.some((key) => {
    const value = p[key];
    if (Array.isArray(value)) return rows(value).length > 0;
    if (typeof value === "boolean") return value;
    return str(value) !== "" && str(value) !== "0";
  });
}
