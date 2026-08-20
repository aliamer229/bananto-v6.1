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

const SwitchBox3D = lazyWithRetry(() =>
  import("@/SwitchBox3D").then((m) => ({ default: m.SwitchBox3D || m.default })),
);

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
  const handleModelReady = useCallback(() => setModelReady(true), []);

  // Check preferences for reduced motion
  const { motion } = readPrefs();
  const isReduced = motion === "lite";

  // The user explicitly wants the 3D model to be the primary view.
  // We only fall back to the static 2D version if the user has manually
  // enabled "Reduced Motion" in their settings.
  if (isReduced) {
    return (
      <div className={cn("relative", className)}>
        <GameCase3D {...caseProps} />
      </div>
    );
  }

  return (
    <div className={cn("relative", className)}>
      {/* Background loading state (static case) always visible while model is not ready */}
      {!modelReady && (
        <div className="transition-opacity duration-300">
          <GameCase3D {...caseProps} />
        </div>
      )}

      <div
        className={cn(
          "absolute inset-0 touch-none transition-opacity duration-700",
          modelReady ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <SafeBoundary onError={() => setModelReady(false)}>
          <Suspense fallback={null}>
            <Canvas
              camera={{ position: [0, 0, 8.5], fov: 42 }}
              style={{ touchAction: "none", cursor: "grab", userSelect: "none", width: "100%", height: "100%" }}
            >
              <ambientLight intensity={1.8} />
              <pointLight position={[10, 10, 10]} intensity={1.5} />
              <pointLight position={[-10, 5, 5]} intensity={0.8} />
              <SwitchBox3D
                coverImage={cdnImage(caseProps.sleeve?.url || caseProps.coverUrl || "") || null}
                platform={caseProps.isSwitch2 ? "ns2" : "ns1"}
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
