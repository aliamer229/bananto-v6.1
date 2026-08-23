# Nintendo product imagery

How a product's artwork is chosen, framed and delivered. One page, because the
whole point of this design is that the decision lives in one place.

## The problem it replaced

Every surface used to pick its own field:

| surface                        | order it used                                        |
| ------------------------------ | ---------------------------------------------------- |
| home strips (`getNintendoCardImage`) | `cartridgeImage → image → coverImage → … → gallery → banner → hardcoded table` |
| hub / product page (`fromProduct`)   | `coverImage → image → cartridgeImage`          |
| hub (`normalizeHubGame`)             | `coverImage → cartridgeImage → image → banners[0]` |
| header search                        | `image → coverImage → cartridgeImage`          |
| cart, local lines                    | `line.image → image → coverImage → cartridgeImage` |
| cart, server lines                   | `image → cartridgeImage → coverImage`          |
| bundle card                          | `image → cartridgeImage → coverImage → bundle.image` |
| add-to-cart toast (product page)     | `variant.image → option.image → **gallery[0]**` |

So one product could legitimately show four different pictures on four screens,
a banner or a screenshot could stand in for a box cover, and a title containing
"mario party" got a hardcoded *banner* of a different game. There was no bug in
any single component — the bug was that the decision had no owner.

## The fields

| field                | meaning                                                     |
| -------------------- | ----------------------------------------------------------- |
| `cartridgeImage`     | **canonical front box cover** — vertical retail packshot     |
| `cartridgeImageTrim` | precomputed crop rectangle for it (fractions, `0..1`)        |
| `nintendoCardImage`  | square / near-square art for compact platform cards          |
| `coverHiResImage`    | optional print-resolution front cover, for the 3D texture    |
| `coverImage`, `image` | legacy front-cover carriers, kept as fallbacks               |
| `galleryImages`, `gallery` | screenshots — never a cover                            |
| `bannerImage`, `banner`, `regionBanner` | wide key art — never a cover              |

`cartridgeImage` keeps its database name (thousands of rows and the whole import
template use it) but its *meaning* is fixed: a clean rectangular front cover.

## The resolver

`src/lib/nintendoImages.ts` — `resolveNintendoImage(product, usage)`.

```
front-cover / listing-card / bundle-card / cart / toast
  cartridgeImage → coverImage → coverUrl → box_front_url → boxFrontUrl
  → image → mainImage → imageUrl → placeholder

square-card
  nintendoCardImage → squareGameImage → squareImage → (front-cover chain)
  → placeholder

3d-texture
  coverHiResImage → coverHiRes → textureSourceImage → (front-cover chain)
  → placeholder

banner
  bannerImage → banner → keyArtUrl → regionBanner → gallery → placeholder
```

Two rules make the old bugs impossible rather than merely fixed:

- **A banner or gallery frame is never promoted into a cover slot.** A product
  with only screenshots shows the placeholder, because a wrong picture reads as
  a data error to a customer while a placeholder reads as "artwork pending".
- **A cover never falls back to a banner**, and the square asset never stands in
  for a cover.

`resolvePurchaseImage(product)` is the shared entry point for the cart, the
bundle card and the add-to-cart toast, so all three cannot disagree about the
same purchase.

## The crop

`src/lib/imageTrim.ts` — `computeTrimBox(rgba, w, h)`.

Store feeds hand back the same packshot two ways: tight, or floating in a white
field. The second makes a cover grid look like scattered stamps. The trim finds
the artwork's real bounding box so the render layer frames the *artwork* rather
than the *file*.

Plain pixel arithmetic — no model, no network, no per-game rules. Same bytes,
same box, every time.

1. Analyse a ≤320px downsample.
2. If the border is mostly transparent, use alpha bounds; otherwise take the
   median border colour as background.
3. Refuse outright if that background is not light and near-neutral (luminance
   ≥ 0.86, channel spread ≤ 12) — a dark or coloured edge is artwork bleeding to
   the frame, and cropping against it would cut into the picture.
4. Refuse if under 90% of border pixels match it.
5. Walk rows and columns inward while ≥ 98.5% of each matches the background.
6. Add a safe inset back (0.6% of the shorter side) so anti-aliased edges and
   thin keylines survive.
7. Refuse the result if it trims under 1.5% (already tight), keeps under 25% of
   the area or 30% of either side (over-crop), or lands outside a 0.4–1.7 aspect
   band (a sliver or a banner).

`null` is the safe answer and it is the answer whenever the evidence is thin —
the image is then shown untouched.

### Where it runs

Never on a render path. Three layers, cheapest first:

1. **Stored.** The admin editor measures the cover on save and writes
   `cartridgeImageTrim`. Products saved that way need no client work at all, and
   the crop is already in the server-rendered HTML.
2. **Session cache.** `localStorage`, keyed by URL, bounded to 400 entries and
   versioned so a change to the algorithm invalidates old entries.
3. **One idle measurement** per genuinely unseen URL, shared by every card on
   the page through an in-flight map, and cached for layer 2.

### How it is applied

`src/components/NintendoCover.tsx` frames it with two nested boxes and no
JavaScript at paint time: an outer fixed-ratio slot, and an inner window at the
*trimmed* artwork's aspect. The image inside is scaled by `1/width` and offset so
the crop lands on the window exactly. The file's pixels are never resampled,
stretched or re-encoded.

## The 3D sleeve

`src/SwitchBox3D.tsx`. The GLB's `placeholder` mesh is one printed insert whose
UVs run back │ spine │ front, so handing it a front-only cover as the map
stretched that cover across all three panels. The sleeve is composited on a
canvas instead, sized so the **front panel is at least as wide as the source
artwork** (capped by `gl.capabilities.maxTextureSize` and by 4096), with the
crop applied so no texel is spent on white margin.

Also: `SRGBColorSpace`, mipmaps, `LinearMipmapLinearFilter`, and anisotropy from
`gl.capabilities.getMaxAnisotropy()` — the box is always seen at an angle, which
is exactly the case anisotropic filtering exists for, and it was at 1. The
`<Canvas>` sets `dpr={[1, 2]}` and an explicit `outputColorSpace`. Switching
product disposes the previous texture.

## Import

`front_cover_image` is the name to write in new templates; `cartridge_image`
remains accepted and maps to the same field. `nintendo_card_image` and
`front_cover_hires_url` are the new keys.

`src/lib/imageValidation.ts` has two levels:

- `validateImageUrlShape` is pure string work, runs on every `url` field during
  parsing, and rejects what broken feeds actually emit — `"[object Object]"`,
  the literal `"undefined"`/`"null"`, whitespace-only cells, `javascript:`.
- `inspectImageAsset` fetches and measures: reachable, actually an image, big
  enough, plausible aspect for its role, not a banner in a cover field, not
  blank. It returns the crop too, since the file is already decoded.

Both report warnings, never fatal errors. One dead thumbnail must not reject the
other thirty-nine games in a batch.

## Checks

```sh
npm test -- imageTrim nintendoImages imageValidation   # algorithm + resolver
npm run dev &                                          # then, against it:
npm run check:overflow                                 # 320/360/375/390/430/768
node scripts/make-cover-fixtures.mjs                   # /dev-fixtures/* to eyeball
```
