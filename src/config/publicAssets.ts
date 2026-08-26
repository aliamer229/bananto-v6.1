/**
 * Central configuration for public R2 assets hosted on assets.banan.to.
 * No API keys or secrets are stored here.
 */

export const ASSET_BASE_URL = "https://assets.banan.to";

export const PUBLIC_SERVICES_IMAGES = {
  addGame: `${ASSET_BASE_URL}/Images/Services/Add_game.webp`,
  discTrade: `${ASSET_BASE_URL}/Images/Services/Disc_Trade.webp`,
  problem: `${ASSET_BASE_URL}/Images/Services/Problem.webp`,
  accountGuides: `${ASSET_BASE_URL}/Images/Services/Account_guides.webp`,
  faq: `${ASSET_BASE_URL}/Images/Services/Faq.webp`,
  policy: `${ASSET_BASE_URL}/Images/Services/Policy.webp`,
  support: `${ASSET_BASE_URL}/Images/Services/Support.webp`,
  hangBanner: `${ASSET_BASE_URL}/Images/Services/Hang_Banner.webp`,
} as const;

export const UI_SOUND_MAP: Record<string, string> = {
  // Core UI sound files mapping
  home: `${ASSET_BASE_URL}/Audio/Ui/home.webm`,
  user: `${ASSET_BASE_URL}/Audio/Ui/user.webm`,
  profile: `${ASSET_BASE_URL}/Audio/Ui/user.webm`,
  settings: `${ASSET_BASE_URL}/Audio/Ui/Settings.webm`,
  Settings: `${ASSET_BASE_URL}/Audio/Ui/Settings.webm`,
  news: `${ASSET_BASE_URL}/Audio/Ui/News.webm`,
  News: `${ASSET_BASE_URL}/Audio/Ui/News.webm`,
  album: `${ASSET_BASE_URL}/Audio/Ui/Album.webm`,
  Album: `${ASSET_BASE_URL}/Audio/Ui/Album.webm`,
  message_toast: `${ASSET_BASE_URL}/Audio/Ui/08.%20Message%20Toast.webm`,
  "08. Message Toast": `${ASSET_BASE_URL}/Audio/Ui/08.%20Message%20Toast.webm`,
  toast: `${ASSET_BASE_URL}/Audio/Ui/08.%20Message%20Toast.webm`,
  message: `${ASSET_BASE_URL}/Audio/Ui/08.%20Message%20Toast.webm`,
  receive_message: `${ASSET_BASE_URL}/Audio/Ui/08.%20Message%20Toast.webm`,
  typing: `${ASSET_BASE_URL}/Audio/Ui/21.%20Typing.webm`,
  "21. Typing": `${ASSET_BASE_URL}/Audio/Ui/21.%20Typing.webm`,
  type: `${ASSET_BASE_URL}/Audio/Ui/21.%20Typing.webm`,
  error: `${ASSET_BASE_URL}/Audio/Ui/Error.webm`,
  Error: `${ASSET_BASE_URL}/Audio/Ui/Error.webm`,
  fail: `${ASSET_BASE_URL}/Audio/Ui/Error.webm`,
  alert: `${ASSET_BASE_URL}/Audio/Ui/Error.webm`,
  klick: `${ASSET_BASE_URL}/Audio/Ui/klick.webm`,
  click: `${ASSET_BASE_URL}/Audio/Ui/klick.webm`,
  select: `${ASSET_BASE_URL}/Audio/Ui/klick.webm`,
  switch_click: `${ASSET_BASE_URL}/Audio/Ui/klick.webm`,
  button: `${ASSET_BASE_URL}/Audio/Ui/klick.webm`,
  hover: `${ASSET_BASE_URL}/Audio/Ui/hover.webm`,
  hover_s: `${ASSET_BASE_URL}/Audio/Ui/hover_s.webm`,
  nock: `${ASSET_BASE_URL}/Audio/Ui/nock.webm`,
  back: `${ASSET_BASE_URL}/Audio/Ui/nock.webm`,
  close: `${ASSET_BASE_URL}/Audio/Ui/nock.webm`,
  hide_modal: `${ASSET_BASE_URL}/Audio/Ui/nock.webm`,
  turn_on: `${ASSET_BASE_URL}/Audio/Ui/turn_on.webm`,
  toggle_on: `${ASSET_BASE_URL}/Audio/Ui/turn_on.webm`,
  complete_task: `${ASSET_BASE_URL}/Audio/Ui/turn_on.webm`,
  turn_off: `${ASSET_BASE_URL}/Audio/Ui/turn_off.webm`,
  toggle_off: `${ASSET_BASE_URL}/Audio/Ui/turn_off.webm`,
  loading: `${ASSET_BASE_URL}/Audio/Ui/loading.webm`,
  load: `${ASSET_BASE_URL}/Audio/Ui/loading.webm`,
  bumper_end: `${ASSET_BASE_URL}/Audio/Ui/bumper_end.webm`,
  confirm: `${ASSET_BASE_URL}/Audio/Ui/bumper_end.webm`,
  action: `${ASSET_BASE_URL}/Audio/Ui/bumper_end.webm`,
  send_message: `${ASSET_BASE_URL}/Audio/Ui/klick.webm`,
};

export interface RadioTrack {
  id: string;
  title: string;
  filename: string;
  fileUrl: string;
  active: boolean;
}

const KNOWN_TRACKS: Array<{ num: string; name: string; title: string }> = [
  { num: "001", name: "Mii_Maker_Tomodachi_Life", title: "Mii Maker — Tomodachi Life" },
  { num: "002", name: "Dock_List_Tomodachi_Life", title: "Dock List — Tomodachi Life" },
  { num: "003", name: "January_2014_Nintendo_eShop_Music", title: "Nintendo eShop — Jan 2014" },
  {
    num: "004",
    name: "Yoshis_On_The_Beach_Yoshi_s_Story",
    title: "Yoshi's on the Beach — Yoshi's Story",
  },
  { num: "005", name: "Editing_a_Mii_Mii_Maker_Nintendo_Wii_U", title: "Editing a Mii — Wii U" },
  { num: "006", name: "Common_Kuruma_de_DS", title: "Common Theme — Kuruma de DS" },
  { num: "007", name: "Map_Day_Tomodachi_Life", title: "Map Day — Tomodachi Life" },
  { num: "008", name: "Town_Hall_Tomodachi_Life", title: "Town Hall — Tomodachi Life" },
  { num: "009", name: "Miitomo_Summer_Shop", title: "Summer Shop — Miitomo" },
  {
    num: "010",
    name: "Aqua_Area_Kirby_s_Return_to_Dream_Land",
    title: "Aqua Area — Kirby's Return to Dream Land",
  },
  { num: "011", name: "Rest_Area_Kirby_Super_Star", title: "Rest Area — Kirby Super Star" },
  { num: "012", name: "Nintendogs_Record_Nintendogs", title: "Record Theme — Nintendogs" },
  {
    num: "013",
    name: "Flower_Fields_Kirby_s_Epic_Yarn",
    title: "Flower Fields — Kirby's Epic Yarn",
  },
  { num: "014", name: "Nintendo_Wii_Mii_Channel_Theme", title: "Mii Channel Theme — Wii" },
  {
    num: "015",
    name: "Yarn_Yoshi_Takes_Shape_Yoshi_s_Woolly_World",
    title: "Yarn Yoshi — Yoshi's Woolly World",
  },
  {
    num: "016",
    name: "Able_Sisters_Sabel_and_Mable_Animal_Crossing_New_Leaf",
    title: "Able Sisters — Animal Crossing New Leaf",
  },
  {
    num: "017",
    name: "Bouncy_Beanstalk_Walk_Yoshi_s_New_Island",
    title: "Bouncy Beanstalk Walk — Yoshi's New Island",
  },
  { num: "018", name: "Bubblaine_Super_Mario_Odyssey", title: "Bubblaine — Super Mario Odyssey" },
  { num: "019", name: "Golf_Results_Wii_Sports", title: "Golf Results — Wii Sports" },
  {
    num: "020",
    name: "Flower_Fields_Kirby_s_Epic_Yarn",
    title: "Flower Fields (Encore) — Kirby's Epic Yarn",
  },
  { num: "021", name: "World_1_Yoshi_s_Woolly_World", title: "World 1 — Yoshi's Woolly World" },
  {
    num: "022",
    name: "Trunk_Twister_Underwater_Donkey_Kong_Country_Tropical_Freeze",
    title: "Trunk Twister Underwater — DKC Tropical Freeze",
  },
];

/**
 * Builds the complete list of 49 Bananto Radio tracks from assets.banan.to/Audio/Music/
 */
export function getDefaultRadioTracks(): RadioTrack[] {
  const tracks: RadioTrack[] = [];

  // Tracks 1 to 22
  for (const item of KNOWN_TRACKS) {
    const filename = `${item.num}_${item.name}.webm`;
    tracks.push({
      id: item.num,
      title: item.title,
      filename,
      fileUrl: `${ASSET_BASE_URL}/Audio/Music/${filename}`,
      active: true,
    });
  }

  // Tracks 23 to 49: Donkey Kong Country Simian Segue Parts 01..27
  for (let i = 23; i <= 49; i++) {
    const trackNum = String(i).padStart(3, "0");
    const partNum = String(i - 22).padStart(2, "0");
    const filename = `${trackNum}_Donkey_Kong_Country_Simian_Segue_Part_${partNum}.webm`;
    tracks.push({
      id: trackNum,
      title: `Donkey Kong Country — Simian Segue (Part ${partNum})`,
      filename,
      fileUrl: `${ASSET_BASE_URL}/Audio/Music/${filename}`,
      active: true,
    });
  }

  return tracks;
}

/* ------------------------------------------------------------------ *
 * Nintendo case geometry — canonical 3D models
 * ------------------------------------------------------------------ */

/**
 * The reusable Nintendo keep-case geometry lives in Cloudflare R2 and nowhere
 * else. R2 is the production source of truth for it; the frontend bundle never
 * carries a copy.
 *
 * ## Why it is not fetched from `assets.banan.to` directly
 *
 * It used to be, at `https://assets.banan.to/Pages/Glb/SwitchCase.glb`, and that
 * is still the object's home. What broke was not the object: a Cloudflare rule
 * on the zone answers **any request whose path ends in `.glb`** with a managed
 * challenge — an HTML "Just a moment…" page carrying `403` and
 * `content-type: text/html`. Verified against the live zone:
 *
 * ```
 * /Pages/Glb/SwitchCase.glb   -> 403 text/html  (cf-mitigated: challenge)
 * /Images/Services/test.glb   -> 403 text/html  (different path, same extension)
 * /Pages/Glb/test.webp        -> 404            (same path, different extension)
 * /Images/Services/Hang_Banner.webp -> 200 image/webp
 * ```
 *
 * So the extension is the trigger, not the object and not the prefix.
 * `GLTFLoader` received `<!DOCTYPE html>` where it expected the `glTF` magic
 * and threw a parse error, which reads exactly like a corrupted file. It is
 * not one.
 *
 * The fix keeps R2 canonical and stops feeding the loader a URL the edge will
 * challenge: the Worker streams the same R2 object from a same-origin,
 * extension-less path (`/api/model/...`, see src/routes/api/model/$.ts). That
 * also makes the fetch same-origin, so the model needs no CORS grant at all.
 */
export const NINTENDO_MODEL_R2_PREFIX = "Pages/Glb/";

/** Same-origin Worker path that streams a model out of the R2 bucket. */
export const NINTENDO_MODEL_ROUTE = "/api/model/";

/**
 * Bumped only when the bytes behind a key change. It rides the URL so a
 * replaced model invalidates just this object's cache entry, never the site's.
 */
export const NINTENDO_MODEL_VERSION = "1";

/**
 * Platform → canonical R2 object key.
 *
 * Both platforms resolve to the same geometry **on purpose**. A Switch 2 game
 * ships in the same physical keep case as a Switch 1 game — same dimensions,
 * same sleeve, same fold — and only the shell tint differs, which is a material
 * property the renderer already sets from `platform`. Duplicating 200 KB of
 * identical vertices to recolour plastic would be waste, and Part 18 of the
 * media contract is explicit that a product does not need its own GLB just
 * because its artwork differs.
 *
 * The map exists so that if a genuinely different Switch 2 geometry is ever
 * authored, it is added here as one line and every viewer picks it up — no
 * component learns a filename.
 */
export const NINTENDO_CASE_MODELS = {
  /** Nintendo Switch (and everything that ships in the standard keep case). */
  switch: "SwitchCase.glb",
  /** Nintendo Switch 2 — same keep-case geometry, red shell set by material. */
  switch2: "SwitchCase.glb",
} as const;

export type NintendoCasePlatform = keyof typeof NINTENDO_CASE_MODELS;

/**
 * Normalises the many spellings the catalogue uses for a platform down to the
 * two the model map knows. Anything unrecognised is a Switch 1 case, which is
 * the physical default for a Nintendo game.
 *
 * `both` (a game sold for Switch and Switch 2) deliberately resolves to
 * Switch 1: backward compatibility is not evidence that the copy in the
 * customer's hand is a Switch 2 edition.
 */
export function normalizeCasePlatform(platform: unknown): NintendoCasePlatform {
  const raw = String(platform ?? "")
    .toLowerCase()
    .replace(/[\s_-]/g, "");
  if (raw === "switch2" || raw === "ns2" || raw === "nintendoswitch2") return "switch2";
  return "switch";
}

/** The canonical R2 object key for a platform's case geometry. */
export function nintendoCaseModelKey(platform: unknown): string {
  return `${NINTENDO_MODEL_R2_PREFIX}${NINTENDO_CASE_MODELS[normalizeCasePlatform(platform)]}`;
}

/**
 * The URL the 3D viewer loads. Same-origin and extension-less by design — see
 * the note on {@link NINTENDO_MODEL_R2_PREFIX}.
 */
export function nintendoCaseModelUrl(platform: unknown): string {
  const file = NINTENDO_CASE_MODELS[normalizeCasePlatform(platform)];
  const name = file.replace(/\.glb$/i, "");
  return `${NINTENDO_MODEL_ROUTE}${name}?v=${NINTENDO_MODEL_VERSION}`;
}

/**
 * Direct R2 address of a model. Kept for diagnostics and for tooling that talks
 * to the bucket; **not** what the browser loads, because of the `.glb` rule.
 */
export function nintendoCaseModelR2Url(platform: unknown): string {
  return `${ASSET_BASE_URL}/${nintendoCaseModelKey(platform)}`;
}
