import { describe, expect, it } from "vitest";

import { rejectCrossSiteMutation, safeRemoteImageUrl } from "./security.server";

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
