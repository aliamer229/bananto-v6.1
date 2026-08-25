import React, { useRef } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { SwitchBox3D, type SwitchBox3DHandle } from "@/SwitchBox3D";
import { isValidTrim, type TrimBox } from "@/lib/imageTrim";
import type { GameCase3DProps } from "./GameCase3D";

/**
 * The WebGL half of the case stage with full touch/mouse rotation, zoom.
 */
export default function CaseStageWebGL({
  onReady,
  ...caseProps
}: GameCase3DProps & { onReady: () => void }) {
  const controllerRef = useRef<SwitchBox3DHandle | null>(null);

  // [3D Texture] source priority: 3D Texture Source (coverTextureUrl) > Front Box Cover (coverUrl)
  let source = "";
  let sourceType = "";
  if (caseProps.coverTextureUrl) {
    source = caseProps.coverTextureUrl;
    sourceType = "3D_TEXTURE_SOURCE";
  } else if (caseProps.coverUrl) {
    source = caseProps.coverUrl;
    sourceType = "FRONT_BOX_COVER_FALLBACK";
  } else if (caseProps.sleeve?.url) {
    source = caseProps.sleeve.url;
    sourceType = "SLEEVE_FALLBACK";
  }

  console.log(`[3D Texture] source = ${sourceType}`);

  const trim = isValidTrim(caseProps.coverTrim) ? (caseProps.coverTrim as TrimBox) : null;

  return (
    <div
      id="switch-3d-stage-wrapper"
      className="relative w-full h-full select-none"
    >
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
          platform={caseProps.platform || (caseProps.isSwitch2 ? "ns2" : "ns")}
          gameName={caseProps.title}
          isHiRes={sourceType === "3D_TEXTURE_SOURCE"}
          coverTrim={trim}
          onReady={onReady}
        />
      </Canvas>
    </div>
  );
}
