import { describe, expect, it } from "vitest";

import {
  fetchImage,
  isViewerUrl,
  looksLikeHtml,
  resolveViewerUrl,
  sniffImage,
} from "./lib/image-probe.mjs";

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(32),
]);
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);
const webp = Buffer.concat([
  Buffer.from("RIFF", "latin1"),
  Buffer.from([0, 0, 0, 0]),
  Buffer.from("WEBPVP8 ", "latin1"),
  Buffer.alloc(16),
]);
const html = Buffer.from("<!DOCTYPE html>\n<html><head><title>viewer</title></head></html>");

describe("sniffImage", () => {
  it("recognises the formats this catalogue actually stores", () => {
    expect(sniffImage(png)).toBe("image/png");
    expect(sniffImage(jpeg)).toBe("image/jpeg");
    expect(sniffImage(webp)).toBe("image/webp");
    expect(sniffImage(Buffer.from("GIF89a" + "x".repeat(20), "latin1"))).toBe("image/gif");
  });

  it("does not mistake a web page for an image", () => {
    expect(sniffImage(html)).toBeNull();
    expect(sniffImage(Buffer.from('{"error":"not found","code":404}'))).toBeNull();
  });

  it("has nothing to say about a body too short to identify", () => {
    expect(sniffImage(Buffer.from([0xff, 0xd8]))).toBeNull();
    expect(sniffImage(null)).toBeNull();
  });
});

describe("looksLikeHtml", () => {
  it("recognises a page whatever it leads with", () => {
    expect(looksLikeHtml(html)).toBe(true);
    expect(looksLikeHtml(Buffer.from("  \n<html lang=en>"))).toBe(true);
    expect(looksLikeHtml(png)).toBe(false);
  });
});

describe("resolveViewerUrl", () => {
  it("turns a Switch Images Julio viewer page into the asset it displays", () => {
    expect(
      resolveViewerUrl("https://cdn.switch-images-julio.com/file/switch-images-julio/display/index.html?code=A7HLA"),
    ).toBe("https://cdn.switch-images-julio.com/file/switch-images-julio/A7HLA/front.png");
  });

  it("leaves an asset url alone", () => {
    const asset = "https://cdn.switch-images-julio.com/file/switch-images-julio/A7HLA/front.png";
    expect(resolveViewerUrl(asset)).toBe(asset);
    expect(resolveViewerUrl("https://assets.nintendo.com/image/upload/x/y")).toBe(
      "https://assets.nintendo.com/image/upload/x/y",
    );
  });

  it("survives an empty or absent value", () => {
    expect(resolveViewerUrl("")).toBe("");
    expect(resolveViewerUrl(null)).toBe("");
  });
});

describe("isViewerUrl", () => {
  it("names the shape the admin form keeps rejecting", () => {
    expect(isViewerUrl("https://cdn.switch-images-julio.com/file/switch-images-julio/display/index.html?code=A7HLA")).toBe(true);
    expect(isViewerUrl("https://cdn.switch-images-julio.com/file/switch-images-julio/A7HLA/front.png")).toBe(false);
  });
});

describe("fetchImage", () => {
  it("refuses a value that is not a url before touching the network", async () => {
    expect((await fetchImage("")).kind).toBe("empty");
    expect((await fetchImage("data:image/png;base64,AAAA")).kind).toBe("embedded");
    expect((await fetchImage("/api/files/products/x/y.webp")).kind).toBe("not-absolute");
  });

  it("reports a page as html rather than accepting it", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(html, { status: 200, headers: { "content-type": "text/html" } });
    try {
      const result = await fetchImage("https://example.test/viewer");
      expect(result.ok).toBe(false);
      expect(result.kind).toBe("html");
      expect(result.contentType).toBe("text/html");
    } finally {
      globalThis.fetch = original;
    }
  });

  it("refuses a page that claims to be an image", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(html, { status: 200, headers: { "content-type": "image/jpeg" } });
    try {
      const result = await fetchImage("https://example.test/lying");
      expect(result.ok).toBe(false);
      expect(result.kind).toBe("html");
    } finally {
      globalThis.fetch = original;
    }
  });

  it("accepts real bytes even when the header is vague", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(png, { status: 200, headers: { "content-type": "application/octet-stream" } });
    try {
      const result = await fetchImage("https://example.test/real.png");
      expect(result.ok).toBe(true);
      expect(result.sniffed).toBe("image/png");
      expect(result.buffer).toBeInstanceOf(Buffer);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("reports an error status instead of storing the error body", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async () => new Response("not found", { status: 404 });
    try {
      const result = await fetchImage("https://example.test/gone.png");
      expect(result.ok).toBe(false);
      expect(result.kind).toBe("http-error");
      expect(result.status).toBe(404);
    } finally {
      globalThis.fetch = original;
    }
  });
});
