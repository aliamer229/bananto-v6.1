import React, { useRef, useEffect, useState } from 'react';
import { useGLTF, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { readPrefs } from "@/lib/prefs";
import glbAsset from "@/assets/3d/SwitchCase.glb.asset.json";
import textureAsset from "@/assets/3d/GZAfvAF3.jpg.asset.json";

/**
 * Rebuilt SwitchBox3D component using authentic 3D assets from the provided reference project.
 * Implements full wrap-around texture mapping and calibrated materials.
 */
export function SwitchBox3D({ 
  coverImage, 
  platform, 
  gameName,
  onReady 
}: { 
  coverImage: string | null, 
  platform: string, 
  gameName: string,
  onReady?: () => void
}) {
  const { nodes, materials } = useGLTF(glbAsset.url) as any;
  const group = useRef<THREE.Group>(null);
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null);

  useEffect(() => {
    if (nodes && materials) {
      console.log("[SwitchBox3D] Geometry loaded, nodes:", Object.keys(nodes));
      // Notify parent that we are ready to be displayed even if textures are pending
      onReady?.();
    }
  }, [nodes, materials, onReady]);

  useEffect(() => {
    let isMounted = true;
    const canvas = document.createElement('canvas');
    canvas.width = 1236;
    canvas.height = 951;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const drawTexture = async () => {
      try {
        // 1. Draw authentic base texture
        const baseImg = new Image();
        baseImg.crossOrigin = 'anonymous';
        baseImg.src = textureAsset.url;
        
        await new Promise((resolve) => {
          baseImg.onload = resolve;
          baseImg.onerror = () => {
            console.error("Base texture failed to load");
            resolve(null);
          };
        });
        
        if (!isMounted) return;
        ctx.drawImage(baseImg, 0, 0, canvas.width, canvas.height);

        // 2. Overlay game-specific cover image
        if (coverImage) {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          
          // Use a promise to load the image
          await new Promise((resolve) => {
            img.onload = resolve;
            img.onerror = (e) => {
              console.warn("[SwitchBox3D] Cover image load failed", coverImage, e);
              resolve(null);
            };
            img.src = coverImage;
          });
          
          if (isMounted && img.complete && img.naturalWidth > 0) {
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          }
        }

        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.flipY = false;
        tex.needsUpdate = true;
        
        if (isMounted) {
          setTexture((prev) => {
            if (prev) prev.dispose();
            return tex;
          });
        }
      } catch (err) {
        console.error('Error drawing texture:', err);
      }
    };

    drawTexture();

    return () => {
      isMounted = false;
    };
  }, [coverImage, platform, gameName, onReady]);

  // Configure materials for realistic transparency and reflections
  if (materials.foil) {
    materials.foil.transparent = true;
    materials.foil.opacity = 0.5;
  }
  
  if (materials.plastic) {
    materials.plastic.transparent = true;
    materials.plastic.opacity = 0.8;
    materials.plastic.depthWrite = true;
    // Fix: Ensure Switch 2 platform is correctly colored (Red) and Switch 1 is default (Clear/White)
    materials.plastic.color.set(platform === 'ns2' ? '#e60012' : '#ffffff');
    materials.plastic.roughness = 0.05;
    materials.plastic.metalness = 0.4;
  }

  return (
    <>
      <OrbitControls
        enableZoom={false}
        enablePan={false}
        enableRotate={true}
        autoRotate={!readPrefs().motion || readPrefs().motion === "full"}
        autoRotateSpeed={1.5}
        makeDefault
      />
      
      <group ref={group} dispose={null} scale={0.55} position={[0, 0, 0]} rotation={[0, -Math.PI / 6, 0]}>
        {/* The plastic outer case */}
        <mesh geometry={nodes.box.geometry} material={materials.plastic} />
        
        {/* The printed sleeve (the artwork) */}
        {texture ? (
          <mesh geometry={nodes.placeholder.geometry}>
            <meshStandardMaterial 
              map={texture} 
              roughness={0.1} 
              metalness={0.1} 
              side={THREE.DoubleSide} 
              transparent={false} 
              opacity={1}
            />
          </mesh>
        ) : (
          <mesh geometry={nodes.placeholder.geometry}>
            <meshStandardMaterial color="#ffffff" roughness={0.6} metalness={0.1} side={THREE.DoubleSide} />
          </mesh>
        )}
        
        {/* The foil overlay */}
        <mesh geometry={nodes.foil.geometry} material={materials.foil} />
      </group>
    </>
  );
}

// Preload both assets to ensure they are cached
useGLTF.preload(glbAsset.url);
if (typeof window !== 'undefined') {
  const img = new Image();
  img.src = textureAsset.url;
}
export default SwitchBox3D;