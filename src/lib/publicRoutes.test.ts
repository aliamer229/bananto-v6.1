import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routeTree = readFileSync("src/routeTree.gen.ts", "utf8");
const deployVerifier = readFileSync("scripts/verify-deployment.mjs", "utf8");

describe("linked public routes", () => {
  it.each([
    ["policy", "/policy"],
    ["wallet", "/wallet"],
  ])("ships the %s file route in the generated route tree", (file, path) => {
    expect(readFileSync(`src/routes/${file}.tsx`, "utf8")).toContain(
      `createFileRoute("${path}")`,
    );
    expect(routeTree).toContain(`path: '${path}'`);
  });

  it("blocks a production release if policy or wallet returns the application 404", () => {
    expect(deployVerifier).toContain('VERIFY_PATHS || "/,/policy,/wallet"');
    expect(deployVerifier).toContain("application404");
  });
});
