/**
 * Where each media role's candidates come from, and why that is the role.
 *
 * Role is decided by **provenance**, not by inspecting pixels. Nintendo's own
 * data model already separates these: `productImage` is the retail packshot,
 * `productImage(shape:square)` is square key art served from a different CDN
 * with a different asset id, and `productGallery` images are screenshots. Using
 * where an asset sits in that model is a stronger claim than guessing from an
 * aspect ratio — which is exactly how a 16:9 gameplay screenshot ended up in a
 * hero slot in production.
 *
 * A role with no candidate is reported as needing research. It is never filled
 * from another role.
 */

import { fetchImageResolving } from "./image-probe.mjs";

/** The 3D sleeve's authored UV layout: 588 back + 60 spine + 588 front. */
export const WRAP_ASPECT = 1236 / 951;
const WRAP_TOLERANCE = 0.06;

export function looksLikeWrap(width, height) {
  if (!width || !height) return false;
  return Math.abs(width / height - WRAP_ASPECT) <= WRAP_TOLERANCE;
}

const cloudinary = (publicId, t = "f_auto,q_auto") =>
  `https://assets.nintendo.com/image/upload/${t}/${String(publicId).replace(/^\/+/, "")}`;

/**
 * Candidates per role for one resolved Nintendo store product.
 *
 * @returns {Record<string, {url: string, provenance: string}[]>}
 */
export function candidatesFor(product) {
  const out = { cartridgeImage: [], nintendoCardImage: [], coverImage: [], coverHiResImage: [], bannerImages: [], galleryImages: [] };
  if (!product) return out;

  /*
    `productImage` is not always a packshot.

    Breath of the Wild's is 1920×1080 landscape key art; Pikmin 4's is a
    vertical cover. Nintendo uses one field for whichever image it has, so the
    asset is offered to both the front-box and the hero role and the measured
    shape decides which it satisfies. A portrait image can only land in
    cartridgeImage, a landscape one only in coverImage, and the caller's
    duplicate check stops it being used twice.
  */
  const boxId = String(product.productImage?.publicId ?? "").replace(/^\/+/, "");
  const productImageUrl = boxId ? cloudinary(boxId) : String(product.productImage?.url ?? "");
  if (productImageUrl) {
    out.cartridgeImage.push({
      url: productImageUrl,
      provenance: "Nintendo eShop productImage, offered as a packshot if it is portrait",
    });
    out.coverImage.push({
      url: productImageUrl,
      provenance: "Nintendo eShop productImage, offered as hero key art if it is landscape",
    });
  }

  const squareUrl = String(product['productImage({"shape":"square"})']?.url ?? "");
  if (squareUrl && squareUrl !== product.productImage?.url) {
    out.nintendoCardImage.push({
      url: squareUrl,
      provenance: "Nintendo eShop square productImage — a separate asset, not the packshot resized",
    });
  }

  for (const asset of product.productGallery ?? []) {
    if (asset?.resourceType !== "image") continue;
    const id = String(asset.publicId ?? "").replace(/^\/+/, "");
    if (!id || /\/Video\//i.test(id) || id === boxId) continue;
    out.galleryImages.push({ url: cloudinary(id), provenance: "Nintendo eShop productGallery — a screenshot" });
  }

  /*
    No printed wrap exists in the store record, so coverHiResImage stays empty —
    which is the correct outcome, because the 3D sleeve composes one from the
    front cover when no wrap is supplied. Banners have no candidate here either;
    a screenshot is not key art and is not promoted into that role.
  */
  return out;
}

/**
 * Validates one candidate: fetch it, prove it is an image, measure it.
 *
 * @param sharp the sharp module, passed in so this file stays dependency-free
 */
export async function validateCandidate(candidate, role, sharp) {
  const probe = await fetchImageResolving(candidate.url);
  const base = {
    role,
    source: candidate.url,
    resolved: probe.resolved ?? candidate.url,
    provenance: candidate.provenance,
    status: probe.status ?? null,
    contentType: probe.contentType ?? "",
    kind: probe.kind,
  };
  if (!probe.ok) return { ...base, ok: false, reason: probe.kind + (probe.detail ? `: ${probe.detail}` : "") };

  let meta;
  try {
    meta = await sharp(probe.buffer).metadata();
  } catch (err) {
    return { ...base, ok: false, reason: `undecodable: ${String(err).slice(0, 60)}` };
  }
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;

  // A 1×1 tracking pixel or a 60px spacer is technically an image and useless.
  if (width < 200 || height < 200) {
    return { ...base, ok: false, width, height, reason: `too small (${width}×${height})` };
  }

  const aspect = width / height;
  const shape = aspect > 1.15 ? "landscape" : aspect < 0.87 ? "portrait" : "square";
  const expected = {
    cartridgeImage: "portrait",
    nintendoCardImage: "square",
    coverImage: "landscape",
    coverHiResImage: "landscape",
    galleryImages: "landscape",
    bannerImages: "landscape",
  }[role];

  const shapeOk = role === "coverHiResImage" ? looksLikeWrap(width, height) : shape === expected;

  return {
    ...base,
    ok: true,
    buffer: probe.buffer,
    width,
    height,
    aspect: Math.round(aspect * 1000) / 1000,
    shape,
    shapeOk,
    sniffed: probe.sniffed,
    reason: shapeOk ? "" : `shape is ${shape} (${width}×${height}), the role wants ${expected}`,
  };
}
