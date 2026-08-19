import { Suspense, useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { GameCase3D, type GameCase3DProps } from "./GameCase3D";
import SafeBoundary from "@/components/SafeBoundary";
import { cn } from "@/hub/utils/cn";
import { lazyWithRetry } from "@/lib/lazyRetry";

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
  const [enable3D, setEnable3D] = useState(false);
  const [modelReady, setModelReady] = useState(false);

  useEffect(() => {
    if (!hasWebGL()) return;

    // Defer past first paint so the model never competes with the hero's own
    // artwork for bandwidth.
    const supportsIdle = typeof window.requestIdleCallback === "function";
    const handle: number = supportsIdle
      ? window.requestIdleCallback(
          () => {
            setEnable3D(true);
            setModelReady(true);
          },
          { timeout: 2500 },
        )
      : window.setTimeout(() => {
          setEnable3D(true);
          setModelReady(true);
        }, 1200);

    return () => {
      if (supportsIdle) window.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
    };
  }, []);

  return (
    <div className={cn("relative", className)}>
      {/* Always-present CSS render. Hidden from AT once the model takes over. */}
      <div
        aria-hidden={modelReady}
        className={cn(
          "transition-opacity duration-700",
          modelReady ? "pointer-events-none opacity-0" : "opacity-100",
        )}
      >
        <GameCase3D {...caseProps} />
      </div>

      {enable3D && (
        <div
          className={cn(
            "absolute inset-0 transition-opacity duration-700",
            modelReady ? "opacity-100" : "pointer-events-none opacity-0",
          )}
        >
          {/* A failed model download or a lost WebGL context must not escape to
              the route boundary — the CSS case underneath stays on screen. */}
          <SafeBoundary onError={() => setModelReady(false)}>
            <Suspense fallback={null}>
              <Canvas camera={{ position: [0, 0, 15], fov: 35 }}>
                <ambientLight intensity={1.5} />
                <directionalLight position={[5, 10, 5]} intensity={1.5} />
                <directionalLight position={[-5, -5, -5]} intensity={0.5} />
                <SwitchBox3D
                  coverImage={caseProps.sleeve?.url || caseProps.coverUrl || null}
                  platform={caseProps.isSwitch2 ? "ns2" : "ns1"}
                  gameName={caseProps.title}
                />
              </Canvas>
            </Suspense>
          </SafeBoundary>
        </div>
      )}
    </div>
  );
}
