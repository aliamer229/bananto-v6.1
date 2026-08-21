import { describe, expect, it } from "vitest";

import {
  rejectCrossSiteMutation,
  safeRemoteImageUrl,
  withSecurityHeaders,
} from "./security.server";

describe("request security boundaries", () => {
  it("blocks cross-site cookie API mutations", async () => {
    const response = rejectCrossSiteMutation(
      new Request("https://banan.to/api/profile", {
        method: "POST",
        headers: { origin: "https://attacker.invalid", "sec-fetch-site": "cross-site" },
      }),
    );
    expect(response?.status).toBe(403);
    expect(await response?.json()).toEqual({ error: "cross_site_request_blocked" });
  });

  it("allows same-origin mutations and signed webhook endpoints", () => {
    expect(
      rejectCrossSiteMutation(
        new Request("https://banan.to/api/profile", {
          method: "POST",
          headers: { origin: "https://banan.to", "sec-fetch-site": "same-origin" },
        }),
      ),
    ).toBeUndefined();
    expect(
      rejectCrossSiteMutation(
        new Request("https://banan.to/api/public/telegram/webhook", {
          method: "POST",
          headers: { origin: "https://api.telegram.org", "sec-fetch-site": "cross-site" },
        }),
      ),
    ).toBeUndefined();
  });

  it("stops documents being reused after a deploy without revalidating", () => {
    const html = withSecurityHeaders(
      new Response("<!doctype html><p>hi</p>", {
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
      new URL("https://banan.to/"),
    );
    expect(html.headers.get("cache-control")).toBe("private, no-cache, must-revalidate");
  });

  it("leaves an explicit cache-control alone, and does not touch non-documents", () => {
    const asset = withSecurityHeaders(
      new Response("body{}", {
        headers: {
          "content-type": "text/css",
          "cache-control": "public, max-age=31536000, immutable",
        },
      }),
    );
    expect(asset.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");

    const json = withSecurityHeaders(
      new Response("{}", { headers: { "content-type": "application/json" } }),
    );
    expect(json.headers.get("cache-control")).toBeNull();
  });

  it("rejects private, local, credentialed, and non-HTTPS image targets", () => {
    expect(safeRemoteImageUrl("http://example.com/image.png")).toBeUndefined();
    expect(safeRemoteImageUrl("https://127.0.0.1/image.png")).toBeUndefined();
    expect(safeRemoteImageUrl("https://192.168.1.10/image.png")).toBeUndefined();
    expect(safeRemoteImageUrl("https://user:pass@example.com/image.png")).toBeUndefined();
    expect(safeRemoteImageUrl("https://images.example.com/image.png")?.hostname).toBe(
      "images.example.com",
    );
  });
});
