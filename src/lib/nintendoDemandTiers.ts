/**
 * How well each game sells, judged per title.
 *
 * This is the input the pricing engine cannot compute. A supplier line costing
 * 1,500 IQD says nothing about whether the game is Mario Kart World or a 2022
 * sports title nobody asks for any more, and both appear in this archive at
 * that price. The tier is the commercial judgement; the engine only turns it
 * into a number.
 *
 * Assigned from what each game is: how well known it is, how old, whether it
 * still sells at full price, and whether it is a reason to own the console.
 * A slug with no entry is priced as `standard` and reported, so a new title
 * never silently inherits a guess.
 */

import type { DemandTier } from "./nintendoPricing";

export const DEMAND_TIERS: Readonly<Record<string, DemandTier>> = {
  /* Reasons to own the console. Never discounted, sell for years. */
  "mario-kart-world-switch-2": "flagship",
  "super-smash-bros-ultimate": "flagship",
  "the-legend-of-zelda-breath-of-the-wild-switch-1": "flagship",
  "the-legend-of-zelda-breath-of-the-wild-switch-2-edition": "flagship",
  "the-legend-of-zelda-tears-of-the-kingdom-switch-1": "flagship",
  "the-legend-of-zelda-tears-of-the-kingdom-switch-2-edition": "flagship",
  "minecraft-switch": "flagship",
  "metroid-dread-switch": "flagship",
  "pikmin-4-switch": "flagship",

  /* Well known, still in demand, hold their price. */
  "luigis-mansion-3": "major",
  "super-mario-rpg-switch-1": "major",
  "paper-mario-the-origami-king-switch-1": "major",
  "paper-mario-the-thousand-year-door-switch-1": "major",
  "the-legend-of-zelda-echoes-of-wisdom-switch": "major",
  "the-legend-of-zelda-links-awakening-switch": "major",
  "the-legend-of-zelda-skyward-sword-hd-switch": "major",
  "hyrule-warriors-age-of-imprisonment-switch-2": "major",
  "hyrule-warriors-age-of-calamity-switch": "major",
  "xenoblade-chronicles-2-switch": "major",
  "splatoon-3-expansion-pass": "major",
  "cyberpunk-2077-ultimate-edition-switch-2": "major",
  "hogwarts-legacy-switch-2": "major",
  "hollow-knight-switch-1": "major",
  "hades-switch": "major",
  "hades-ii-nintendo-switch-2-edition-switch-2": "major",
  "star-wars-outlaws-switch-2": "major",
  "final-fantasy-vii-remake-intergrade-switch-2": "major",
  "the-witcher-3-wild-hunt-remastered-switch-2": "major",
  "the-witcher-3-wild-hunt-complete-edition-switch": "major",
  "pragmata-switch-2": "major",
  "dead-by-daylight-switch-2": "major",
  "ea-sports-fc-27": "major",
  "ea-sports-fc-27-switch-2": "major",
  "ea-sports-fc-26": "major",
  "ea-sports-fc-26-switch-2": "major",
  "mario-vs-donkey-kong-switch-1": "major",
  "pikmin-3-deluxe-switch": "major",
  "pikmin-1-2-switch": "major",
  "tomodachi-life-living-the-dream": "major",
  "lies-of-p-complete-edition-switch-2": "major",
  "hitman-world-of-assassination-signature-edition-switch-2": "major",

  /* Recognised, mid-list, sells steadily but is not a draw. */
  "nintendo-switch-sports": "standard",
  "mario-golf-super-rush-switch-1": "standard",
  "mario-strikers-battle-league-switch-1": "standard",
  "mario-tennis-aces-switch-1": "standard",
  "mario-rabbids-kingdom-battle-switch-1": "standard",
  "hyrule-warriors-definitive-edition-switch": "standard",
  "cuphead-switch": "standard",
  "stray-switch-1": "standard",
  "stray-switch-2": "standard",
  "nier-automata-the-end-of-yorha-edition-switch-1": "standard",
  "final-fantasy-xii-the-zodiac-age": "standard",
  "final-fantasy-viii-remastered": "standard",
  "final-fantasy-vi": "standard",
  "final-fantasy-tactics-the-ivalice-chronicles-nintendo-switch-2-edition-switch-2": "standard",
  "devil-may-cry-5-special-edition-switch-2": "standard",
  "rise-of-the-tomb-raider-20-year-celebration-switch-2": "standard",
  "tomb-raider-definitive-edition-switch-1": "standard",
  "tomb-raider-definitive-edition-switch-2": "standard",
  "wolfenstein-ii-the-new-colossus": "standard",
  "the-hundred-line-last-defense-academy-switch": "standard",
  "kingdom-hearts-integrum-masterpiece-for-cloud": "standard",
  "the-binding-of-isaac-afterbirthplus-switch-1": "standard",
  "unravel-two-switch-1": "standard",
  "ea-sports-fc-25": "standard",
  "ea-sports-fc-24": "standard",
  "efootball-kick-off-switch-2": "standard",
  "fitness-boxing-3-your-personal-trainer": "standard",
  "fitness-boxing-3-your-personal-trainer-nintendo-switch-2-edition-switch-2": "standard",

  /* Old, niche, or long since discounted to nothing. */
  "everybody-1-2-switch-switch-1": "niche",
  "fifa-22-nintendo-switch-legacy-edition": "niche",
  "ea-sports-fifa-23-nintendo-switch-legacy-edition": "niche",
  "world-of-final-fantasy-maxima": "niche",
  "a-plague-tale-innocence-cloud-version-switch1": "niche",
  "go-go-town-switch-1": "niche",
  "go-go-town-nintendo-switch-2-edition-switch-2": "niche",

  /* ---- the games already in production, keyed by their own slugs ---- */

  /* Reasons to own the console. */
  "mario-kart-world": "flagship",
  "mario-kart-8-deluxe-switch": "flagship",
  "super-mario-odyssey": "flagship",
  "super-mario-bros-wonder-switch": "flagship",
  "donkey-kong-bananza-switch-2": "flagship",
  "kirby-air-riders": "flagship",
  "splatoon-raiders-switch-2": "flagship",
  "super-mario-galaxy-plus-super-mario-galaxy-2-switch": "flagship",
  "hollow-knight-silksong-switch-2": "flagship",
  "pokemon-pokopia": "flagship",
  "hyrule-warriors-age-of-imprisonment": "flagship",

  /* Well known, still in demand. */
  "super-mario-party-jamboree": "major",
  "super-mario-bros-wonder-switch-2-edition-bellabel-park": "major",
  "super-mario-party-switch": "major",
  "super-mario-3d-world-plus-bowsers-fury-switch": "major",
  "new-super-mario-bros-u-deluxe-switch": "major",
  "mario-party-superstars-switch": "major",
  "mario-tennis-fever-switch-2": "major",
  "xenoblade-chronicles-3-switch": "major",
  "xenoblade-chronicles-3-switch-2-edition": "major",
  "xenoblade-chronicles-2-switch-2-edition": "major",
  "xenoblade-chronicles-definitive-edition-switch": "major",
  "xenoblade-chronicles-definitive-edition-switch-2-edition": "major",
  "xenoblade-chronicles-x-definitive-edition-switch": "major",
  "xenoblade-chronicles-x-definitive-edition-switch-2-edition": "major",
  "bayonetta-3": "major",
  "street-fighter-6-switch-2": "major",
  "elden-ring-tarnished-edition-switch-2": "major",
  "assassins-creed-shadows-switch-2": "major",
  "resident-evil-requiem": "major",
  "cyberpunk-2077-ultimate-edition-nintendo-switch-2": "major",
  "hades-ii-nintendo-switch-2-edition": "major",
  "dave-the-diver-nintendo-switch-2-edition": "major",
  "deltarune": "major",
  "it-takes-two": "major",
  "split-fiction": "major",
  "persona-5-royal": "major",
  "persona-3-reload": "major",
  "monster-hunter-stories-3-twisted-reflection": "major",
  "dragon-ball-sparking-zero-switch2": "major",
  "just-dance-2026-edition": "major",
  "pragmata": "major",
  "fantasy-life-i-the-girl-who-steals-time-switch1": "major",
  "yoshi-and-the-mysterious-book": "major",
  "little-nightmares-iii-switch1-switch2": "major",
  "red-dead-redemption-switch1": "major",
  "two-point-museum": "major",
  "hitman-world-of-assassination-signature-edition": "major",

  /* Mid-list. */
  "mario-rabbids-sparks-of-hope-switch": "standard",
  "mario-sonic-at-the-olympic-games-tokyo-2020-switch": "standard",
  "nintendo-switch-2-welcome-tour": "standard",
  "bayonetta": "standard",
  "bayonetta-2": "standard",
  "bayonetta-origins-cereza-and-the-lost-demon": "standard",
  "persona-3-portable": "standard",
  "persona-4-golden": "standard",
  "persona-4-arena-ultimax": "standard",
  "persona-5-strikers": "standard",
  "persona-5-tactica": "standard",
  "raidou-remastered-the-mystery-of-the-soulless-army": "standard",
  "bravely-default-flying-fairy-hd-remaster": "standard",
  "dynasty-warriors-origins": "standard",
  "warhammer-40-000-rogue-trader": "standard",
  "fatal-frame-ii-crimson-butterfly-remake": "standard",
  "layers-of-fear-the-final-masterpiece-edition": "standard",
  "little-nightmares-i-and-ii-bundle": "standard",
  "grid-legends-deluxe-edition": "standard",
  "gear-club-unlimited-3": "standard",
  "rotwood": "standard",
  "ys-x-proud-nordics": "standard",
  "shadow-tactics-blades-of-the-shogun": "standard",
  "phoenix-wright-ace-attorney-trilogy-switch1": "standard",
  "fallout-4-anniversary-edition": "standard",
  "arcade-archives-vs-super-mario-bros-switch": "standard",

  /* Older or niche. */
  "1-2-switch": "niche",
};

export interface TierDecision {
  tier: DemandTier;
  /** True when no entry existed and the default was used. */
  defaulted: boolean;
}

export function demandTierFor(slug: string): TierDecision {
  const tier = DEMAND_TIERS[slug];
  return tier ? { tier, defaulted: false } : { tier: "standard", defaulted: true };
}
