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
