// @vitest-environment node
import { describe, expect, it } from "vitest";

import { youtubeEmbed, youtubeId, youtubeThumbnail } from "@/lib/hub";

/**
 * Every video card on every product was painting an empty grey rectangle.
 *
 * `Media.tsx` renders `<SmartImage src={cdnImage(video.thumbnailUrl)} …>`, and
 * nothing in the catalogue pipeline ever set `thumbnailUrl` — so `SmartImage`
 * took its no-source branch, which draws a plain gradient at whatever size the
 * card reserved. Measured on a desktop product page: 766x430 of empty grey in
 * the middle of "شاهد اللعبة".
 *
 * The poster was never missing; it was simply never derived. YouTube hosts one
 * for every upload at a URL built from the video id we already parse.
 */
describe("a video card knows its own poster", () => {
  const ID = "dQw4w9WgXcQ";

  it("finds the id in every URL shape the catalogue carries", () => {
    for (const url of [
      `https://www.youtube.com/watch?v=${ID}`,
      `https://youtu.be/${ID}`,
      `https://www.youtube.com/embed/${ID}`,
      `https://www.youtube.com/shorts/${ID}`,
      `https://m.youtube.com/watch?v=${ID}&t=42s`,
    ]) {
      expect(youtubeId(url), url).toBe(ID);
    }
  });

  it("builds a poster URL from it", () => {
    expect(youtubeThumbnail(`https://youtu.be/${ID}`)).toBe(
      `https://img.youtube.com/vi/${ID}/hqdefault.jpg`,
    );
  });

  it("uses hqdefault, the only size YouTube guarantees exists", () => {
    // `maxresdefault` 404s for plenty of uploads, and a 404 here puts the empty
    // grey box straight back.
    expect(youtubeThumbnail(`https://youtu.be/${ID}`)).not.toContain("maxresdefault");
  });

  it("gives nothing rather than a broken URL when there is no video", () => {
    expect(youtubeThumbnail(undefined)).toBeUndefined();
    expect(youtubeThumbnail("")).toBeUndefined();
    expect(youtubeThumbnail("https://example.com/a-very-long-path-that-is-not-youtube")).toBeUndefined();
  });

  it("still resolves the embed from the same id", () => {
    expect(youtubeEmbed(`https://youtu.be/${ID}`)).toBe(`https://www.youtube.com/embed/${ID}`);
  });
});

describe("the catalogue attaches the poster to every video", () => {
  const read = async (p: string) => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    return readFileSync(resolve(process.cwd(), p), "utf8");
  };

  it("sets it on the trailer and on gameplay rows alike", async () => {
    const SRC = await read("src/hub/data/fromProduct.ts");
    expect(SRC.match(/thumbnailUrl/g)?.length).toBeGreaterThanOrEqual(2);
    // An explicitly stored thumbnail wins; the derived one is the fallback.
    expect(SRC).toContain('str(row["thumbnailUrl"]) || youtubeThumbnail(row["url"])');
  });
});
