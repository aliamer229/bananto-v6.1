# The Nintendo case model

Where the 3D game case comes from, why it is fetched the way it is, and how to
check it before touching it.

## One model, every game

The GLB is **reusable physical geometry** — a moulded Nintendo keep case
authored in Blender, three meshes, no textures baked in:

| node          | mesh        | material  | what it is                             |
| ------------- | ----------- | --------- | -------------------------------------- |
| `box`         | `Cube.023`  | `plastic` | the shell, 5294 vertices               |
| `foil`        | `Plane.002` | `foil`    | the protective sheen                   |
| `placeholder` | `Plane.004` | `wap`     | the printed sleeve the artwork goes on |

Every Nintendo game in the store renders on this same geometry. What changes per
product is the artwork painted onto `placeholder`, which comes from the
product's own media fields. **A game never needs its own GLB because its cover
differs.**

Switch and Switch 2 share the geometry too. A Switch 2 game ships in the same
physical keep case — same dimensions, same sleeve, same fold — and only the
shell tint differs, which `SwitchBox3D` sets as a material property from
`platform`. `NINTENDO_CASE_MODELS` in `src/config/publicAssets.ts` maps platform
→ object key, so if a genuinely different Switch 2 body is ever authored it is
one line there and every viewer picks it up.

Backward compatibility is not evidence of platform: a game marked `both`
resolves to the Switch 1 case, because "runs on either console" does not mean
the copy in the customer's hand is a Switch 2 edition.

## The texture contract

`placeholder`'s authored UVs lay the three faces out left→right across one
image:

```
  U 0.000 ─────────────── 0.473 ── 0.526 ─────────────── 1.000
         │      BACK           │ SPINE │      FRONT          │
```

V runs top→bottom (0 at the top edge), which is image order — so the texture is
uploaded with `flipY = false`.

`SwitchBox3D` composites its canvas to exactly that: **1236 × 951**, split
588 back + 60 spine + 588 front. Those numbers are read off the model's own
`TEXCOORD_0` accessor, not invented, and they are the same proportions as the
blank case template (`public/textures/GZAfvAF3.jpg`, which is 1236 × 951).

**Do not rewrite the UVs.** If the artwork looks wrong, the bug is in which
image was chosen or how it was composited. `src/config/nintendoModel.test.ts`
pins the canvas split against the UV seams so the two cannot drift apart.

## Cloudflare R2 is the source of truth

The canonical object is:

```
bucket  bananto  (binding BANANTO_BUCKET)
key     Pages/Glb/SwitchCase.glb
public  https://assets.banan.to/Pages/Glb/SwitchCase.glb
```

Nothing else is canonical. There is no GLB in `/public`, `/src/assets` or the
frontend bundle, and there must not be one.

### Why the browser does not load that URL directly

A rule on the zone answers **any request whose path ends in `.glb`** with a
Cloudflare managed challenge. Probed against the live zone:

| URL                                 | result                                           |
| ----------------------------------- | ------------------------------------------------ |
| `/Pages/Glb/SwitchCase.glb`         | `403 text/html`, `cf-mitigated: challenge`       |
| `/Images/Services/test.glb`         | `403 text/html` — different path, same extension |
| `/Pages/Glb/test.webp`              | `404` — same path, different extension           |
| `/Images/Services/Hang_Banner.webp` | `200 image/webp`                                 |

So the trigger is the **extension**, not the object and not the prefix. A
browser asking for the model got `<!DOCTYPE html><title>Just a moment…` where it
expected the `glTF` magic number, `GLTFLoader` threw a parse error, and the
whole thing read as a corrupt file.

It was not corrupt. In August 2026 that misreading led to the 200 KB authored
model being replaced, in `/public`, by a hand-made 6 KB `BoxGeometry` +
`PlaneGeometry` scene — right node names, roughly right UV seams, but a flat
24-vertex box instead of a moulded case.

The fix keeps R2 canonical and stops handing the loader a URL the edge will
challenge: **the Worker streams the same R2 object from a same-origin,
extension-less path.**

```
D1 product ─ platform ─→ NINTENDO_CASE_MODELS ─→ Pages/Glb/SwitchCase.glb
                                                          │
                       /api/model/SwitchCase?v=1 ←── BANANTO_BUCKET (R2)
                                  │
                          useGLTF → three.js → WebGL
```

`src/routes/api/model/$.ts` also:

- serves `model/gltf-binary`, so the loader never sniffs;
- **verifies the `glTF` magic number and the declared length**, returning `502`
  rather than passing an error page or a truncated object downstream — this is
  what stops the same misdiagnosis being made from the same evidence again;
- caches `public, max-age=31536000, immutable` with a strong `ETag`, versioned
  by `NINTENDO_MODEL_VERSION` so replacing a model invalidates that one object
  and not the site;
- supports `Range`, which `GLTFLoader` and some mobile Safari builds use;
- is same-origin, so the model needs no CORS grant at all;
- serves only names registered in `NINTENDO_CASE_MODELS` — traversal and
  arbitrary keys are `404`.

## Performance

The model must never touch first paint.

- `CaseStage` lazy-imports `CaseStageWebGL`, so three.js is its own chunk and
  loads only on a product page.
- There is **no** module-scope `useGLTF.preload`. The old one fired the moment
  anything imported `SwitchBox3D`, putting 200 KB on the wire during the
  storefront's first paint for a viewer only the product page shows.
- `useGLTF` caches the model, so the second product opened costs nothing.

Verified in a real browser: loading the homepage and `/nintendo_games` issues
zero `/api/model/` and zero three.js requests, on both desktop and mobile
viewports.

## When it fails

The product page keeps working. WebGL absent, R2 unreachable, model refused —
in every case `CaseStage` falls back to the flat 2D case, the rest of the page
renders normally, no spinner is left running, and the model is requested **once**
(no retry loop). The reason is logged to the console for diagnosis.

## Before you replace anything

A rendering error, a texture error, a CORS failure, a wrong URL, a loader
misconfiguration and a UV problem are **not** evidence that the object is
corrupt. Only binary validation is.

```sh
npm run verify:model                                  # the route and the R2 object
node scripts/verify-nintendo-model.mjs ./Some.glb     # a local candidate
node scripts/verify-nintendo-model.mjs --origin https://staging.example
```

It checks the GLB header and chunk lengths, the node and material names the
renderer looks up, that every primitive has UVs, that no artwork is baked in,
that the sleeve is _folded_ rather than flat, and that the UV seams still match
the canvas split. It also tells an edge refusal apart from a bad object, and
says so in the output.

The known-good model:

```
size    204,940 bytes
sha256  756f6669c7f79bdfd76f75bb878980c10b94499f1d68b0e75359e87d33a7845a
md5     12ee4324f9c66fd7c73127796c7d3d70
```

If — and only if — validation proves the R2 object itself is corrupt: back up
the existing object, replace it at the **same key**, bump
`NINTENDO_MODEL_VERSION`, purge only that object's cache entry, and re-run the
verifier against production. Do not add a local copy.
