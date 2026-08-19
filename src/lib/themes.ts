/**
 * Theme (background) packs.
 *
 * A pack is a full skin: page background, cards, buttons, text and borders.
 * Free packs are always available; paid packs are unlocked by redeeming the
 * matching reward with bananas (`rewardId`). The admin can later author extra
 * packs in the `theme_packs` table — this list stays the built-in catalogue.
 */

export type ThemePack = {
  id: string;
  name: string;
  /** true = dark-mode pack (adds the `dark` class) */
  dark: boolean;
  free: boolean;
  /** bananas price when it is not free */
  cost: number;
  /** reward id in the redeem store that unlocks this pack */
  rewardId?: string;
  /** small preview swatches: [background, card, accent] */
  swatch: [string, string, string];
  hint: string;
};

export const THEME_PACKS: ThemePack[] = [
  {
    id: "cream",
    name: "كريمي (نينتندو)",
    dark: false,
    free: true,
    cost: 0,
    swatch: ["#FBF6E9", "#FFFDF6", "#E60012"],
    hint: "الافتراضي الفاتح — كريمي بطابع نينتندو والموز",
  },
  {
    id: "midnight",
    name: "ليلي موزي",
    dark: true,
    free: true,
    cost: 0,
    swatch: ["#0B1430", "#132147", "#F6D84A"],
    hint: "الافتراضي الداكن — أزرق داكن مع لمسات موز",
  },
  {
    id: "space",
    name: "الفضاء",
    dark: true,
    free: false,
    cost: 500,
    rewardId: "rw-space",
    swatch: ["#070A18", "#141A33", "#8B7CF6"],
    hint: "سماء ليلية بنفسجية",
  },
  {
    id: "banana",
    name: "سوق الموز",
    dark: false,
    free: false,
    cost: 1000,
    rewardId: "rw-banana",
    swatch: ["#FFF4C2", "#FFFBE8", "#B07A00"],
    hint: "أصفر موزي كامل",
  },
  {
    id: "cyber",
    name: "سايبربانك",
    dark: true,
    free: false,
    cost: 800,
    rewardId: "rw-cyber",
    swatch: ["#0A0714", "#1A1030", "#00E5FF"],
    hint: "نيون سماوي وبنفسجي",
  },
];

export const DEFAULT_THEME = "cream";

/** Legacy settings values from before packs existed. */
const ALIASES: Record<string, string> = { light: "cream", dark: "midnight" };

export function findTheme(id: string | undefined) {
  const wanted = id ? (ALIASES[id] ?? id) : DEFAULT_THEME;
  return THEME_PACKS.find((t) => t.id === wanted) ?? THEME_PACKS[0]!;
}

/** Reward id -> theme id, used to turn a redemption into an unlocked pack. */
export const REWARD_TO_THEME: Record<string, string> = Object.fromEntries(
  THEME_PACKS.filter((t) => t.rewardId).map((t) => [t.rewardId!, t.id]),
);

/** Packs a member may apply: the free ones plus everything they unlocked. */
export function availableThemes(unlocked: string[] | undefined) {
  const owned = new Set(unlocked ?? []);
  return THEME_PACKS.filter((t) => t.free || owned.has(t.id));
}
