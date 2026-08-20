import React, { useRef, useEffect, useState } from 'react';
import { useGLTF, OrbitControls } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
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
      if (onReady) onReady();
    }
  }, [nodes, materials, onReady]);

  useEffect(() => {
    let isMounted = true;
    
    const drawTexture = async () => {
      // 1. Create a canvas for the wrap-around texture (front + spine + back)
      // The SwitchCase.glb expects a single texture that wraps.
      // Based on the reference project, the dimensions are roughly 1236x951.
      const canvas = document.createElement('canvas');
      canvas.width = 1236;
      canvas.height = 951;
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) return;

      // Fill with base color (Switch red or Switch 2 color)
      ctx.fillStyle = platform === 'ns2' ? '#e60012' : '#e60012'; // Default to red
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 2. Load the base texture (the template from the reference project)
      const baseImg = new Image();
      baseImg.crossOrigin = "anonymous";
      
      const loadImg = (img: HTMLImageElement, url: string) => new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve;
        img.src = url;
      });

      await loadImg(baseImg, textureAsset.url);
      ctx.drawImage(baseImg, 0, 0, canvas.width, canvas.height);

      // 3. Load and draw the game cover if provided
      if (coverImage) {
        const coverImg = new Image();
        coverImg.crossOrigin = "anonymous";
        await loadImg(coverImg, coverImage);
        
        // Front cover position (right side of the template)
        // Based on the 1236x951 template:
        // Front is approximately from x=650 to x=1236
        // These values are calibrated to match the SwitchCase.glb UVs
        ctx.drawImage(coverImg, 638, 55, 545, 840);
      }

      if (isMounted) {
        const newTexture = new THREE.CanvasTexture(canvas);
        newTexture.colorSpace = THREE.SRGBColorSpace;
        newTexture.anisotropy = 8;
        setTexture(newTexture);
      }
    };

    drawTexture();

    return () => {
      isMounted = false;
    };
  }, [coverImage, platform, gameName]);

  // Configure materials for realistic transparency and reflections
  if (materials.foil) {
    materials.foil.transparent = true;
    materials.foil.opacity = 0.4;
    materials.foil.depthWrite = false;
    materials.foil.depthTest = true;
  }
  
  if (materials.plastic) {
    materials.plastic.transparent = true;
    materials.plastic.opacity = 0.8;
    materials.plastic.depthWrite = true;
    materials.plastic.depthTest = true;
    materials.plastic.color.set(platform === 'ns2' ? '#e60012' : '#ffffff');
    materials.plastic.roughness = 0.05;
    materials.plastic.metalness = 0.15;
    materials.plastic.envMapIntensity = 1.0;
  }

  useFrame((state) => {
    if (group.current) {
      // Rotation: 0.1 rad is ~5.7 deg, so roughly -3 deg to +3 deg
      group.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.1;
      group.current.rotation.x = Math.cos(state.clock.elapsedTime * 0.5) * 0.05;
      
      // Gentle floating: +/- 0.05 units
      group.current.position.y = Math.sin(state.clock.elapsedTime * 0.8) * 0.05 - 0.1;
    }
  });

  return (
    <>
      <OrbitControls
        enableZoom={false}
        enablePan={false}
        enableRotate={true}
        autoRotate={false}
        makeDefault
      />
      
      <group ref={group} dispose={null} scale={0.5} position={[0, -0.1, 0]} rotation={[0, -Math.PI / 6, 0]}>
        {/* 1. Printed sleeve (artwork) - Bottom layer of the sandwich */}
        <mesh geometry={nodes.placeholder.geometry} renderOrder={1}>
          <meshStandardMaterial 
            map={texture} 
            color={texture ? "#ffffff" : "#cccccc"}
            roughness={0.8} 
            metalness={0.0} 
            side={THREE.DoubleSide} 
            transparent={false} 
            opacity={1}
          />
        </mesh>
        
        {/* 2. Plastic outer case - Middle layer */}
        <mesh geometry={nodes.box.geometry} material={materials.plastic} renderOrder={2} />
        
        {/* 3. Foil overlay - Top layer */}
        <mesh geometry={nodes.foil.geometry} material={materials.foil} renderOrder={3} />
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
