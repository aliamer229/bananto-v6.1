/**
 * Resolves the crop rectangle for one image URL, from whichever source knows it.
 *
 * Three layers, cheapest first:
 *
 * 1. a crop stored on the product (`cartridgeImageTrim`) — free, and present in
 *    the server-rendered HTML;
 * 2. the session cache — free after the first sighting of that URL, on any page;
 * 3. one idle-time measurement, whose answer feeds layer 2 for everything else.
 *
 * Every surface that frames a cover uses this, so the box is cropped the same
 * way on a listing card, in the cart, on the 2D case and on the 3D sleeve. It
 * lives outside `NintendoCover` because the case components build their faces
 * from raw CSS rather than from that component.
 */
import { useEffect, useState } from "react";

import { isValidTrim, type TrimBox } from "@/lib/imageTrim";
import { readTrimCache, scheduleTrim, type TrimRecord } from "@/lib/imageTrim.browser";

export interface ResolvedTrim {
  /** The crop to apply, or `null` to show the image untouched. */
  trim: TrimBox | null;
  /** Source aspect ratio (width / height) once known, else `null`. */
  naturalAspect: number | null;
}

export function useImageTrim(
  url: string | null | undefined,
  storedTrim?: unknown,
  enabled = true,
): ResolvedTrim {
  const stored = isValidTrim(storedTrim) ? (storedTrim as TrimBox) : null;

  const [measured, setMeasured] = useState<TrimRecord | null>(() =>
    url && enabled ? (readTrimCache(url) ?? null) : null,
  );

  useEffect(() => {
    if (!url || !enabled) {
      setMeasured(null);
      return;
    }
    const cached = readTrimCache(url);
    if (cached) {
      setMeasured(cached);
      return;
    }
    setMeasured(null);
    return scheduleTrim(url, (record) => {
      if (record) setMeasured(record);
    });
  }, [url, enabled]);

  const trim = stored ?? (isValidTrim(measured?.trim) ? (measured?.trim as TrimBox) : null);
  const naturalAspect =
    measured && measured.naturalWidth > 0 && measured.naturalHeight > 0
      ? measured.naturalWidth / measured.naturalHeight
      : null;

  return { trim, naturalAspect };
}
