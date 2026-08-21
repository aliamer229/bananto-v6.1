import { Canvas } from "@react-three/fiber";

import { SwitchBox3D } from "@/SwitchBox3D";
import { cdnImage } from "@/lib/img";
import type { GameCase3DProps } from "./GameCase3D";

/**
 * The WebGL half of the case stage, kept in its own module.
 *
 * three, @react-three/fiber and the box geometry are the bulk of the product
 * page's JavaScript. Importing them from here means they are fetched as a
 * separate chunk, only in the browser, and only once the CSS case has decided a
 * real 3D render is worth attempting — see `CaseStage`.
 */
export default function CaseStageWebGL({
  onReady,
  ...caseProps
}: GameCase3DProps & { onReady: () => void }) {
  return (
    <Canvas
      camera={{ position: [0, 0, 15], fov: 35 }}
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
        coverImage={cdnImage(caseProps.sleeve?.url || caseProps.coverUrl || "") || null}
        platform={(caseProps as any).platform === "ns2" || caseProps.isSwitch2 ? "ns2" : "ns1"}
        gameName={caseProps.title}
        onReady={onReady}
      />
    </Canvas>
  );
}
