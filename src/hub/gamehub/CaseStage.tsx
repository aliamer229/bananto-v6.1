import { Suspense, useCallback, useEffect, useState } from "react";
import SafeBoundary from "@/components/SafeBoundary";
import { useImageTrim } from "@/hooks/useImageTrim";
import { cn } from "@/hub/utils/cn";
import { cdnImage } from "@/lib/img";
import { lazyWithRetry } from "@/lib/lazyRetry";
import { readPrefs } from "@/lib/prefs";
import type { GameCase3DProps } from "./GameCase3D";

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
  const { trim } = useImageTrim(
    cdnImage(rest.coverUrl ?? ""),
    rest.coverTrim,
    !rest.sleeve?.url && Boolean(rest.coverUrl),
  );
  const caseProps: GameCase3DProps = { ...rest, coverTrim: trim ?? rest.coverTrim };
  const [modelReady, setModelReady] = useState(false);
  const [webglReady, setWebglReady] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (hasWebGL()) setWebglReady(true);
  }, []);

  const handleModelReady = useCallback(() => {
    setModelReady(true);
  }, []);

  const { motion } = readPrefs();
  const isReduced = motion === "lite";
  
  // Fallback: visual fallback (image only) requested by user
  const SimpleFallback = () => {
     const source = caseProps.coverTextureUrl || caseProps.coverUrl || caseProps.sleeve?.url;
     return (
        <img 
           src={cdnImage(source, { width: 800 })} 
           alt={caseProps.title || "Game Cover"} 
           loading="eager"
           decoding="async"
           className="w-full h-auto max-w-[300px] object-cover rounded-md shadow-lg" 
        />
     );
  };

  if (isReduced || hasError) {
    return (
      <div className={cn("relative flex items-center justify-center min-h-[360px] sm:min-h-[440px]", className)}>
        <SimpleFallback />
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
         {/* Show simple image while loading the GLB model */}
         <SimpleFallback />
      </div>
      <div
        className={cn(
          "absolute inset-0 touch-none transition-opacity duration-1000",
          modelReady ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
      >
        {webglReady ? (
          <SafeBoundary onError={(err) => {
             console.error("[3D] GLB Load Error:", err);
             setHasError(true);
          }}>
            <Suspense fallback={null}>
              <CaseStageWebGL {...caseProps} onReady={handleModelReady} />
            </Suspense>
          </SafeBoundary>
        ) : null}
      </div>
    </div>
  );
}
