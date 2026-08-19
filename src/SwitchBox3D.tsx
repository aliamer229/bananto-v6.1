import React, { useRef, useEffect, useState } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

export function SwitchBox3D({ coverImage, platform, gameName }: { coverImage: string | null, platform: string, gameName: string }) {
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

        // Spine and Cover Dimensions
        const backWidth = 588;
        const spineWidth = 60;
        const frontWidth = 588;
        const spineX = backWidth;
        const frontX = backWidth + spineWidth;

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
          // Draw it over the entire canvas
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        } else {
          // Fallback if no cover image
          // Draw Spine background
          ctx.fillStyle = '#e60012';
          ctx.fillRect(spineX, 0, spineWidth, canvas.height);

          // Draw Spine Text and Logo
          ctx.save();
          ctx.translate(spineX + spineWidth / 2, 80);
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          ctx.font = 'bold 16px sans-serif';
          ctx.fillText('SWITCH' + (platform === 'ns2' ? ' 2' : ''), 0, 0);
          ctx.restore();
          
          ctx.save();
          ctx.translate(spineX + spineWidth / 2, 200);
          ctx.rotate(Math.PI / 2);
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 28px sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText(gameName || 'Game Title', 0, 10);
          ctx.restore();
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
  }, [coverImage, platform, gameName]);

  // Make sure foil has alpha
  if (materials.foil) {
    materials.foil.transparent = true;
    materials.foil.opacity = 0.5;
  }
  
  if (materials.plastic) {
    materials.plastic.transparent = true;
    materials.plastic.opacity = 0.8;
    materials.plastic.color.set(platform === 'ns2' ? '#e60012' : '#ffffff');
  }

  return (
    <group ref={group} dispose={null} scale={0.65} position={[0, -0.5, 0]} rotation={[0, -Math.PI / 6, 0]}>
      <mesh geometry={nodes.box.geometry} material={materials.plastic} />
      
      {texture && (
        <mesh geometry={nodes.placeholder.geometry}>
          <meshStandardMaterial map={texture} roughness={0.6} metalness={0.1} side={THREE.DoubleSide} />
        </mesh>
      )}
      
      <mesh geometry={nodes.foil.geometry} material={materials.foil} />
    </group>
  );
}

useGLTF.preload('/source/SwitchCase.glb');

export default SwitchBox3D;
