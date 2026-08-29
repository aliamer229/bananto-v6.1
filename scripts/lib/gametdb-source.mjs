/**
 * GameTDB as a fallback for the roles Nintendo's store record does not carry.
 *
 * Two things make it worth the trip. It publishes `coverfullHQ`, which is the
 * printed sleeve — back, spine and front in one image — at 2454 × 1888, an
 * aspect of 1.300 against the 3D model's authored 1236/951 = 1.2997. That is
 * the wrap the sleeve wants, and nothing on the eShop provides it. And it
 * publishes per-region art, including JA and ZH, which matters for a shop
 * selling Japanese and Hong Kong accounts.
 *
 * The plain `cover` endpoint is a 160 × 260 thumbnail and is deliberately not
 * used: the front cover is cropped out of the high-resolution wrap instead,
 * using the same three-panel geometry the model documents.
 *
 * The id is derived from Nintendo's own `productCode` — `HACPAAAAA` → `AAAAA` —
 * and every derived URL is fetched and verified before anything is stored. A
 * string that looks like an asset url is not evidence that an asset is there.
 */

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

/** Regions in the order this shop cares about them. */
export const REGION_PRIORITY = ["US", "EN", "JA", "ZH"];

/**
 * Nintendo's product code carries the GameTDB id after its platform prefix.
 * `HACPAAAAA` is Breath of the Wild, whose GameTDB id is `AAAAA`.
 */
export function gameTdbId(productCode) {
  const code = String(productCode ?? "").trim().toUpperCase();
  const m = code.match(/^HAC[A-Z]?([A-Z0-9]{4,5})$/);
  return m ? m[1] : "";
}

export function wrapUrl(id, region) {
  return `https://art.gametdb.com/switch/coverfullHQ/${region}/${id}.jpg`;
}

/**
 * The front panel's slice of the wrap.
 *
 * The sleeve is 588 px of back, 60 of spine and 588 of front across 1236, so
 * the front begins at 648/1236 of the width and runs to the edge. Those are the
 * model's own numbers, which is why this is an extraction rather than a guess.
 */
export const FRONT_PANEL = { start: 648 / 1236, width: 588 / 1236 };

export async function cropFrontPanel(buffer, sharp) {
  const meta = await sharp(buffer).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) throw new Error("wrap has no dimensions");
  const left = Math.round(width * FRONT_PANEL.start);
  const panel = Math.round(width * FRONT_PANEL.width);
  return sharp(buffer)
    .extract({ left, top: 0, width: Math.min(panel, width - left), height })
    .toBuffer();
}

/**
 * Fetches the first region whose wrap actually answers with an image.
 *
 * @returns {Promise<null | {buffer: Buffer, url: string, region: string}>}
 */
export async function fetchWrap(id, { regions = REGION_PRIORITY, timeoutMs = 25_000 } = {}) {
  if (!id) return null;
  for (const region of regions) {
    const url = wrapUrl(id, region);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { headers: { "user-agent": UA, accept: "image/*" }, signal: ctl.signal });
      if (!res.ok) continue;
      const buffer = Buffer.from(await res.arrayBuffer());
      // A 404 page served as 200 would not start with the JPEG marker.
      if (buffer.length < 1024 || buffer[0] !== 0xff || buffer[1] !== 0xd8) continue;
      return { buffer, url, region };
    } catch {
      continue;
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}
