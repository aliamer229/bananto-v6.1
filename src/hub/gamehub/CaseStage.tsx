import { Suspense, useCallback, useEffect, useState } from "react";
import { GameCase3D, type GameCase3DProps } from "./GameCase3D";
import SafeBoundary from "@/components/SafeBoundary";
import { useImageTrim } from "@/hooks/useImageTrim";
import { cn } from "@/hub/utils/cn";
import { cdnImage } from "@/lib/img";
import { lazyWithRetry } from "@/lib/lazyRetry";
import { readPrefs } from "@/lib/prefs";

/**
 * Renders the case, preferring real 3D geometry but never waiting on it.
 *
 * The CSS build paints immediately — no download, no WebGL, correct on every
 * device. The GLB renderer (three + R3F, ~200 KB of model on top of the
 * library) loads in the background and cross-fades in once its first frame is
 * ready. If WebGL is unavailable or the device is small, the CSS case simply stays.
 */

const CaseStageWebGL = lazyWithRetry(() => import("./CaseStageWebGL"));

function hasWebGL(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      window.WebGLRenderingContext && (canvas.getContext("webgl2") || canvas.getContext("webgl")),
    );
  } catch {
    return false;
  }
}

export function CaseStage({ className, ...rest }: GameCase3DProps & { className?: string }) {
  /*
    One crop for both renderers, resolved here so the CSS case and the WebGL
    sleeve frame the artwork identically and the file is measured once. A wrap
    already carries its own framing and is never cropped.
  */
  const { trim } = useImageTrim(
    cdnImage(rest.coverUrl ?? ""),
    rest.coverTrim,
    !rest.sleeve?.url && Boolean(rest.coverUrl),
  );
  const caseProps: GameCase3DProps = { ...rest, coverTrim: trim ?? rest.coverTrim };

  const [modelReady, setModelReady] = useState(false);
  // three + R3F are only worth downloading in a browser that can actually
  // render them, and never during SSR.
  const [webglReady, setWebglReady] = useState(false);

  useEffect(() => {
    if (hasWebGL()) setWebglReady(true);
  }, []);

  const handleModelReady = useCallback(() => {
    setModelReady(true);
  }, []);

  const { motion } = readPrefs();
  const isReduced = motion === "lite";

  if (isReduced) {
    return (
      <div className={cn("relative", className)}>
        <GameCase3D {...caseProps} />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative z-10",
        className,
        "min-h-[360px] sm:min-h-[440px] w-full max-w-full flex items-center justify-center overflow-hidden sm:overflow-visible",
      )}
    >
      <div
        className={cn(
          "w-full flex items-center justify-center transition-opacity duration-700",
          modelReady ? "opacity-0 pointer-events-none absolute inset-0" : "opacity-100 relative",
        )}
      >
        <GameCase3D {...caseProps} />
      </div>
      <div
        className={cn(
          "absolute inset-0 touch-none transition-opacity duration-1000",
          modelReady ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
      >
        {webglReady ? (
          <SafeBoundary onError={() => setModelReady(false)}>
            <Suspense fallback={null}>
              <CaseStageWebGL {...caseProps} onReady={handleModelReady} />
            </Suspense>
          </SafeBoundary>
        ) : null}
      </div>
    </div>
  );
}
