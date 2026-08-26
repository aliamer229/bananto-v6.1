import React, { useEffect, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { SwitchBox3D, type SwitchBoxTextureMode, type SwitchBox3DHandle } from "@/SwitchBox3D";
import type { GameCase3DProps } from "./GameCase3D";

/**
 * The WebGL half of the case stage with full touch/mouse rotation and zoom.
 *
 * ## Choosing the artwork
 *
 * This is the only place allowed to decide that a Front Box Cover may stand in
 * for a missing 3D Texture Source, and it does so **explicitly**, by declaring
 * a texture mode rather than by letting a resolver quietly hand back a
 * different kind of picture:
 *
 * - a real wrap (3D Texture Source, or a stored case sleeve) → `wrap`, drawn
 *   across the sleeve untouched;
 * - front-only art → `composed`, and `SwitchBox3D` builds the spine and back
 *   around it;
 * - nothing → a blank retail case with a printed spine.
 *
 * A square card, a banner or a gallery frame never reaches this component: the
 * media resolver will not return one for a texture role.
 */
export default function CaseStageWebGL({
  onReady,
  ...caseProps
}: GameCase3DProps & { onReady: () => void }) {
  const controllerRef = useRef<SwitchBox3DHandle | null>(null);

  // 3D Texture Source first — it is the only field that means "full wrap".
  let source = "";
  let sourceType = "";
  let textureMode: SwitchBoxTextureMode = "composed";
  if (caseProps.coverTextureUrl) {
    source = caseProps.coverTextureUrl;
    sourceType = "3D_TEXTURE_SOURCE";
    textureMode = "wrap";
  } else if (caseProps.sleeve?.url) {
    source = caseProps.sleeve.url;
    sourceType = "CASE_SLEEVE";
    textureMode = "wrap";
  } else if (caseProps.coverUrl) {
    // Declared fallback: front-only art, composed into a sleeve here.
    source = caseProps.coverUrl;
    sourceType = "FRONT_BOX_COVER_COMPOSED";
    textureMode = "composed";
  }

  useEffect(() => {
    if (import.meta.env?.DEV) {
      console.info("[3D] texture source", { sourceType, textureMode, hasSource: Boolean(source) });
    }
  }, [source, sourceType, textureMode]);

  return (
    <div id="switch-3d-stage-wrapper" className="relative w-full h-full select-none">
      {/* Interactive 3D Canvas */}
      <Canvas
        camera={{ position: [0, 0, 14.5], fov: 35 }}
        dpr={[1, 2]}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        onCreated={({ gl }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace;
        }}
        style={{
          touchAction: "none",
          cursor: "grab",
        }}
      >
        <ambientLight intensity={1.5} />
        <directionalLight position={[5, 5, 5]} intensity={1.5} />
        <directionalLight position={[-5, -5, -5]} intensity={0.5} />

        <SwitchBox3D
          ref={controllerRef}
          coverImage={source}
          textureMode={textureMode}
          platform={caseProps.platform || (caseProps.isSwitch2 ? "ns2" : "ns")}
          gameName={caseProps.title}
          coverTrim={caseProps.coverTrim}
          onReady={onReady}
          onTextureError={(reason) => {
            // The page keeps working with the case unpainted; this is only a
            // diagnostic, never a reason to unmount the product detail view.
            console.warn("[3D] texture unavailable:", reason, { sourceType });
          }}
        />
      </Canvas>
    </div>
  );
}
