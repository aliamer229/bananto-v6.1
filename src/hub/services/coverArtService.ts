import type { CaseSleeve } from "@/hub/gamehub/GameCase3D";

/**
 * Retail sleeve artwork.
 *
 * Nintendo titles are catalogued by a five-character game code (`AACCA` for
 * 1-2-Switch, `AYKXA` for #DRIVE). Several archives publish the full printed
 * **insert** for that code — back │ spine │ front as one sheet — which is
 * exactly the texture `GameCase3D` wants: the Nintendo lockup, the red header
 * and the spine title are all in the artwork, so nothing has to be drawn.
 *
 * Prefer this over front-only key art wherever a code is known.
 *
 * ## Serving it
 *
 * Sleeve archives generally do not send `Access-Control-Allow-Origin`, and the
 * files are multi-megabyte PNGs. Point `VITE_SLEEVE_ENDPOINT` at your own
 * proxy/cache rather than hot-linking:
 *
 *   GET {VITE_SLEEVE_ENDPOINT}/{code}  ->  image/png (the insert)
 *
 * A minimal proxy streams from the upstream archive on a miss and writes the
 * response to disk, so each code is fetched once. Unset, `sleeveFor()` returns
 * `undefined` and the case falls back to `coverUrl` — no broken images, no
 * hot-linking someone else's bandwidth by default.
 */

const ENDPOINT = import.meta.env["VITE_SLEEVE_ENDPOINT"] as string | undefined;

/** Nintendo's five-character game code, e.g. `AACCA`. */
export type GameCode = string;

const CODE_PATTERN = /^[A-Z0-9]{5}$/;

export function isGameCode(value: string | undefined): value is GameCode {
  return Boolean(value && CODE_PATTERN.test(value));
}

/**
 * Sleeve descriptor for a game code, or `undefined` when no endpoint is
 * configured or the code is malformed. Callers pass the result straight to
 * `GameCase3D`, which treats `undefined` as "use the front-only fallback".
 */
export function sleeveFor(code: string | undefined): CaseSleeve | undefined {
  if (!ENDPOINT || !isGameCode(code)) return undefined;
  return { url: `${ENDPOINT.replace(/\/$/, "")}/${code}` };
  // `layout` is intentionally omitted: retail inserts match PRINTED_LAYOUT, and
  // overriding it per game would only be right for non-standard trims.
}

export function isSleeveSourceConfigured(): boolean {
  return Boolean(ENDPOINT);
}
