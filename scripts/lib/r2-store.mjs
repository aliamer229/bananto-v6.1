/**
 * Puts objects in R2 and proves they are readable afterwards.
 *
 * The REST API is tried first because a run stores several hundred
 * screenshots, and spawning wrangler twice per object — once to write, once to
 * verify — costs more wall clock than the downloads and conversions together.
 * If the token is not scoped for R2 the first call says so, and everything
 * falls back to wrangler for the rest of the run.
 */

import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync, unlinkSync } from "node:fs";
import path from "node:path";

const API = "https://api.cloudflare.com/client/v4";

const WRANGLER =
  process.env.WRANGLER_BIN ||
  (existsSync("node_modules/.bin/wrangler") ? "node_modules/.bin/wrangler" : "wrangler");
const ENV = { ...process.env, WRANGLER_SEND_METRICS: "false", CI: "true" };

export function createR2(bucket, { tmpDir = ".r2-tmp", log = () => {} } = {}) {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  let useRest = Boolean(account && token);

  const objectUrl = (key) =>
    `${API}/accounts/${account}/r2/buckets/${bucket}/objects/${key
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`;

  async function restPut(key, body, contentType) {
    const res = await fetch(objectUrl(key), {
      method: "PUT",
      headers: { authorization: `Bearer ${token}`, "content-type": contentType },
      body,
    });
    if (res.status === 401 || res.status === 403) {
      useRest = false;
      log(`R2 REST refused (${res.status}) — falling back to wrangler for the rest of the run`);
      return null;
    }
    return res.ok;
  }

  async function restHead(key) {
    const res = await fetch(objectUrl(key), {
      method: "GET",
      headers: { authorization: `Bearer ${token}`, range: "bytes=0-0" },
    });
    if (res.status === 401 || res.status === 403) {
      useRest = false;
      return null;
    }
    return res.ok;
  }

  function wrangler(args, timeoutMs = 120_000) {
    try {
      return execFileSync(WRANGLER, args, {
        encoding: "buffer",
        maxBuffer: 256 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
        timeout: timeoutMs,
        killSignal: "SIGKILL",
        env: ENV,
      });
    } catch {
      return null;
    }
  }

  return {
    get mode() {
      return useRest ? "rest" : "wrangler";
    },

    /** Writes the object, then reads it back. Returns false unless both succeed. */
    async put(key, buffer, contentType) {
      if (useRest) {
        const wrote = await restPut(key, buffer, contentType);
        if (wrote === true) {
          const back = await restHead(key);
          if (back === true) return true;
          if (back === false) return false;
        } else if (wrote === false) {
          return false;
        }
        // null means the token lost R2 access mid-run; fall through to wrangler.
      }
      const tmp = path.join(tmpDir, `put-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      writeFileSync(tmp, buffer);
      try {
        const wrote = wrangler([
          "r2", "object", "put", `${bucket}/${key}`,
          "--file", tmp, "--remote", "--content-type", contentType,
        ]);
        if (wrote === null) return false;
        const back = wrangler(
          ["r2", "object", "get", `${bucket}/${key}`, "--remote", "--pipe"],
          60_000,
        );
        return Boolean(back && back.length);
      } finally {
        try {
          unlinkSync(tmp);
        } catch {
          /* the temp file is disposable; a failed unlink is not a run failure */
        }
      }
    },

    /** Existence check only — used to decide whether a stored URL still resolves. */
    async exists(key) {
      if (useRest) {
        const hit = await restHead(key);
        if (hit !== null) return hit;
      }
      const back = wrangler(["r2", "object", "get", `${bucket}/${key}`, "--remote", "--pipe"], 45_000);
      return Boolean(back && back.length);
    },
  };
}
