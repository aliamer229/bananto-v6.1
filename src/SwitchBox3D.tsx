import React, { useRef, useEffect, useState } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

export function SwitchBox3D({
  coverImage,
  platform,
  gameName,
}: {
  coverImage: string | null;
  platform: string;
  gameName: string;
}) {
  const { nodes, materials } = useGLTF("/source/SwitchCase.glb") as any;
  const group = useRef<THREE.Group>(null);

  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null);

  useEffect(() => {
    let isMounted = true;
    const canvas = document.createElement("canvas");
    canvas.width = 1236;
    canvas.height = 951;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const drawTexture = async () => {
      try {
        // Spine and Cover Dimensions (1236 x 951)
        const backWidth = 588;
        const spineWidth = 60;
        const frontWidth = 588;
        const spineX = backWidth;
        const frontX = backWidth + spineWidth;

        // 1. Draw base texture if available
        try {
          const baseImg = new Image();
          baseImg.src = "/textures/GZAfvAF3.jpg";
          await new Promise((resolve) => {
            baseImg.onload = resolve;
            baseImg.onerror = resolve; // Graceful fallback
          });
          if (baseImg.complete && baseImg.naturalWidth > 0 && isMounted) {
            ctx.drawImage(baseImg, 0, 0, canvas.width, canvas.height);
          } else {
            // Default background if base image fails
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          }
        } catch {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        if (!isMounted) return;

        // 2. Draw uploaded cover image
        if (coverImage) {
          const img = new Image();
          if (!coverImage.startsWith("data:")) {
            img.crossOrigin = "anonymous";
          }
          img.src = coverImage;

          await new Promise((resolve) => {
            img.onload = resolve;
            img.onerror = resolve;
          });

          if (!isMounted) return;

          if (img.complete && img.naturalWidth > 0) {
            const aspect = img.naturalWidth / img.naturalHeight;

            if (aspect > 1.15) {
              // Full wrap sleeve (Back + Spine + Front)
              // The original sketchfab model's UV mapping wraps exactly over the entire canvas
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            } else {
              // Front-only cover artwork
              // Drawing exactly on the front section (588px width, starting at 588+60=648px)
              // And optionally on the back (0px width)
              ctx.drawImage(img, 0, 0, backWidth, canvas.height);
              ctx.drawImage(img, frontX, 0, frontWidth, canvas.height);

              // Styled Spine
              // Use the red color and labels for the spine
              ctx.fillStyle = "#e60012";
              ctx.fillRect(spineX, 0, spineWidth, canvas.height);

              ctx.save();
              ctx.translate(spineX + spineWidth / 2, 60);
              ctx.fillStyle = "#ffffff";
              ctx.textAlign = "center";
              ctx.font = "bold 15px sans-serif";
              ctx.fillText("SWITCH" + (platform === "ns2" ? " 2" : ""), 0, 0);
              ctx.restore();

              ctx.save();
              ctx.translate(spineX + spineWidth / 2, 180);
              ctx.rotate(Math.PI / 2);
              ctx.fillStyle = "#ffffff";
              ctx.font = "bold 24px sans-serif";
              ctx.textAlign = "left";
              const displayTitle =
                gameName && gameName.length > 38
                  ? gameName.slice(0, 35) + "..."
                  : gameName || "Game Title";
              ctx.fillText(displayTitle, 0, 8);
              ctx.restore();
            }
          }
        } else {
          // Fallback if no cover image
          ctx.fillStyle = "#e60012";
          ctx.fillRect(spineX, 0, spineWidth, canvas.height);

          ctx.save();
          ctx.translate(spineX + spineWidth / 2, 60);
          ctx.fillStyle = "#ffffff";
          ctx.textAlign = "center";
          ctx.font = "bold 15px sans-serif";
          ctx.fillText("SWITCH" + (platform === "ns2" ? " 2" : ""), 0, 0);
          ctx.restore();

          ctx.save();
          ctx.translate(spineX + spineWidth / 2, 180);
          ctx.rotate(Math.PI / 2);
          ctx.fillStyle = "#ffffff";
          ctx.font = "bold 24px sans-serif";
          ctx.textAlign = "left";
          ctx.fillText(gameName || "Game Title", 0, 8);
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
        console.error("Error drawing texture:", err);
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
    materials.plastic.color.set(platform === "ns2" ? "#e60012" : "#ffffff");
  }

  return (
    <group
      ref={group}
      dispose={null}
      scale={0.65}
      position={[0, -0.5, 0]}
      rotation={[0, -Math.PI / 6, 0]}
    >
      <mesh geometry={nodes.box.geometry} material={materials.plastic} />

      {texture && (
        <mesh geometry={nodes.placeholder.geometry}>
          <meshStandardMaterial
            map={texture}
            roughness={0.6}
            metalness={0.1}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      <mesh geometry={nodes.foil.geometry} material={materials.foil} />
    </group>
  );
}

useGLTF.preload("/source/SwitchCase.glb");

export default SwitchBox3D;
