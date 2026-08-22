import React, { useRef, useEffect, useState } from "react";
import { useGLTF, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { readPrefs } from "@/lib/prefs";

export const SWITCH_GLB_URL = "https://assets.banan.to/Pages/Glb/SwitchCase.glb";

export interface SwitchBox3DProps {
  coverImage: string | null;
  platform?: string;
  gameName?: string;
  onReady?: () => void;
}

/**
 * Authentic 3D Nintendo Switch Game Box using the official Sketchfab GLB model
 * hosted on Cloudflare at https://assets.banan.to/Pages/Glb/SwitchCase.glb
 *
 * Renders the real 3D GLB mesh with full wrap-around insert (Back + Spine + Front)
 * and calibrated realistic plastic / foil materials.
 */
export function SwitchBox3D({
  coverImage,
  platform = "ns1",
  gameName = "",
  onReady,
}: SwitchBox3DProps) {
  const { nodes, materials } = useGLTF(SWITCH_GLB_URL) as any;
  const group = useRef<THREE.Group>(null);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    if (nodes && materials) {
      onReady?.();
    }
  }, [nodes, materials, onReady]);

  useEffect(() => {
    let isMounted = true;

    if (!coverImage) {
      setTexture(null);
      return;
    }

    const loader = new THREE.TextureLoader();
    if (/^https?:\/\//i.test(coverImage)) {
      try {
        if (new URL(coverImage).origin !== window.location.origin) {
          loader.setCrossOrigin("anonymous");
        }
      } catch {
        loader.setCrossOrigin("anonymous");
      }
    }

    loader.load(
      coverImage,
      (tex) => {
        if (!isMounted) return;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.flipY = false;
        tex.needsUpdate = true;

        setTexture((prev) => {
          if (prev) prev.dispose();
          return tex;
        });
      },
      undefined,
      (err) => {
        console.warn("[SwitchBox3D] Cover image load error:", err);
        if (isMounted) setTexture(null);
      },
    );

    return () => {
      isMounted = false;
    };
  }, [coverImage]);

  // Calibrate realistic materials for the GLB
  if (materials?.foil) {
    materials.foil.transparent = true;
    materials.foil.opacity = 0.42;
    materials.foil.depthWrite = false;
    materials.foil.depthTest = true;
    materials.foil.roughness = 0.08;
    materials.foil.metalness = 0.1;
  }

  if (materials?.plastic) {
    materials.plastic.transparent = true;
    // A retail Switch case is clear plastic with the printed sleeve read
    // through it. At 0.78-0.85 this shell sat in front of the artwork as a
    // near-opaque white (or red) coat and washed it out — the "layer covering
    // the cartridge" people were seeing. Keep enough tint to read as coloured
    // plastic, and let the sleeve dominate.
    materials.plastic.opacity = platform === "ns2" ? 0.32 : 0.16;
    // A transparent material must not write depth: doing so lets the shell's
    // own far faces occlude its near faces and the sleeve behind it, which
    // shows up as flat opaque patches over the art.
    materials.plastic.depthWrite = false;
    materials.plastic.depthTest = true;
    materials.plastic.color.set(platform === "ns2" ? "#d60012" : "#f5f5f5");
    materials.plastic.roughness = 0.08;
    materials.plastic.metalness = 0.12;
  }

  if (!nodes?.placeholder || !nodes?.box || !nodes?.foil) {
    return null;
  }

  return (
    <>
      <OrbitControls
        enableZoom={false}
        enablePan={false}
        enableRotate={true}
        autoRotate={!readPrefs().motion || readPrefs().motion === "full"}
        autoRotateSpeed={1.4}
        minPolarAngle={Math.PI / 4}
        maxPolarAngle={Math.PI / 1.6}
        makeDefault
      />

      <group
        ref={group}
        dispose={null}
        scale={0.52}
        position={[0, -0.15, 0]}
        rotation={[0, -Math.PI / 5.5, 0]}
      >
        {/* 1. Printed sleeve insert (artwork placeholder) */}
        <mesh geometry={nodes.placeholder.geometry} renderOrder={1}>
          <meshStandardMaterial
            key={texture ? texture.uuid : "empty"}
            map={texture || null}
            color={texture ? "#ffffff" : "#111317"}
            roughness={0.65}
            metalness={0.0}
            side={THREE.DoubleSide}
            transparent={false}
            opacity={1}
          />
        </mesh>

        {/* 2. Plastic outer case */}
        <mesh geometry={nodes.box.geometry} material={materials.plastic} renderOrder={2} />

        {/* 3. Foil protective outer sleeve */}
        <mesh geometry={nodes.foil.geometry} material={materials.foil} renderOrder={3} />
      </group>
    </>
  );
}

// Preload the GLB model from Cloudflare CDN
useGLTF.preload(SWITCH_GLB_URL);

export default SwitchBox3D;
