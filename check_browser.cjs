const puppeteer = require("puppeteer");
(async () => {
  const browser = await puppeteer.launch({ args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  const page = await browser.newPage();
  page.on("console", (msg) => console.log("BROWSER CONSOLE:", msg.text()));
  page.on("pageerror", (err) => console.log("BROWSER ERROR:", err.message));
  page.on("requestfailed", (request) => {
    console.log("BROWSER REQUEST FAILED:", request.url(), request.failure().errorText);
  });
  await page
    .goto("http://localhost:3000", { waitUntil: "networkidle2" })
    .catch((e) => console.log("GOTO ERROR:", e.message));
  await browser.close();
})();
