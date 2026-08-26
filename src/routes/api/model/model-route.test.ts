import { afterEach, describe, expect, it } from "vitest";

import { serveNintendoModel } from "./$";

/**
 * The route between Cloudflare R2 and `GLTFLoader`.
 *
 * The behaviour that matters most here is the 502: in August 2026 the public
 * asset host answered the model's `.glb` URL with a Cloudflare challenge page,
 * `GLTFLoader` tried to parse `<!DOCTYPE html>` as a model, and the resulting
 * magic-number error was read as file corruption — which led to a real 200 KB
 * model being replaced by a hand-made 6 KB box. This route refuses to pass a
 * non-GLB payload downstream so that mistake cannot be made from the same
 * evidence again.
 */

/** A minimal, structurally valid GLB: header + JSON chunk + BIN chunk. */
function makeGlb(overrides: { magic?: number; declaredLength?: number } = {}): Uint8Array {
  const json = Buffer.from(JSON.stringify({ asset: { version: "2.0" } }), "utf8");
  const jsonPad = (4 - (json.length % 4)) % 4;
  const jsonChunk = Buffer.concat([json, Buffer.alloc(jsonPad, 0x20)]);
  const bin = Buffer.alloc(16, 7);

  const total = 12 + 8 + jsonChunk.length + 8 + bin.length;
  const out = Buffer.alloc(total);
  out.writeUInt32LE(overrides.magic ?? 0x46546c67, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(overrides.declaredLength ?? total, 8);
  out.writeUInt32LE(jsonChunk.length, 12);
  out.write("JSON", 16, "latin1");
  jsonChunk.copy(out, 20);
  const binHeader = 20 + jsonChunk.length;
  out.writeUInt32LE(bin.length, binHeader);
  out.write("BIN\0", binHeader + 4, "latin1");
  bin.copy(out, binHeader + 8);
  return new Uint8Array(out);
}

/** Stands in for the BANANTO_BUCKET R2 binding. */
function stubBucket(objects: Record<string, { bytes: Uint8Array; etag?: string }>) {
  const seen: string[] = [];
  const bucket = {
    get: async (key: string) => {
      seen.push(key);
      const hit = objects[key];
      if (!hit) return null;
      return {
        text: async () => "",
        arrayBuffer: async () =>
          hit.bytes.buffer.slice(
            hit.bytes.byteOffset,
            hit.bytes.byteOffset + hit.bytes.byteLength,
          ) as ArrayBuffer,
        size: hit.bytes.byteLength,
        etag: hit.etag ?? "abc123",
        httpMetadata: { contentType: "model/gltf-binary" },
      };
    },
    put: async () => undefined,
    list: async () => ({ objects: [] }),
    delete: async () => undefined,
  };
  (globalThis as { __CF_ENV__?: Record<string, unknown> }).__CF_ENV__ = {
    BANANTO_BUCKET: bucket,
  };
  return { seen };
}

const KEY = "Pages/Glb/SwitchCase.glb";
const req = (headers: Record<string, string> = {}) =>
  new Request("https://banan.to/api/model/SwitchCase?v=1", { headers });

afterEach(() => {
  delete (globalThis as { __CF_ENV__?: unknown }).__CF_ENV__;
});

describe("serving the canonical model from R2", () => {
  it("streams the R2 object with a model content type", async () => {
    const glb = makeGlb();
    const { seen } = stubBucket({ [KEY]: { bytes: glb } });

    const res = await serveNintendoModel("SwitchCase", req());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("model/gltf-binary");
    expect(res.headers.get("content-length")).toBe(String(glb.byteLength));
    // Cloudflare R2 is the source — the bytes are never read from disk.
    expect(seen).toEqual([KEY]);

    const body = new Uint8Array(await res.arrayBuffer());
    expect(Buffer.from(body.slice(0, 4)).toString("latin1")).toBe("glTF");
  });

  it("accepts the name with or without the .glb suffix", async () => {
    stubBucket({ [KEY]: { bytes: makeGlb() } });
    expect((await serveNintendoModel("SwitchCase", req())).status).toBe(200);
    expect((await serveNintendoModel("SwitchCase.glb", req())).status).toBe(200);
  });

  it("caches hard and immutably, and answers a matching ETag with 304", async () => {
    stubBucket({ [KEY]: { bytes: makeGlb(), etag: "v1etag" } });

    const first = await serveNintendoModel("SwitchCase", req());
    expect(first.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    const etag = first.headers.get("etag");
    expect(etag).toBe('"v1etag"');

    const second = await serveNintendoModel("SwitchCase", req({ "if-none-match": etag! }));
    expect(second.status).toBe(304);
  });

  it("answers a range request, which mobile Safari and GLTFLoader both make", async () => {
    const glb = makeGlb();
    stubBucket({ [KEY]: { bytes: glb } });

    const res = await serveNintendoModel("SwitchCase", req({ range: "bytes=0-11" }));
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe(`bytes 0-11/${glb.byteLength}`);
    expect(res.headers.get("accept-ranges")).toBe("bytes");
    expect((await res.arrayBuffer()).byteLength).toBe(12);
  });
});

describe("it refuses to pass off a non-model as a model", () => {
  it("returns 502 for an HTML error page stored or proxied in place of the GLB", async () => {
    // The exact payload that caused the original misdiagnosis.
    const html = new TextEncoder().encode(
      "<!DOCTYPE html><html><head><title>Just a moment...</title></head></html>",
    );
    stubBucket({ [KEY]: { bytes: html } });

    const res = await serveNintendoModel("SwitchCase", req());
    expect(res.status).toBe(502);
    expect(await res.text()).toMatch(/not a GLB/i);
  });

  it("returns 502 for a truncated model rather than a half-parsed one", async () => {
    const glb = makeGlb({ declaredLength: 999999 });
    stubBucket({ [KEY]: { bytes: glb } });

    const res = await serveNintendoModel("SwitchCase", req());
    expect(res.status).toBe(502);
    expect(await res.text()).toMatch(/truncated/i);
  });

  it("returns 404 when the object is genuinely absent", async () => {
    stubBucket({});
    expect((await serveNintendoModel("SwitchCase", req())).status).toBe(404);
  });

  it("degrades to 503 with no bucket binding instead of throwing", async () => {
    delete (globalThis as { __CF_ENV__?: unknown }).__CF_ENV__;
    const res = await serveNintendoModel("SwitchCase", req());
    expect(res.status).toBe(503);
  });
});

describe("only registered models are reachable", () => {
  it("refuses a name that is not a canonical model", async () => {
    stubBucket({ [KEY]: { bytes: makeGlb() } });
    for (const name of ["EvilModel", "secret", "SwitchCase2"]) {
      expect((await serveNintendoModel(name, req())).status, name).toBe(404);
    }
  });

  it("refuses traversal and separators outright", async () => {
    stubBucket({ [KEY]: { bytes: makeGlb() } });
    for (const name of ["../../etc/passwd", "a/b", "Switch Case", ""]) {
      expect((await serveNintendoModel(name, req())).status, name).toBe(404);
    }
  });
});
