import React, { useRef, useEffect, useState, forwardRef, useImperativeHandle } from "react";
import { OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";

export interface SwitchBox3DHandle {
  resetView: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
}

export interface SwitchBox3DProps {
  coverImage?: string | null;
  platform?: string;
  gameName?: string;
  isHiRes?: boolean;
  coverTrim?: unknown;
  onReady?: () => void;
}

// Global cached assets for 3D boxes
let cachedBaseTextureImg: HTMLImageElement | null = null;
const coverImageElementCache = new Map<string, HTMLImageElement>();

function loadCoverImage(coverImage: string): Promise<HTMLImageElement | null> {
  const existing = coverImageElementCache.get(coverImage);
  if (existing && existing.complete && existing.naturalWidth > 0) {
    return Promise.resolve(existing);
  }

  return new Promise((resolve) => {
    const img = new Image();
    if (/^https?:\/\//i.test(coverImage)) {
      try {
        if (new URL(coverImage).origin !== window.location.origin) {
          img.crossOrigin = "anonymous";
        }
      } catch {
        img.crossOrigin = "anonymous";
      }
    } else if (!coverImage.startsWith("data:")) {
      img.crossOrigin = "anonymous";
    }

    img.onload = () => {
      coverImageElementCache.set(coverImage, img);
      resolve(img);
    };
    img.onerror = () => resolve(null);
    img.src = coverImage;
  });
}

function loadBaseTexture(): Promise<HTMLImageElement | null> {
  if (cachedBaseTextureImg && cachedBaseTextureImg.complete && cachedBaseTextureImg.naturalWidth > 0) {
    return Promise.resolve(cachedBaseTextureImg);
  }

  return new Promise((resolve) => {
    const baseImg = new Image();
    baseImg.src = "/textures/GZAfvAF3.jpg";
    baseImg.onload = () => {
      cachedBaseTextureImg = baseImg;
      resolve(baseImg);
    };
    baseImg.onerror = () => resolve(null);
  });
}

export const SwitchBox3D = forwardRef<SwitchBox3DHandle, SwitchBox3DProps>(
  ({ coverImage, platform = "ns", gameName = "Nintendo Switch", onReady }, ref) => {
    const gltf = useGLTF("/source/SwitchCase.glb") as any;
    const nodes = gltf?.nodes || {};
    const materials = gltf?.materials || {};
    const scene = gltf?.scene;
    const group = useRef<THREE.Group>(null);
    const controlsRef = useRef<any>(null);

    // Resolve mesh nodes from nodes object or scene traverse
    const boxMesh = (nodes.box || scene?.getObjectByName?.("box")) as THREE.Mesh | undefined;
    const placeholderMesh = (nodes.placeholder || scene?.getObjectByName?.("placeholder")) as THREE.Mesh | undefined;
    const foilMesh = (nodes.foil || scene?.getObjectByName?.("foil")) as THREE.Mesh | undefined;

    useImperativeHandle(ref, () => ({
      resetView: () => {
        if (controlsRef.current) controlsRef.current.reset();
      },
      zoomIn: () => {},
      zoomOut: () => {},
    }));

    useEffect(() => {
      onReady?.();
    }, [onReady, nodes, scene]);

    const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null);

    useEffect(() => {
      let isMounted = true;
      const canvas = document.createElement("canvas");
      // Standard Nintendo Switch Case sleeve template resolution (1236 x 951)
      canvas.width = 1236;
      canvas.height = 951;
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) return;

      // Spine and Cover Dimensions
      const backWidth = 588;
      const spineWidth = 60;
      const frontWidth = 588;
      const spineX = backWidth;
      const frontX = backWidth + spineWidth;

      const isSwitch2 = platform === "ns2";
      const brandColor = isSwitch2 ? "#d60012" : "#e60012";

      const drawTexture = async () => {
        try {
          // Base fill
          ctx.fillStyle = "#111317";
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          try {
            const baseImg = await loadBaseTexture();
            if (isMounted && baseImg && baseImg.complete && baseImg.naturalWidth > 0) {
              ctx.drawImage(baseImg, 0, 0, canvas.width, canvas.height);
            }
          } catch {
            // base texture is optional
          }

          let artworkDrawn = false;

          // 2. Draw uploaded cover image
          if (coverImage) {
            const img = await loadCoverImage(coverImage);

            if (isMounted && img && img.complete && img.naturalWidth > 0) {
              artworkDrawn = true;
              const aspect = img.naturalWidth / img.naturalHeight;

              // The uploaded cover is a full retail box insert (FRONT + SPINE + BACK)
              if (aspect > 1.15) {
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              } else {
                // Front-only cover: draw on front, draw spine & back
                ctx.save();
                ctx.beginPath();
                ctx.rect(frontX, 0, frontWidth, canvas.height);
                ctx.clip();
                ctx.drawImage(img, frontX, 0, frontWidth, canvas.height);
                ctx.restore();

                // Spine
                ctx.save();
                ctx.fillStyle = brandColor;
                ctx.fillRect(spineX, 0, spineWidth, canvas.height);

                ctx.fillStyle = "#ffffff";
                ctx.textAlign = "center";
                ctx.font = "900 13px system-ui, -apple-system, sans-serif";
                ctx.fillText("NINTENDO", spineX + spineWidth / 2, 48);
                ctx.font = "900 15px system-ui, -apple-system, sans-serif";
                ctx.fillText(isSwitch2 ? "SWITCH 2" : "SWITCH", spineX + spineWidth / 2, 66);

                ctx.strokeStyle = "rgba(255,255,255,0.4)";
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(spineX + 8, 80);
                ctx.lineTo(spineX + spineWidth - 8, 80);
                ctx.stroke();

                const titleText = (gameName || "NINTENDO SWITCH GAME").toUpperCase();
                ctx.save();
                ctx.translate(spineX + spineWidth / 2, 110);
                ctx.rotate(Math.PI / 2);
                ctx.fillStyle = "#ffffff";
                ctx.textAlign = "left";
                ctx.font = "bold 22px system-ui, -apple-system, sans-serif";
                const maxSpineLength = canvas.height - 240;
                let renderedTitle = titleText;
                if (ctx.measureText(renderedTitle).width > maxSpineLength) {
                  while (
                    ctx.measureText(renderedTitle + "...").width > maxSpineLength &&
                    renderedTitle.length > 5
                  ) {
                    renderedTitle = renderedTitle.slice(0, -1);
                  }
                  renderedTitle += "...";
                }
                ctx.fillText(renderedTitle, 0, 7);
                ctx.restore();

                ctx.fillStyle = "#ffffff";
                ctx.textAlign = "center";
                ctx.font = "bold 14px system-ui, -apple-system, sans-serif";
                ctx.fillText("Nintendo", spineX + spineWidth / 2, canvas.height - 40);
                ctx.restore();

                // Back
                ctx.save();
                ctx.beginPath();
                ctx.rect(0, 0, backWidth, canvas.height);
                ctx.clip();

                ctx.filter = "blur(18px) brightness(0.55)";
                ctx.drawImage(img, -40, -40, backWidth + 80, canvas.height + 80);
                ctx.filter = "none";

                const backGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
                backGrad.addColorStop(0, "rgba(10, 12, 16, 0.65)");
                backGrad.addColorStop(0.5, "rgba(10, 12, 16, 0.45)");
                backGrad.addColorStop(1, "rgba(10, 12, 16, 0.95)");
                ctx.fillStyle = backGrad;
                ctx.fillRect(0, 0, backWidth, canvas.height);

                ctx.fillStyle = brandColor;
                ctx.fillRect(24, 28, backWidth - 48, 4);

                ctx.strokeStyle = "rgba(255,255,255,0.2)";
                ctx.lineWidth = 2;
                ctx.strokeRect(36, 70, backWidth - 72, 340);
                ctx.drawImage(img, 38, 72, backWidth - 76, 336);

                ctx.fillStyle = "#ffffff";
                ctx.font = "bold 26px system-ui, -apple-system, sans-serif";
                ctx.textAlign = "right";
                ctx.fillText(gameName || "Nintendo Switch", backWidth - 36, 460);

                ctx.fillStyle = "rgba(255,255,255,0.7)";
                ctx.font = "12px system-ui, -apple-system, sans-serif";
                ctx.fillText("TV Mode • Tabletop Mode • Handheld Mode", backWidth - 36, 490);
                ctx.fillText("1-4 Players • Pro Controller Compatible", backWidth - 36, 510);

                ctx.fillStyle = "rgba(255,255,255,0.4)";
                ctx.font = "10px monospace";
                ctx.fillText(
                  "Official Nintendo Licensed Product",
                  backWidth - 36,
                  canvas.height - 45,
                );
                ctx.restore();
              }
            }
          }

          if (!artworkDrawn) {
            // Fallback if no cover image
            ctx.fillStyle = brandColor;
            ctx.fillRect(spineX, 0, spineWidth, canvas.height);

            // Draw Spine Text and Logo
            ctx.save();
            ctx.translate(spineX + spineWidth / 2, 80);
            ctx.fillStyle = "#ffffff";
            ctx.textAlign = "center";
            ctx.font = "bold 16px sans-serif";
            ctx.fillText("SWITCH" + (isSwitch2 ? " 2" : ""), 0, 0);
            ctx.restore();

            ctx.save();
            ctx.translate(spineX + spineWidth / 2, 200);
            ctx.rotate(Math.PI / 2);
            ctx.fillStyle = "#ffffff";
            ctx.font = "bold 28px sans-serif";
            ctx.textAlign = "left";
            ctx.fillText(gameName || "Game Title", 0, 10);
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

    // Fallback plastic material when GLTF materials are generic
    const plasticMaterial = materials?.plastic || new THREE.MeshPhysicalMaterial({
      transparent: true,
      opacity: platform === "ns2" ? 0.4 : 0.25, // opacity: platform === "ns2" ? 0.4 : 0.25
      roughness: 0.1,
      metalness: 0.05,
      transmission: 0.85,
      ior: 1.5,
      thickness: 0.1,
      depthWrite: false, // depthWrite: false
      color: new THREE.Color(platform === "ns2" ? "#e60012" : "#ffffff"),
    });

    // Make sure foil has alpha
    if (materials?.foil) {
      materials.foil.transparent = true;
      materials.foil.opacity = 0.5;
      materials.foil.depthWrite = false; // depthWrite: false
    }

    if (materials?.plastic) {
      materials.plastic.transparent = true;
      materials.plastic.opacity = platform === "ns2" ? 0.4 : 0.25; // opacity: platform === "ns2" ? 0.4 : 0.25
      materials.plastic.depthWrite = false; // depthWrite: false
      materials.plastic.color.set(platform === "ns2" ? "#e60012" : "#ffffff");
    }

    const boxGeometry = boxMesh?.geometry || nodes?.box?.geometry;
    const placeholderGeometry = placeholderMesh?.geometry || nodes?.placeholder?.geometry;
    const foilGeometry = foilMesh?.geometry || nodes?.foil?.geometry;

    return (
      <group
        ref={group}
        dispose={null}
        scale={0.65}
        position={[0, -0.5, 0]}
        rotation={[0, -Math.PI / 6, 0]}
      >
        <OrbitControls
          ref={controlsRef}
          enablePan={false}
          enableZoom={true}
          enableDamping={true}
          dampingFactor={0.05}
          minDistance={2}
          maxDistance={30}
        />
        {boxGeometry && (
          <mesh geometry={boxGeometry} material={materials?.plastic || plasticMaterial} />
        )}

        {placeholderGeometry && (
          <mesh geometry={placeholderGeometry}>
            <meshStandardMaterial
              map={texture || undefined}
              roughness={0.6}
              metalness={0.1}
              side={THREE.DoubleSide}
              transparent={false}
              opacity={1}
              depthWrite={true}
              depthTest={true}
              color={texture ? "#ffffff" : "#1a1d24"}
            />
          </mesh>
        )}

        {foilGeometry && (
          <mesh geometry={foilGeometry} material={materials?.foil || foilMesh?.material} />
        )}
      </group>
    );
  },
);

SwitchBox3D.displayName = "SwitchBox3D";

useGLTF.preload("/source/SwitchCase.glb");

