import React, { useRef } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { SwitchBox3D, type SwitchBox3DHandle } from "@/SwitchBox3D";
import type { GameCase3DProps } from "./GameCase3D";

/**
 * The WebGL half of the case stage, with touch/mouse rotation and zoom.
 *
 * It is only ever mounted when a real **3D Texture Source** exists — the
 * complete printed wrap of back + spine + front. `CaseStage` makes that
 * decision and passes the artwork in as `wrapUrl`, so there is no fallback
 * chain here and no way for a front-only cover to reach the model. A product
 * without a wrap never loads this component at all, which also means it never
 * downloads three.js.
 *
 * `onTextured` fires when the artwork is actually on the mesh. That is what
 * reveals the canvas; before it, the stage is still showing the box photograph.
 * The distinction matters because `useGLTF` resolving only means the *geometry*
 * arrived — treating that as "ready" is what used to put an untextured grey
 * case on screen.
 */
export default function CaseStageWebGL({
  wrapUrl,
  onTextured,
  onFailed,
  ...caseProps
}: GameCase3DProps & {
  /** The full case wrap. Required — this component has no other artwork source. */
  wrapUrl: string;
  onTextured: () => void;
  onFailed: () => void;
}) {
  const controllerRef = useRef<SwitchBox3DHandle | null>(null);

  return (
    <div id="switch-3d-stage-wrapper" className="relative h-full w-full select-none">
      <Canvas
        camera={{ position: [0, 0, 14.5], fov: 35 }}
        dpr={[1, 2]}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        onCreated={({ gl }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace;
        }}
        // A lost context on a phone must not leave a dead canvas on screen.
        onError={() => onFailed()}
        style={{ touchAction: "none", cursor: "grab" }}
      >
        <ambientLight intensity={1.5} />
        <directionalLight position={[5, 5, 5]} intensity={1.5} />
        <directionalLight position={[-5, -5, -5]} intensity={0.5} />

        <SwitchBox3D
          ref={controllerRef}
          coverImage={wrapUrl}
          textureMode="wrap"
          platform={caseProps.platform || (caseProps.isSwitch2 ? "ns2" : "ns")}
          gameName={caseProps.title}
          coverTrim={caseProps.coverTrim}
          onTextured={onTextured}
          onTextureError={(reason) => {
            /*
              The wrap could not be fetched or decoded. Rather than leaving an
              untextured case rotating on the page, hand the slot back to the
              static box cover — the stage owns that decision.
            */
            console.warn("[3D] wrap texture unavailable:", reason, { wrapUrl });
            onFailed();
          }}
        />
      </Canvas>
    </div>
  );
}
