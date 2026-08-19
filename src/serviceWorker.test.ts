// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SW_PATH = resolve(process.cwd(), "public/sw.js");
const ROUTE_PATH = resolve(process.cwd(), "src/routes/sw.ts");

describe("service worker", () => {
  it("is valid JavaScript and registers one fetch handler", () => {
    const source = readFileSync(SW_PATH, "utf8");

    expect(() => new Function(source)).not.toThrow();
    expect(source.match(/addEventListener\("fetch"/g)).toHaveLength(1);
  });

  it("never caches session endpoints or HTML navigations", () => {
    const source = readFileSync(SW_PATH, "utf8");

    expect(source).toContain('request.mode === "navigate"');
    expect(source).toContain('url.pathname.startsWith("/api/auth")');
    expect(source).toContain('url.pathname.startsWith("/api/profile")');
  });

  it("is served by the Cloudflare worker with the right headers", () => {
    const route = readFileSync(ROUTE_PATH, "utf8");

    expect(route).toContain("sw.js?raw");
    expect(route).toContain("text/javascript");
    expect(route).toContain("service-worker-allowed");
    expect(route).toContain("no-store");
  });
});
