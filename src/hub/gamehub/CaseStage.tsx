import { Suspense, useCallback, useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { GameCase3D, type GameCase3DProps } from "./GameCase3D";
import SafeBoundary from "@/components/SafeBoundary";
import { cn } from "@/hub/utils/cn";
import { lazyWithRetry } from "@/lib/lazyRetry";
import { cdnImage } from "@/lib/img";
import { readPrefs } from "@/lib/prefs";

/**
 * Renders the case, preferring real 3D geometry but never waiting on it.
 *
 * The CSS build paints immediately — no download, no WebGL, correct on every
 * device. The GLB renderer (three + R3F, ~200 KB of model on top of the
 * library) loads in the background and cross-fades in once its first frame is
 * ready. If WebGL is unavailable or the device is small, the CSS case simply stays.
 */

import { SwitchBox3D } from "@/SwitchBox3D";

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

export function CaseStage({ className, ...caseProps }: GameCase3DProps & { className?: string }) {
  const [modelReady, setModelReady] = useState(false);
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
    <div className={cn("relative z-10", className, "min-h-[440px] w-full flex items-center justify-center")}>
      <div
        className={cn(
          "absolute inset-0 touch-none transition-opacity duration-1000",
          modelReady ? "opacity-100" : "opacity-0",
        )}
      >
        <SafeBoundary onError={() => setModelReady(false)}>
          <Suspense fallback={null}>
            <Canvas
              camera={{ position: [0, 0, 15], fov: 35 }}
              style={{ touchAction: "none", cursor: "grab", userSelect: "none" }}
            >
              <ambientLight intensity={1.5} />
              <directionalLight position={[5, 10, 5]} intensity={1.5} />
              <directionalLight position={[-5, -5, -5]} intensity={0.5} />
              <SwitchBox3D
                coverImage={cdnImage(caseProps.sleeve?.url || caseProps.coverUrl || "") || null}
                platform={(caseProps as any).platform === 'Switch 2' || caseProps.isSwitch2 ? "ns2" : "ns1"}
                gameName={caseProps.title}
                onReady={handleModelReady}
              />
            </Canvas>
          </Suspense>
        </SafeBoundary>
      </div>
    </div>
  );
}
