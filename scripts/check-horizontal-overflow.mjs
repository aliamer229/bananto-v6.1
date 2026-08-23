#!/usr/bin/env node
/**
 * Fails if any page can be scrolled sideways on a phone.
 *
 * A page that overflows horizontally does not merely gain a scrollbar. Mobile
 * Safari zooms the whole document out to fit `scrollWidth`, which is what
 * produces the "empty band down one side with everything shifted" look — and in
 * RTL the band lands on the left. Because the symptom is a *zoom*, it is easy to
 * misread as a styling problem and paper over with `overflow-x: hidden`; that
 * hides the scrollbar and keeps the shrink-to-fit.
 *
 * So this checks two things, and `overflow-x: hidden` on an ancestor satisfies
 * neither by itself:
 *
 * 1. `document.documentElement.scrollWidth <= window.innerWidth + 1`
 * 2. no element's box escapes the viewport unless a real scroll container
 *    (`overflow-x` other than `visible`) contains it
 *
 * Usage:
 *   node scripts/check-horizontal-overflow.mjs [--base http://localhost:3000]
 *                                              [--widths 320,360,375,390,430,768]
 *                                              [--paths /,/cart]
 *                                              [--json report.json]
 *
 * Expects a dev or preview server already running at `--base`.
 */
import { chromium } from "playwright-core";
import { writeFileSync } from "node:fs";

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .join(" ")
    .matchAll(/--([\w-]+)(?:[= ]([^\s-][^\s]*))?/g)
    .map((m) => [m[1], m[2] ?? "true"]),
);

const BASE = args.base ?? process.env.BASE_URL ?? "http://localhost:3000";
/** The widths in the acceptance criteria: small Android, iPhone SE/mini/std/Max, tablet. */
const WIDTHS = (args.widths ?? "320,360,375,390,430,768").split(",").map(Number);
const PATHS = (
  args.paths ??
  ["/", "/games", "/category/nintendo-switch-games", "/bundles", "/cart", "/faq", "/support"].join(
    ",",
  )
).split(",");
const SETTLE = Number(args.settle ?? 5000);
/**
 * Extra cookies, so authenticated surfaces (the admin dashboard, the inbox, the
 * wallet) can be swept too — those are exactly the dense screens where a stray
 * fixed width shows up first. Format: `name=value; name2=value2`.
 */
const EXTRA_COOKIE = args.cookie ?? process.env.SWEEP_COOKIE ?? "";
/**
 * CSS selectors to click before measuring, one per page load. Used to open
 * dialogs and drawers: a modal that renders off-screen is invisible to a sweep
 * that never opens it.
 */
const OPEN_SELECTORS = (args.open ?? "").split("|").filter(Boolean);

/** Runs in the page. Keep it self-contained — it is serialised across. */
const PROBE = () => {
  const vw = document.documentElement.clientWidth;
  const describe = (el) => {
    const cls =
      typeof el.className === "string" && el.className
        ? "." + el.className.trim().split(/\s+/).slice(0, 5).join(".")
        : "";
    return el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + cls;
  };
  /** The nearest ancestor that actually clips or scrolls horizontally. */
  const clippedBy = (el) => {
    let p = el.parentElement;
    while (p) {
      if (getComputedStyle(p).overflowX !== "visible") return describe(p);
      p = p.parentElement;
    }
    return null;
  };

  const escaping = [];
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (r.width < 1 && r.height < 1) continue;
    const over = Math.max(r.right - vw, -r.left);
    if (over <= 1) continue;
    if (clippedBy(el)) continue;
    const chain = [];
    let p = el.parentElement;
    for (let i = 0; p && i < 3; i++, p = p.parentElement) chain.push(describe(p));
    escaping.push({
      element: describe(el),
      overflowPx: Math.round(over),
      left: Math.round(r.left),
      right: Math.round(r.right),
      ancestors: chain,
    });
  }
  escaping.sort((a, b) => b.overflowPx - a.overflowPx);

  return {
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    clientWidth: vw,
    escaping: escaping.slice(0, 8),
  };
};

const executablePath =
  process.env.CHROMIUM_PATH ??
  (process.env.PLAYWRIGHT_BROWSERS_PATH
    ? `${process.env.PLAYWRIGHT_BROWSERS_PATH}/chromium-1194/chrome-linux/chrome`
    : undefined);

const browser = await chromium.launch({
  ...(executablePath ? { executablePath } : {}),
  args: ["--no-sandbox"],
});

const results = [];
let failures = 0;

for (const path of PATHS) {
  for (const width of WIDTHS) {
    const context = await browser.newContext({
      viewport: { width, height: 800 },
      deviceScaleFactor: 2,
      isMobile: width < 700,
      hasTouch: width < 700,
      // The storefront is Arabic / RTL by default, and RTL is where a sideways
      // overflow shows up as a blank band rather than a scrollbar.
      locale: "ar",
      extraHTTPHeaders: {
        "accept-language": "ar,en;q=0.8",
        cookie: `bananto_lang=ar; bananto_lang_manual=1${EXTRA_COOKIE ? `; ${EXTRA_COOKIE}` : ""}`,
      },
    });
    /*
      Set the session as a real cookie rather than only a request header: the
      app's own client-side fetches use the browser's cookie jar, so a
      header-only session renders the shell but leaves every authenticated
      query 401 — and an empty page cannot overflow, which would make this
      sweep quietly meaningless on admin screens.
    */
    if (EXTRA_COOKIE) {
      const jar = EXTRA_COOKIE.split(";")
        .map((pair) => pair.trim())
        .filter(Boolean)
        .map((pair) => {
          const eq = pair.indexOf("=");
          return {
            name: pair.slice(0, eq).trim(),
            value: pair.slice(eq + 1).trim(),
            url: BASE,
          };
        });
      await context.addCookies(jar);
    }

    const page = await context.newPage();
    try {
      await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.waitForTimeout(SETTLE);
      // Walk the page so lazily-mounted sections and their images exist before
      // measuring; a section that never mounted cannot overflow.
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 400) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 60));
        }
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(1200);

      // Open any dialogs the caller asked for, then let them settle.
      for (const selector of OPEN_SELECTORS) {
        try {
          const target = page.locator(selector).first();
          if (await target.count()) {
            await target.click({ timeout: 4000, force: true });
            await page.waitForTimeout(900);
          }
        } catch {
          // A selector that is not on this page is not a failure.
        }
      }

      const probe = await page.evaluate(PROBE);
      const scrolls = probe.scrollWidth > probe.innerWidth + 1;
      const ok = !scrolls && probe.escaping.length === 0;
      if (!ok) failures++;
      results.push({ path, width, ok, ...probe });

      console.log(
        `${ok ? "ok  " : "FAIL"} ${path} @ ${width}px  scrollWidth=${probe.scrollWidth} innerWidth=${probe.innerWidth}` +
          (probe.escaping.length ? `  escaping=${probe.escaping.length}` : ""),
      );
      for (const e of probe.escaping) {
        console.log(
          `       +${e.overflowPx}px  ${e.element}  [left=${e.left} right=${e.right}]\n` +
            `         inside ${e.ancestors.join(" < ")}`,
        );
      }
    } catch (error) {
      failures++;
      results.push({ path, width, ok: false, error: String(error) });
      console.log(`ERR  ${path} @ ${width}px  ${String(error).slice(0, 160)}`);
    }
    await context.close();
  }
}

await browser.close();

if (args.json) writeFileSync(args.json, JSON.stringify(results, null, 2));

console.log(
  failures
    ? `\n${failures} of ${results.length} combinations overflow horizontally`
    : `\nall ${results.length} combinations clean`,
);
process.exit(failures ? 1 : 0);
