#!/usr/bin/env node
import { chromium } from "playwright-core";
import { mkdir, writeFile } from "node:fs/promises";

const BASELINE_URL = process.env.BASELINE_URL ?? "http://127.0.0.1:4173";
const RESTORED_URL = process.env.RESTORED_URL ?? "http://127.0.0.1:4174";
const OUTPUT_DIR = process.env.OUTPUT_DIR ?? "visual-restoration";
const CHROMIUM_PATH = process.env.CHROMIUM_PATH || undefined;

const VIEWPORTS = [
  { name: "320x568", width: 320, height: 568 },
  { name: "375x667", width: 375, height: 667 },
  { name: "390x844", width: 390, height: 844 },
  { name: "430x932", width: 430, height: 932 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "1024x1366", width: 1024, height: 1366 },
  { name: "1440x900", width: 1440, height: 900 },
];

const svgData = (label, width, height, from, to = from) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>
      <rect width="100%" height="100%" rx="18" fill="url(#g)"/>
      <circle cx="${width * 0.2}" cy="${height * 0.2}" r="${Math.min(width, height) * 0.12}" fill="rgba(255,255,255,.22)"/>
      <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" fill="white" font-family="Arial" font-weight="800" font-size="${Math.max(18, Math.min(width, height) * 0.1)}">${label}</text>
    </svg>`)} `;

const game = (id, title, platform, color) => ({
  id,
  slug: title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
  title,
  titleEn: title,
  category: "nintendo_games",
  categoryId: "nintendo_games",
  kind: "game",
  schemaId: "nintendo-switch-game",
  platform,
  developer: "Nintendo",
  publisher: "Nintendo",
  price: platform === "switch2" ? 20000 : 15000,
  cost: 5000,
  stock: 20,
  isActive: true,
  status: "active",
  releaseDate: `202${id}-08-01`,
  metacriticRating: 8 + id / 10,
  nintendoCardImage: svgData(title, 600, 600, color, "#111827"),
  cartridgeImage: svgData(title, 600, 960, color, "#111827"),
  coverImage: svgData(title, 1200, 675, color, "#111827"),
});

const products = [
  game(1, "Mario Kart World", "switch2", "#e60012"),
  game(2, "Zelda Echoes", "switch1", "#1f8a70"),
  game(3, "Metroid Prime", "switch2", "#614ad3"),
  game(4, "Kirby Discovery", "switch1", "#ed6ea0"),
  game(5, "Donkey Kong", "switch2", "#d97706"),
  {
    id: "hw-1",
    slug: "nintendo-switch-2-console",
    title: "Nintendo Switch 2 Console",
    titleEn: "Nintendo Switch 2 Console",
    category: "hardware",
    categoryId: "hardware",
    kind: "hardware",
    schemaId: "hardware",
    developer: "Nintendo",
    price: 725000,
    cost: 600000,
    stock: 4,
    isActive: true,
    status: "active",
    image: svgData("SWITCH 2", 1000, 700, "#232323", "#6b7280"),
  },
  {
    id: "acc-1",
    slug: "pro-controller",
    title: "Nintendo Pro Controller",
    titleEn: "Nintendo Pro Controller",
    category: "accessories",
    categoryId: "accessories",
    kind: "accessory",
    schemaId: "accessory",
    developer: "Nintendo",
    price: 125000,
    cost: 90000,
    stock: 12,
    isActive: true,
    status: "active",
    image: svgData("PRO CONTROLLER", 1000, 700, "#374151", "#111827"),
  },
];

const fixture = {
  products,
  categories: [
    { id: "nintendo_games", title: "ألعاب نينتندو سويتش", type: "game" },
    { id: "hardware", title: "أجهزة الهاردوير", type: "hardware" },
    { id: "accessories", title: "الملحقات", type: "accessory" },
  ],
  banners: [
    {
      id: "visual-baseline",
      title: "Bananto Nintendo Store",
      subtitle: "Original cream visual identity",
      imageUrl: svgData("BANANTO", 1600, 700, "#e60012", "#7f1d1d"),
      isActive: true,
    },
  ],
  bundles: [
    {
      id: "bundle-1",
      title: "Nintendo Adventure Bundle",
      price: 30000,
      originalPrice: 45000,
      gameIds: [1, 2, 3],
      isActive: true,
      badge: "وفر 33%",
    },
  ],
  settings: {},
};

await mkdir(OUTPUT_DIR, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  ...(CHROMIUM_PATH ? { executablePath: CHROMIUM_PATH } : {}),
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const report = [];

for (const stage of [
  { name: "before", base: BASELINE_URL },
  { name: "after", base: RESTORED_URL },
]) {
  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
      locale: "ar-IQ",
      isMobile: viewport.width < 700,
      hasTouch: viewport.width < 700,
      colorScheme: "light",
    });
    await context.addCookies([
      { name: "bananto_theme", value: "cream", url: stage.base },
      { name: "bananto_lang", value: "ar", url: stage.base },
      { name: "bananto_lang_manual", value: "1", url: stage.base },
    ]);
    const page = await context.newPage();

    await page.route("**/api/data?*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "x-catalog-version": "1" },
        body: JSON.stringify(fixture),
      });
    });
    await page.route("**/api/auth*", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: '{"user":null}' });
    });
    await page.route("https://telegram.org/**", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
    });
    await page.route("https://assets.banan.to/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "image/svg+xml",
        body: decodeURIComponent(svgData("BANANTO", 900, 500, "#9a3412", "#f59e0b").split(",")[1].trim()),
      });
    });

    const response = await page.goto(`${stage.base}/`, {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    // The first viewport also pays Vite's cold compilation cost. Do not accept
    // a shell-only screenshot as visual evidence: wait for the first catalogue
    // heading that proves hydration and the mocked catalogue both completed.
    let contentReady = true;
    try {
      await page.getByText("ألعاب نينتندو سويتش").first().waitFor({
        state: "visible",
        timeout: 30_000,
      });
    } catch {
      contentReady = false;
    }
    await page.waitForTimeout(600);
    await page.evaluate(async () => {
      const browser = globalThis;
      for (let y = 0; y < browser.document.body.scrollHeight; y += 450) {
        browser.scrollTo(0, y);
        await new Promise((resolve) => setTimeout(resolve, 35));
      }
      browser.scrollTo(0, 0);
    });
    await page.waitForTimeout(900);

    const metrics = await page.evaluate(() => {
      const browser = globalThis;
      const root = browser.getComputedStyle(browser.document.documentElement);
      const body = browser.getComputedStyle(browser.document.body);
      return {
        statusTheme: browser.document.documentElement.dataset.theme,
        direction: browser.document.documentElement.dir,
        innerWidth: browser.innerWidth,
        scrollWidth: browser.document.documentElement.scrollWidth,
        overflow:
          browser.document.documentElement.scrollWidth > browser.innerWidth + 1,
        bodyBackground: body.backgroundColor,
        bodyFont: body.fontFamily,
        tokens: {
          page: root.getPropertyValue("--page").trim(),
          surface: root.getPropertyValue("--surface").trim(),
          line: root.getPropertyValue("--line").trim(),
          radius: root.getPropertyValue("--radius").trim(),
          cartRed: root.getPropertyValue("--cart-red").trim(),
          cartShell: root.getPropertyValue("--cart-shell").trim(),
        },
      };
    });

    const screenshot = `${OUTPUT_DIR}/${stage.name}-${viewport.name}.png`;
    await page.screenshot({ path: screenshot, fullPage: true });
    report.push({
      stage: stage.name,
      viewport: viewport.name,
      url: page.url(),
      httpStatus: response?.status() ?? null,
      screenshot,
      contentReady,
      ...metrics,
    });
    await context.close();
  }
}

await browser.close();

const after = report.filter((row) => row.stage === "after");
const acceptance = {
  contentReady: after.every((row) => row.contentReady),
  noOverflow: after.every((row) => !row.overflow),
  creamTokens: after.every(
    (row) =>
      row.tokens.page === "#f4f1e8" &&
      row.tokens.surface === "#f8f5f1" &&
      row.tokens.line === "#d6cdc2",
  ),
  cartridgeTokens: after.every(
    (row) => row.tokens.cartRed === "#e60012" && row.tokens.cartShell === "#1c1c1c",
  ),
};

await writeFile(
  `${OUTPUT_DIR}/report.json`,
  JSON.stringify({ acceptance, results: report }, null, 2),
  "utf8",
);

console.log(JSON.stringify(acceptance));
if (!Object.values(acceptance).every(Boolean)) process.exitCode = 1;
