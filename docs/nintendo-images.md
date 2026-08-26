# Nintendo product imagery

How a product's artwork is chosen, framed and delivered. One page, because the
whole point of this design is that the decision lives in one place.

## The problem it replaced

Every surface used to pick its own field:

| surface                              | order it used                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------ |
| home strips (`getNintendoCardImage`) | `cartridgeImage → image → coverImage → … → gallery → banner → hardcoded table` |
| hub / product page (`fromProduct`)   | `coverImage → image → cartridgeImage`                                          |
| hub (`normalizeHubGame`)             | `coverImage → cartridgeImage → image → banners[0]`                             |
| header search                        | `image → coverImage → cartridgeImage`                                          |
| cart, local lines                    | `line.image → image → coverImage → cartridgeImage`                             |
| cart, server lines                   | `image → cartridgeImage → coverImage`                                          |
| bundle card                          | `image → cartridgeImage → coverImage → bundle.image`                           |
| add-to-cart toast (product page)     | `variant.image → option.image → **gallery[0]**`                                |

So one product could legitimately show four different pictures on four screens,
a banner or a screenshot could stand in for a box cover, and a title containing
"mario party" got a hardcoded _banner_ of a different game. There was no bug in
any single component — the bug was that the decision had no owner.

## The fields

Storage format is not purpose. Every one of these is a WebP in Cloudflare R2 —
that describes the bytes, not what the picture _is_. A square card asset and a
vertical retail packshot are both "a WebP in R2" and are not interchangeable.

| role           | field                                                | meaning                                                  |
| -------------- | ---------------------------------------------------- | -------------------------------------------------------- |
| `square-card`  | `nintendoCardImage`                                  | square / near-square art for compact platform cards      |
| `front-box`    | `cartridgeImage`                                     | **canonical front box cover** — vertical retail packshot |
| `detail-cover` | `coverImage`                                         | the product detail page's primary cover                  |
| `3d-texture`   | `coverHiResImage`                                    | full case wrap (back + spine + front) for the 3D sleeve  |
| `banner`       | `bannerImage`, `banner`, `keyArtUrl`, `regionBanner` | wide key art — never a cover                             |
| `gallery`      | `galleryImages`, `gallery`                           | screenshots — never a cover                              |

Trim rectangles: `cartridgeImageTrim`, `coverImageTrim`, `nintendoCardImageTrim`
(fractions, `0..1`).

`cartridgeImage` keeps its database name — thousands of rows and the whole
import template use it — but its _meaning_ is fixed: the vertical front box
cover. Renaming the column would rewrite product identity for no gain, so the
name stays and the role layer above it carries the meaning.

## The resolver

`src/lib/nintendoImages.ts` — `getNintendoMedia(product, role)`.

Each role reads **only its own fields**, in order, and returns that role's
placeholder when none of them holds a usable URL:

```
square-card   nintendoCardImage → nintendo_card_image → squareGameImage
              → squareImage → square_card_image            → placeholder

front-box     cartridgeImage → cartridge_image → front_image → frontImage
              → box_front_url → boxFrontUrl → front_box_cover  → placeholder

detail-cover  coverImage → cover_image → coverUrl              → placeholder

3d-texture    coverHiResImage → coverHiRes → textureSourceImage
              → 3d_texture_source → full_cover → box_cover
              → sleeveUrl → wrapUrl                            → (nothing)

banner        bannerImage → banner → keyArtUrl → regionBanner   → placeholder

gallery       galleryImages → gallery → images                 → placeholder
```

### There is no cross-role fallback

That is the whole design. A product with no square card asset shows the
placeholder on the home strip — it does **not** borrow the front box cover,
because a wrong picture reads as a data error to a customer while a placeholder
reads as "artwork pending". The same holds in every direction: no banner into a
cover slot, no screenshot into a banner slot, no front cover into the 3D wrap
slot.

`3d-texture` returns an empty URL rather than a placeholder, because a texture
has no meaningful stand-in. When the product has no wrap, `CaseStageWebGL`
decides _out loud_ to compose one from the front box cover (`textureMode`), so
the substitution is visible in the calling code instead of hidden in a resolver.

### Callers name the role

`ProductCard`, `GameCard` and `ProductStrip` take an `imageRole` prop. The card
never guesses which picture a surface wants, because it cannot know:

| surface                       | role           |
| ----------------------------- | -------------- |
| home — "ألعاب نينتندو سويتش"  | `square-card`  |
| home — "أحدث إصدارات نينتندو" | `front-box`    |
| `/nintendo_games`             | `front-box`    |
| `/games`                      | `square-card`  |
| product detail primary cover  | `detail-cover` |
| 3D sleeve                     | `3d-texture`   |

The bug this replaced was exactly this: the resolver was fine, but `HomeView`
asked it for a listing cover and dropped the vertical packshot into the square
cartridge window.

### Non-game products

Hardware, accessories, gift cards and account bundles have no box art, so
`resolvePurchaseImage(product)` keeps a generic thumbnail chain
(`front-box fields → detail-cover fields → image → mainImage → imageUrl`). It is
the one place a generic `image` field is still read, and it still never reaches
a banner or a gallery. The cart, the bundle card and the add-to-cart toast all
share it so they cannot disagree about the same purchase.

## The crop

`src/lib/imageTrim.ts` — `computeTrimBox(rgba, w, h)`.

Store feeds hand back the same packshot two ways: tight, or floating in a white
field. The second makes a cover grid look like scattered stamps. The trim finds
the artwork's real bounding box so the render layer frames the _artwork_ rather
than the _file_.

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
_trimmed_ artwork's aspect. The image inside is scaled by `1/width` and offset so
the crop lands on the window exactly. The file's pixels are never resampled,
stretched or re-encoded.

## The 3D sleeve

See [nintendo-3d-model.md](./nintendo-3d-model.md) for the model itself — where
it lives, why it is not fetched from `assets.banan.to`, and how to verify it.

In short: `src/SwitchBox3D.tsx` renders reusable geometry streamed from
Cloudflare R2, and paints per-product artwork onto it. The `placeholder` mesh is
one printed insert whose authored UVs run back │ spine │ front, so the sleeve is
composited on a 1236 × 951 canvas (588 back + 60 spine + 588 front) matching
those UVs exactly, and uploaded with `flipY = false` because the model's V axis
runs top-to-bottom.

Two modes, chosen by the caller rather than sniffed from the image:

- **`wrap`** — a real 3D Texture Source, drawn edge to edge, untouched.
- **`composed`** — front-only art; the spine and back are generated around it.

Also: `SRGBColorSpace`, `dpr={[1, 2]}`, an explicit `outputColorSpace`, and the
canvas texture is disposed when the case unmounts so repeatedly opening product
pages on a phone does not accumulate GPU memory.

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
npm test -- nintendoImages nintendoMediaSurfaces       # resolver + rendered surfaces
npm test -- nintendoModel model-route                  # model config + R2 route
npm run verify:model                                   # the live GLB itself
npm test -- imageTrim imageValidation                  # crop + import checks
npm run dev &                                          # then, against it:
npm run check:overflow                                 # 320/360/375/390/430/768
node scripts/make-cover-fixtures.mjs                   # /dev-fixtures/* to eyeball
```
