import React, { useRef, useEffect, useState } from 'react';
import { useGLTF, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

/**
 * Interactive Switch retail case implementation restored from untitled_6.
 * Uses the real SwitchCase.glb model and GZAfvAF3.jpg base texture.
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
  const { nodes, materials } = useGLTF('/source/SwitchCase.glb') as any;
  const group = useRef<THREE.Group>(null);
  
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null);

  useEffect(() => {
    let isMounted = true;
    const canvas = document.createElement('canvas');
    canvas.width = 1236;
    canvas.height = 951;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const drawTexture = async () => {
      try {
        // 1. Draw base texture (the original image from the zip)
        const baseImg = new Image();
        baseImg.src = '/textures/GZAfvAF3.jpg';
        await new Promise((resolve, reject) => {
          baseImg.onload = resolve;
          baseImg.onerror = reject;
        });
        
        if (!isMounted) return;
        ctx.drawImage(baseImg, 0, 0, canvas.width, canvas.height);

        // 2. Draw uploaded cover image
        if (coverImage) {
          const img = new Image();
          if (!coverImage.startsWith('data:')) {
            img.crossOrigin = 'anonymous';
          }
          img.src = coverImage;
          
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = (e) => {
              console.warn("Image load failed", e);
              resolve(null);
            };
          });
          
          if (!isMounted) return;
          
          // The uploaded cover is a full retail box insert (FRONT + SPINE + BACK)
          // Draw it over the entire canvas (1236x951)
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
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
          onReady?.();
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

  // Make sure foil has alpha
  if (materials.foil) {
    materials.foil.transparent = true;
    materials.foil.opacity = 0.5;
  }
  
  if (materials.plastic) {
    materials.plastic.transparent = true;
    materials.plastic.opacity = 0.8;
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
        makeDefault
      />
      
      <group ref={group} dispose={null} scale={0.5} position={[0, -0.4, 0]} rotation={[0, -Math.PI / 6, 0]}>
        <mesh geometry={nodes.box.geometry} material={materials.plastic} />
        
        {texture && (
          <mesh geometry={nodes.placeholder.geometry}>
            <meshStandardMaterial map={texture} roughness={0.6} metalness={0.1} side={THREE.DoubleSide} />
          </mesh>
        )}
        
        <mesh geometry={nodes.foil.geometry} material={materials.foil} />
      </group>
    </>
  );
}

useGLTF.preload('/source/SwitchCase.glb');
export default SwitchBox3D;
