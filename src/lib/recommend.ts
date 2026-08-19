/**
 * Suggestion ordering based on the genres a member picked at signup (or later
 * in profile preferences). Exact genre matches rank first, then nearby genres,
 * then shared tags / story keywords, with Metacritic as a tie-breaker.
 */
import type { Product } from "./types";

/** Genres that feel close enough to recommend together. */
const NEARBY: Record<string, string[]> = {
  action: ["fighting", "shooter", "adventure", "platformer"],
  fighting: ["action", "sports", "party"],
  shooter: ["action", "survival", "stealth"],
  adventure: ["rpg", "action", "metroidvania", "puzzle"],
  rpg: ["adventure", "strategy", "roguelike", "visual_novel"],
  platformer: ["action", "metroidvania", "family"],
  puzzle: ["educational", "board_game", "family"],
  racing: ["sports", "simulation"],
  simulation: ["strategy", "sandbox", "racing"],
  sports: ["racing", "fighting", "party"],
  strategy: ["simulation", "rpg", "board_game"],
  party: ["family", "sports", "music"],
  music: ["party", "family"],
  family: ["party", "platformer", "educational"],
  horror: ["survival", "stealth", "shooter"],
  sandbox: ["simulation", "survival"],
  survival: ["horror", "sandbox", "roguelike"],
  stealth: ["action", "horror"],
  metroidvania: ["platformer", "adventure"],
  roguelike: ["rpg", "survival"],
  visual_novel: ["rpg", "puzzle"],
  educational: ["family", "puzzle"],
  board_game: ["puzzle", "strategy"],
};

function genresOf(product: Product): string[] {
  const raw = [product.genre, ...(Array.isArray(product.tags) ? product.tags : [])];
  const extra = (product as Record<string, unknown>)["genres"];
  if (Array.isArray(extra)) raw.push(...(extra as string[]));
  return raw.filter((value): value is string => typeof value === "string" && value.length > 0);
}

function metaScore(product: Product): number {
  const value = Number((product as Record<string, unknown>)["metacriticRating"] ?? 0);
  return Number.isFinite(value) ? value : 0;
}

export function preferenceScore(product: Product, preferred: string[]): number {
  if (preferred.length === 0) return metaScore(product) / 100;
  const own = genresOf(product).map((g) => g.toLowerCase());
  let score = 0;
  for (const genre of preferred) {
    const key = genre.toLowerCase();
    if (own.includes(key)) score += 10;
    for (const near of NEARBY[key] ?? []) {
      if (own.includes(near)) score += 4;
    }
    // story / description keyword overlap
    const text = `${product.description ?? ""} ${product.title ?? ""}`.toLowerCase();
    if (text.includes(key)) score += 1;
  }
  return score + metaScore(product) / 100;
}

/** Stable sort: preferred genres float to the top, original order otherwise. */
export function rankByPreference<T extends Product>(products: T[], preferred?: string[]): T[] {
  const picks = preferred ?? [];
  if (picks.length === 0) return products;
  return products
    .map((product, index) => ({ product, index, score: preferenceScore(product, picks) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.product);
}
