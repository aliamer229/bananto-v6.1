import { Canvas } from "@react-three/fiber";
import * as THREE from "three";

import { SwitchBox3D } from "@/SwitchBox3D";
import { cdnImage } from "@/lib/img";
import { isValidTrim, type TrimBox } from "@/lib/imageTrim";
import type { GameCase3DProps } from "./GameCase3D";

/**
 * The WebGL half of the case stage, kept in its own module.
 *
 * three, @react-three/fiber and the box geometry are the bulk of the product
 * page's JavaScript. Importing them from here means they are fetched as a
 * separate chunk, only in the browser, and only once the CSS case has decided a
 * real 3D render is worth attempting — see `CaseStage`.
 *
 * ## Render settings that decide how sharp the box looks
 *
 * - `dpr` is capped at 2 rather than left to the device. Uncapped, a 3x phone
 *   renders 9x the pixels and throttles; capped at 1 the box is visibly soft.
 * - `outputColorSpace` is stated explicitly so the sleeve is the colour the
 *   artwork file says it is, matching the same cover rendered as a 2D card.
 * - `antialias` is on; the box is a hard-edged rectangle against a flat
 *   backdrop, which is the worst case for stair-stepping.
 *
 * The texture's own filtering (mipmaps, anisotropy, source resolution) lives in
 * `SwitchBox3D`.
 */
export default function CaseStageWebGL({
  onReady,
  ...caseProps
}: GameCase3DProps & { onReady: () => void }) {
  // The sleeve wants the highest-resolution front cover there is, never the
  // listing thumbnail. `coverTextureUrl` is what `resolveNintendoImage(…,
  // "3d-texture")` chose; `coverUrl` is the fallback.
  const source = caseProps.sleeve?.url || caseProps.coverTextureUrl || caseProps.coverUrl || "";
  const trim = isValidTrim(caseProps.coverTrim) ? (caseProps.coverTrim as TrimBox) : null;

  return (
    <Canvas
      camera={{ position: [0, 0, 15], fov: 35 }}
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onCreated={({ gl }) => {
        gl.outputColorSpace = THREE.SRGBColorSpace;
      }}
      style={{
        touchAction: "none",
        cursor: "grab",
        userSelect: "none",
        width: "100%",
        height: "100%",
      }}
    >
      <ambientLight intensity={1.5} />
      <directionalLight position={[5, 10, 5]} intensity={1.5} />
      <directionalLight position={[-5, -5, -5]} intensity={0.5} />
      <SwitchBox3D
        coverImage={cdnImage(source) || null}
        // A wrap already carries its own framing; only a front-only cover is
        // cropped before it reaches the sleeve.
        coverTrim={caseProps.sleeve?.url ? null : trim}
        platform={(caseProps as any).platform === "ns2" || caseProps.isSwitch2 ? "ns2" : "ns1"}
        gameName={caseProps.title}
        onReady={onReady}
      />
    </Canvas>
  );
}
