#!/usr/bin/env node
/**
 * Verifies a Nintendo case GLB against the contract the renderer relies on.
 *
 * Written because the last time this model "broke", nothing here existed: the
 * loader threw a magic-number error, that was read as file corruption, and a
 * hand-made 6 KB box was committed over a perfectly good 200 KB model. The
 * checks below tell those two situations apart.
 *
 * Usage:
 *
 *   node scripts/verify-nintendo-model.mjs <url-or-path> [...]
 *
 * With no argument it checks the production route and the canonical R2 object:
 *
 *   node scripts/verify-nintendo-model.mjs
 *   node scripts/verify-nintendo-model.mjs --origin https://banan.to
 *   node scripts/verify-nintendo-model.mjs ./SwitchCase.glb
 *
 * Exits non-zero if any target fails.
 */

import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const GLB_MAGIC = 0x46546c67;

/**
 * What the renderer needs to exist. Mesh names come from the Blender export;
 * `src/SwitchBox3D.tsx` looks the three up by name and would silently render
 * nothing if any were renamed.
 */
const REQUIRED_NODES = ["box", "foil", "placeholder"];
const REQUIRED_MATERIALS = ["plastic", "foil"];

/**
 * The sleeve's UV layout, as authored. `SwitchBox3D` composites its canvas to
 * exactly these fractions (588 back + 60 spine + 588 front of 1236), so a model
 * whose UVs drift outside this tolerance would need the canvas changed to match
 * — never the other way round.
 */
const UV_CONTRACT = {
  backEnd: 0.4733,
  spineEnd: 0.5255,
  tolerance: 0.02,
};

function fail(msg) {
  return { ok: false, msg };
}
function pass(msg) {
  return { ok: true, msg };
}

async function load(target) {
  if (/^https?:\/\//i.test(target)) {
    const res = await fetch(target, {
      headers: {
        // Some edges answer a bare programmatic request with a challenge page.
        // Looking like a browser makes the "is the object fine?" question
        // separable from the "does the edge let me have it?" question.
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        Accept: "*/*",
      },
      redirect: "follow",
    });
    const buf = Buffer.from(await res.arrayBuffer());
    return {
      buf,
      status: res.status,
      headers: Object.fromEntries(res.headers.entries()),
    };
  }
  return { buf: await readFile(target), status: 200, headers: {} };
}

function parseGlb(buf) {
  if (buf.length < 12) throw new Error(`too small: ${buf.length} bytes`);
  if (buf.readUInt32LE(0) !== GLB_MAGIC) {
    const head = buf
      .slice(0, 16)
      .toString("latin1")
      .replace(/[^\x20-\x7e]/g, ".");
    throw new Error(`not a GLB — starts with "${head}"`);
  }
  const version = buf.readUInt32LE(4);
  const declared = buf.readUInt32LE(8);
  if (declared !== buf.length) {
    throw new Error(`length mismatch: header says ${declared}, file is ${buf.length}`);
  }

  const chunks = [];
  let off = 12;
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32LE(off);
    const type = buf.slice(off + 4, off + 8).toString("latin1");
    chunks.push({ type, len, start: off + 8 });
    off += 8 + len;
  }
  const jsonChunk = chunks.find((c) => c.type === "JSON");
  const binChunk = chunks.find((c) => c.type.startsWith("BIN"));
  if (!jsonChunk) throw new Error("no JSON chunk");
  const json = JSON.parse(
    buf.slice(jsonChunk.start, jsonChunk.start + jsonChunk.len).toString("utf8"),
  );
  return { version, json, chunks, binChunk };
}

/** Reads a float accessor straight out of the BIN chunk. */
function readAccessor(buf, json, binStart, index) {
  const acc = json.accessors[index];
  const bv = json.bufferViews[acc.bufferView];
  const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[acc.type];
  const start = binStart + (bv.byteOffset || 0);
  const out = [];
  for (let i = 0; i < acc.count; i++) {
    const row = [];
    for (let c = 0; c < comps; c++) row.push(buf.readFloatLE(start + (i * comps + c) * 4));
    out.push(row);
  }
  return out;
}

function checkModel(buf) {
  const results = [];
  const { version, json, binChunk } = parseGlb(buf);

  results.push(version === 2 ? pass(`glTF version 2`) : fail(`unexpected glTF version ${version}`));
  results.push(binChunk ? pass(`BIN chunk present (${binChunk.len} bytes)`) : fail("no BIN chunk"));
  results.push(
    json.buffers?.[0]?.byteLength === binChunk?.len
      ? pass("buffer length matches BIN chunk")
      : fail(`buffer says ${json.buffers?.[0]?.byteLength}, BIN chunk is ${binChunk?.len}`),
  );

  const nodeNames = (json.nodes || []).map((n) => n.name);
  for (const name of REQUIRED_NODES) {
    results.push(
      nodeNames.includes(name)
        ? pass(`node "${name}"`)
        : fail(`missing node "${name}" (have: ${nodeNames.join(", ") || "none"})`),
    );
  }

  const matNames = (json.materials || []).map((m) => m.name);
  for (const name of REQUIRED_MATERIALS) {
    results.push(
      matNames.includes(name)
        ? pass(`material "${name}"`)
        : fail(`missing material "${name}" (have: ${matNames.join(", ") || "none"})`),
    );
  }

  // Every primitive must carry UVs, or the sleeve has nothing to sample with.
  let missingUv = 0;
  for (const mesh of json.meshes || []) {
    for (const prim of mesh.primitives || []) {
      if (prim.attributes?.TEXCOORD_0 === undefined) missingUv++;
    }
  }
  results.push(
    missingUv === 0
      ? pass("every primitive has TEXCOORD_0")
      : fail(`${missingUv} primitive(s) have no UVs`),
  );

  // The artwork must be dynamic: a model that bakes in a cover would show the
  // same game on every product.
  results.push(
    (json.images || []).length === 0
      ? pass("no baked-in textures — artwork stays per-product")
      : fail(`${json.images.length} embedded image(s): artwork is baked into the geometry`),
  );

  // Authored geometry, not a procedural stand-in.
  //
  // This is the check that would have caught the 2026-08 regression. A hand-made
  // `BoxGeometry` + `PlaneGeometry` scene can be given the right node names and
  // even the right UV seams, so names and seams alone prove nothing. What it
  // cannot fake cheaply is the real case's shape: a moulded keep case has
  // rounded corners and a hinge, which is thousands of vertices, and its sleeve
  // is *folded* around the spine rather than flat.
  const boxNode = (json.nodes || []).find((n) => n.name === "box");
  if (boxNode !== undefined && binChunk) {
    const posIndex = json.meshes[boxNode.mesh]?.primitives?.[0]?.attributes?.POSITION;
    const count = posIndex !== undefined ? json.accessors[posIndex].count : 0;
    results.push(
      count >= 1000
        ? pass(`box mesh has ${count} vertices — moulded geometry`)
        : fail(
            `box mesh has only ${count} vertices: this is a primitive stand-in, ` +
              `not the authored case`,
          ),
    );
  }

  // The sleeve's UV layout — back | spine | front.
  const placeholderNode = (json.nodes || []).find((n) => n.name === "placeholder");
  if (placeholderNode && binChunk) {
    const mesh = json.meshes[placeholderNode.mesh];

    // A sleeve that wraps must have depth. A flat plane maps the whole
    // back|spine|front image onto one face, which is what "the artwork looks
    // squashed" actually means.
    const posIndex = mesh?.primitives?.[0]?.attributes?.POSITION;
    if (posIndex !== undefined) {
      const pos = readAccessor(buf, json, binChunk.start, posIndex);
      const spanX = Math.max(...pos.map((p) => p[0])) - Math.min(...pos.map((p) => p[0]));
      const spanZ = Math.max(...pos.map((p) => p[2])) - Math.min(...pos.map((p) => p[2]));
      const ratio = spanX > 0 ? spanZ / spanX : 0;
      results.push(
        ratio > 0.03
          ? pass(`sleeve is folded (depth/width = ${ratio.toFixed(3)})`)
          : fail(
              `sleeve is flat (depth/width = ${ratio.toFixed(3)}): a full ` +
                `back+spine+front texture would be squashed onto one face`,
            ),
      );
    }

    const uvIndex = mesh?.primitives?.[0]?.attributes?.TEXCOORD_0;
    if (uvIndex !== undefined) {
      const uv = readAccessor(buf, json, binChunk.start, uvIndex);
      const us = [...new Set(uv.map((p) => Number(p[0].toFixed(4))))].sort((a, b) => a - b);
      const backEnd = us.find((u) => u > 0.3 && u < 0.5);
      const spineEnd = us.find((u) => u > 0.5 && u < 0.62);
      const near = (a, b) => Math.abs(a - b) <= UV_CONTRACT.tolerance;
      results.push(
        backEnd !== undefined && near(backEnd, UV_CONTRACT.backEnd)
          ? pass(`back|spine seam at U=${backEnd} (expected ~${UV_CONTRACT.backEnd})`)
          : fail(`back|spine seam is ${backEnd}, expected ~${UV_CONTRACT.backEnd}`),
      );
      results.push(
        spineEnd !== undefined && near(spineEnd, UV_CONTRACT.spineEnd)
          ? pass(`spine|front seam at U=${spineEnd} (expected ~${UV_CONTRACT.spineEnd})`)
          : fail(`spine|front seam is ${spineEnd}, expected ~${UV_CONTRACT.spineEnd}`),
      );
      const vs = uv.map((p) => p[1]);
      results.push(
        Math.min(...vs) >= -0.01 && Math.max(...vs) <= 1.01
          ? pass("UVs stay inside 0..1 (no tiling)")
          : fail("UVs fall outside 0..1"),
      );
    }
  }

  return results;
}

async function verify(target) {
  console.log(`\n── ${target}`);
  let loaded;
  try {
    loaded = await load(target);
  } catch (err) {
    console.log(`   ✗ could not fetch: ${err.message}`);
    return false;
  }

  const { buf, status, headers } = loaded;
  if (headers["content-type"]) console.log(`   content-type: ${headers["content-type"]}`);
  if (headers["content-length"]) console.log(`   content-length: ${headers["content-length"]}`);
  if (headers["cache-control"]) console.log(`   cache-control: ${headers["cache-control"]}`);
  if (headers["cf-mitigated"]) console.log(`   cf-mitigated: ${headers["cf-mitigated"]}`);
  console.log(`   status: ${status}   bytes: ${buf.length}`);
  console.log(`   sha256: ${createHash("sha256").update(buf).digest("hex")}`);

  if (status !== 200) {
    const looksHtml = buf.slice(0, 15).toString("latin1").toLowerCase().includes("<!doctype");
    console.log(
      `   ✗ HTTP ${status}${looksHtml ? " and the body is an HTML page, not a model" : ""}`,
    );
    console.log(
      looksHtml
        ? "     → the edge refused the request. This is NOT model corruption:\n" +
            "       check the zone's rules for the URL path before touching the object."
        : "",
    );
    return false;
  }

  let results;
  try {
    results = checkModel(buf);
  } catch (err) {
    console.log(`   ✗ ${err.message}`);
    return false;
  }

  for (const r of results) console.log(`   ${r.ok ? "✓" : "✗"} ${r.msg}`);
  return results.every((r) => r.ok);
}

const args = process.argv.slice(2);
let origin = "https://banan.to";
const targets = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--origin") origin = args[++i];
  else targets.push(args[i]);
}
if (targets.length === 0) {
  targets.push(`${origin}/api/model/SwitchCase?v=1`);
  targets.push("https://assets.banan.to/Pages/Glb/SwitchCase.glb");
}

let allOk = true;
for (const t of targets) {
  if (!(await verify(t))) allOk = false;
}
console.log(allOk ? "\nAll targets valid.\n" : "\nOne or more targets failed.\n");
process.exit(allOk ? 0 : 1);
