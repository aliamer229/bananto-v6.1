import { describe, expect, it, vi } from "vitest";
import {
  isSafeRemoteImageUrl,
  sniffImageMimeType,
  buildMediaRequestHeaders,
  fetchRemoteMedia,
  fetchRemoteImageWithRetry,
} from "./mediaIngest.server";
import { sanitizeAndVerifyProductImages } from "./productImageVerification.server";

describe("mediaIngest SSRF & Validation", () => {
  it("rejects private, loopback, and metadata URLs", () => {
    const invalidUrls = [
      "http://localhost:3000/image.jpg",
      "http://127.0.0.1/secret.png",
      "http://10.0.0.1/img.jpg",
      "http://192.168.1.100/test.png",
      "http://172.16.0.5/test.png",
      "http://169.254.169.254/latest/meta-data",
      "http://metadata.google.internal/computeMetadata/v1/",
      "ftp://example.com/image.jpg",
      "javascript:alert(1)",
    ];

    for (const url of invalidUrls) {
      expect(isSafeRemoteImageUrl(url)).toBeNull();
    }
  });

  it("accepts valid public URLs from all required retail & gaming CDNs", () => {
    const validUrls = [
      "https://assets.nintendo.com/image/upload/v1/switch/game.jpg?w=1920&q=80",
      "https://img-eshop.cdn.nintendo.net/i/38a0f0d2c94380f7d54b4a3a60c23ca5.jpg",
      "https://m.media-amazon.com/images/I/81abcXYZ._SL1500_.jpg",
      "https://images-na.ssl-images-amazon.com/images/I/71xyz.jpg",
      "https://i5.walmartimages.com/asr/12345-6789.jpeg?odnHeight=612&odnWidth=612&odnBg=FFFFFF",
      "https://multimedia.bbycastatic.ca/multimedia/products/500x500/171/17188/17188123.jpg",
      "https://bfasset.costco-static.com/images/bc/12345/hero.jpg?auto=webp&format=jpg&width=800",
      "https://www.tradeinn.com/f/13812/13812345/nintendo-switch-game.jpg",
      "https://images.igdb.com/igdb/image/upload/t_cover_big/co49wj.webp",
      "https://thecoverproject.net/view.php?cover_id=12345",
      "http://example.com/images/cover.png",
    ];

    for (const url of validUrls) {
      const parsed = isSafeRemoteImageUrl(url);
      expect(parsed).not.toBeNull();
      expect(parsed?.protocol).toMatch(/^https?:$/);
    }
  });

  it("builds source-specific headers for major retail and gaming CDNs", () => {
    const nintendoHeaders = buildMediaRequestHeaders("https://assets.nintendo.com/art.jpg");
    expect(nintendoHeaders["Referer"]).toContain("nintendo.com");
    expect(nintendoHeaders["User-Agent"]).toContain("Mozilla");

    const eshopHeaders = buildMediaRequestHeaders("https://img-eshop.cdn.nintendo.net/i/cover.jpg");
    expect(eshopHeaders["Referer"]).toContain("nintendo.com");

    const amazonHeaders = buildMediaRequestHeaders("https://m.media-amazon.com/images/I/81test.jpg");
    expect(amazonHeaders["Referer"]).toContain("amazon.com");

    const walmartHeaders = buildMediaRequestHeaders("https://i5.walmartimages.com/asr/test.jpg");
    expect(walmartHeaders["Referer"]).toContain("walmart.com");

    const bestbuyHeaders = buildMediaRequestHeaders("https://multimedia.bbycastatic.ca/products/test.jpg");
    expect(bestbuyHeaders["Referer"]).toContain("bestbuy.com");

    const costcoHeaders = buildMediaRequestHeaders("https://bfasset.costco-static.com/images/test.jpg");
    expect(costcoHeaders["Referer"]).toContain("costco.com");

    const tradeinnHeaders = buildMediaRequestHeaders("https://www.tradeinn.com/f/game.jpg");
    expect(tradeinnHeaders["Referer"]).toContain("tradeinn.com");

    const coverProjectHeaders = buildMediaRequestHeaders("https://www.thecoverproject.net/view.php");
    expect(coverProjectHeaders["Referer"]).toContain("thecoverproject.net");
  });
});

describe("sniffImageMimeType Magic Numbers", () => {
  it("detects PNG magic bytes", () => {
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(sniffImageMimeType(pngBytes)).toBe("image/png");
  });

  it("detects JPEG magic bytes", () => {
    const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(sniffImageMimeType(jpegBytes)).toBe("image/jpeg");
  });

  it("detects WebP magic bytes", () => {
    // 'RIFF' .... 'WEBP'
    const webpBytes = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
    ]);
    expect(sniffImageMimeType(webpBytes)).toBe("image/webp");
  });

  it("detects GIF magic bytes", () => {
    const gifBytes = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
    expect(sniffImageMimeType(gifBytes)).toBe("image/gif");
  });

  it("detects AVIF magic bytes", () => {
    // 4 bytes, then 'ftyp'
    const avifBytes = new Uint8Array([
      0x00, 0x00, 0x00, 0x1c, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66,
    ]);
    expect(sniffImageMimeType(avifBytes)).toBe("image/avif");
  });

  it("returns undefined for HTML or random non-image bytes", () => {
    const htmlBytes = new TextEncoder().encode("<!DOCTYPE html><html><body>Error 503</body></html>");
    expect(sniffImageMimeType(htmlBytes)).toBeUndefined();
  });
});

describe("sanitizeAndVerifyProductImages Media Isolation Guarantee", () => {
  it("never fails the product import when remote images return HTTP 503 or fail", async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockImplementation(async (input: any) => {
      const url = typeof input === "string" ? input : input?.url || "";
      if (url.includes("api.cloudflare.com")) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ success: true, result: [{ results: [] }] }),
          json: async () => ({ success: true, result: [{ results: [] }] }),
        } as any;
      }
      return {
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
        headers: new Headers({ "retry-after": "1" }),
        arrayBuffer: async () => new ArrayBuffer(0),
        text: async () => JSON.stringify({ error: "Service Unavailable" }),
      } as any;
    });

    try {
      const incomingProduct = {
        id: "game_dynasty_warriors_origins",
        titleEn: "Dynasty Warriors: Origins",
        title: "داينستي ووريورز: أوريجينز",
        price: 59.99,
        cartridgeImage: "https://assets.nintendo.com/image/upload/dw_origins_503.jpg",
        coverHiResImage: "https://thecoverproject.net/dw_origins_wrap_503.jpg",
        gallery: [
          "https://cdn.example.com/dw_screenshot1_503.jpg",
          "https://cdn.example.com/dw_screenshot2_503.jpg",
        ],
      };

      const result = await sanitizeAndVerifyProductImages(incomingProduct);

      // The import must succeed (ok: true)
      expect(result.ok).toBe(true);
      expect(result.product).toBeDefined();
      expect(result.product.id).toBe("game_dynasty_warriors_origins");
      expect(result.product.titleEn).toBe("Dynasty Warriors: Origins");

      // Original URLs are preserved for subsequent repair rather than lost
      expect(result.product.cartridgeImage).toBe(
        "https://assets.nintendo.com/image/upload/dw_origins_503.jpg"
      );
      expect(result.product.coverHiResImage).toBe(
        "https://thecoverproject.net/dw_origins_wrap_503.jpg"
      );
      expect(result.warnings).toBeDefined();
      expect(result.warnings?.length).toBeGreaterThan(0);
    } finally {
      global.fetch = originalFetch;
    }
  }, 15000);

  it("safely accepts pre-stored R2 URLs", async () => {
    const incomingProduct = {
      id: "game_zelda_totk",
      titleEn: "The Legend of Zelda: Tears of the Kingdom",
      price: 69.99,
      cartridgeImage: "/api/files/products/game_zelda_totk/cartridge-abc123.webp",
      coverHiResImage: "/api/files/products/game_zelda_totk/wrap-xyz789.webp",
    };

    const result = await sanitizeAndVerifyProductImages(incomingProduct);
    expect(result.ok).toBe(true);
    expect(result.product.cartridgeImage).toBe("/api/files/products/game_zelda_totk/cartridge-abc123.webp");
    expect(result.product.coverHiResImage).toBe("/api/files/products/game_zelda_totk/wrap-xyz789.webp");
  });
});
