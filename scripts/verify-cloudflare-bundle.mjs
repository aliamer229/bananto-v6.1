#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const expectedMain = "dist/server/server.js";
const config = readFileSync(resolve("wrangler.jsonc"), "utf8");

function fail(message) {
  console.error(`Cloudflare bundle verification failed: ${message}`);
  process.exit(1);
}

if (!new RegExp(`"main"\\s*:\\s*"${expectedMain.replaceAll("/", "\\/")}"`).test(config)) {
  fail(`wrangler.jsonc must point main to ${expectedMain}`);
}

if (!/"class_name"\s*:\s*"ChatRealtimeDO"/.test(config)) {
  fail("CHAT_REALTIME_DO is not bound to ChatRealtimeDO");
}

const bundlePath = resolve(expectedMain);
if (!existsSync(bundlePath)) fail(`${expectedMain} was not produced by Vite`);

let worker;
try {
  worker = await import(`${pathToFileURL(bundlePath).href}?verify=${Date.now()}`);
} catch (error) {
  fail(`unable to import ${expectedMain}: ${error?.stack || error}`);
}

if (typeof worker.ChatRealtimeDO !== "function") {
  fail("named export ChatRealtimeDO is missing");
}
if (typeof worker.default?.fetch !== "function") fail("default fetch handler is missing");
if (typeof worker.default?.queue !== "function") fail("default queue handler is missing");
if (typeof worker.default?.scheduled !== "function") fail("default scheduled handler is missing");

console.log("Cloudflare bundle verified: fetch, queue, scheduled, and ChatRealtimeDO are exported.");
