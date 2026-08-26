import { createFileRoute } from "@tanstack/react-router";

import { guard } from "@/lib/http.server";
import { getPublicBucket } from "@/lib/public-assets.server";
import { safeStorageKey } from "@/lib/storage.server";
import { NINTENDO_CASE_MODELS, NINTENDO_MODEL_R2_PREFIX } from "@/config/publicAssets";

/**
 * Streams a canonical 3D model out of Cloudflare R2, same-origin.
 *
 * ## Why this route exists
 *
 * The models live in R2 and R2 stays their only home — this handler copies
 * nothing, caches nothing locally and owns no bytes of its own. It exists
 * purely because the public asset hostname cannot serve them: a rule on the
 * zone answers **any URL path ending in `.glb`** with a Cloudflare managed
 * challenge (`403`, `content-type: text/html`, `cf-mitigated: challenge`).
 * `GLTFLoader` then parses `<!DOCTYPE html>`, fails on the magic number, and
 * the failure looks exactly like a corrupt model. It never was one — see the
 * note in src/config/publicAssets.ts for the probe results that isolate the
 * extension as the trigger.
 *
 * Serving the same object from this extension-less path sidesteps the rule
 * without weakening it, and makes the fetch same-origin so the model needs no
 * cross-origin grant at all.
 *
 * ## What it guarantees the loader
 *
 * - `model/gltf-binary`, so the loader never has to sniff.
 * - A verified `glTF` magic number. If the bucket ever hands back an error page
 *   or a truncated object, this returns `502` instead of passing HTML off as a
 *   model — the failure mode that caused the original misdiagnosis.
 * - Immutable caching plus a strong `ETag`, so a browser and the Cloudflare
 *   edge each store it once. Replacing a model means bumping
 *   `NINTENDO_MODEL_VERSION`, which changes only this object's cache entry.
 * - `Range` support, because `GLTFLoader` and some mobile Safari builds probe
 *   with a range request before reading the body.
 */

/** Only names registered as canonical models may be requested. */
const ALLOWED_MODELS = new Set<string>(Object.values(NINTENDO_CASE_MODELS));

const GLB_MAGIC = 0x46546c67; // 'glTF' little-endian

function immutableHeaders(extra: Record<string, string>): Headers {
  const headers = new Headers({
    "content-type": "model/gltf-binary",
    // A model is content-addressed by NINTENDO_MODEL_VERSION, so it can be
    // cached hard. Nothing else on the site shares this cache entry.
    "cache-control": "public, max-age=31536000, immutable",
    "x-content-type-options": "nosniff",
    // Same-origin in production, but a preview deploy on another host still
    // has to be able to read it, and geometry is not sensitive.
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, HEAD, OPTIONS",
    "accept-ranges": "bytes",
    ...extra,
  });
  return headers;
}

/** Parses a single `bytes=` range against a known length. */
function parseRange(header: string | null, size: number): { start: number; end: number } | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) return null;

  let start: number;
  let end: number;
  if (!rawStart) {
    // Suffix range: the last N bytes.
    const suffix = Number(rawEnd);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd ? Number(rawEnd) : size - 1;
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start > end || start >= size) return null;
  return { start, end: Math.min(end, size - 1) };
}

/**
 * The handler proper, exported so it can be exercised directly against a stub
 * bucket. Everything the route guarantees — the allowlist, the magic-number
 * check, ranges — is decided here.
 */
export async function serveNintendoModel(splat: string, request: Request): Promise<Response> {
  // The URL is extension-less on purpose; the `.glb` is added back here
  // because that is the real object name in the bucket.
  const name = splat.replace(/\.glb$/i, "");
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(name)) {
    return new Response("Not found", { status: 404 });
  }

  const filename = `${name}.glb`;
  if (!ALLOWED_MODELS.has(filename)) {
    return new Response("Not found", { status: 404 });
  }

  const key = `${NINTENDO_MODEL_R2_PREFIX}${filename}`;
  if (!safeStorageKey(key)) {
    return new Response("Not found", { status: 404 });
  }

  const bucket = getPublicBucket();
  if (!bucket) {
    // No binding (local dev without wrangler). Say so plainly rather
    // than inventing a model — the viewer degrades to its 2D case.
    return new Response("Model storage unavailable", { status: 503 });
  }

  const object = await bucket.get(key);
  if (!object) {
    return new Response("Not found", { status: 404 });
  }

  // Read once: the models are ~200 KB, well inside a Worker's budget,
  // and the magic-number check below is the whole point of this route.
  const buffer = typeof object.arrayBuffer === "function" ? await object.arrayBuffer() : null;
  if (!buffer || buffer.byteLength < 12) {
    return new Response("Model unreadable", { status: 502 });
  }

  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== GLB_MAGIC) {
    // Whatever this is, it is not a GLB. Refusing here is what stops an
    // error page reaching GLTFLoader and being reported as corruption.
    console.error("[model] non-GLB payload in R2", {
      key,
      size: buffer.byteLength,
      head: new TextDecoder().decode(bytes.slice(0, 4)),
    });
    return new Response("Model payload is not a GLB", { status: 502 });
  }

  const declared = view.getUint32(8, true);
  if (declared !== buffer.byteLength) {
    console.error("[model] GLB length mismatch", {
      key,
      declared,
      actual: buffer.byteLength,
    });
    return new Response("Model payload is truncated", { status: 502 });
  }

  const etag = object.etag ? `"${object.etag.replace(/"/g, "")}"` : undefined;
  if (etag && request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: immutableHeaders({ etag }) });
  }

  const range = parseRange(request.headers.get("range"), bytes.byteLength);
  if (range) {
    const slice = bytes.slice(range.start, range.end + 1);
    return new Response(slice as unknown as BodyInit, {
      status: 206,
      headers: immutableHeaders({
        "content-length": String(slice.byteLength),
        "content-range": `bytes ${range.start}-${range.end}/${bytes.byteLength}`,
        ...(etag ? { etag } : {}),
      }),
    });
  }

  return new Response(bytes as unknown as BodyInit, {
    status: 200,
    headers: immutableHeaders({
      "content-length": String(bytes.byteLength),
      ...(etag ? { etag } : {}),
    }),
  });
}

export const Route = createFileRoute("/api/model/$")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: immutableHeaders({ "cache-control": "public, max-age=86400" }),
        }),

      GET: async ({ params, request }) =>
        guard(
          () => serveNintendoModel((params as { _splat?: string })._splat ?? "", request),
          "api/model",
        ),
    },
  },
});
