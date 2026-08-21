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
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null);

  useEffect(() => {
    if (nodes && materials) {
      onReady?.();
    }
  }, [nodes, materials, onReady]);

  useEffect(() => {
    let isMounted = true;
    const canvas = document.createElement("canvas");
    // Standard Nintendo Switch Case sleeve template resolution
    canvas.width = 1236;
    canvas.height = 951;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

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

        let artworkDrawn = false;

        if (coverImage) {
          const img = new Image();
          // Only a genuinely cross-origin image needs (and can use) CORS mode.
          // `cdnImage()` already rewrites remote artwork to the same-origin
          // /api/img proxy, and asking for CORS on a same-origin URL can only
          // fail the load — which left the sleeve on its dark base fill and made
          // the cartridge look black.
          if (/^https?:\/\//i.test(coverImage)) {
            try {
              if (new URL(coverImage).origin !== window.location.origin) {
                img.crossOrigin = "anonymous";
              }
            } catch {
              img.crossOrigin = "anonymous";
            }
          }

          await new Promise((resolve) => {
            img.onload = resolve;
            img.onerror = () => {
              console.warn("[SwitchBox3D] Cover image load error:", coverImage);
              resolve(null);
            };
            img.src = coverImage;
          });

          if (isMounted && img.complete && img.naturalWidth > 0) {
            artworkDrawn = true;
            const aspect = img.naturalWidth / img.naturalHeight;

            // If image is a full retail box sleeve wrap (aspect ratio > 1.15)
            if (aspect > 1.15) {
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            } else {
              // Image is a front-only cover art -> construct the authentic physical box art wrap:

              // 1. Front Cover Section (x = 648 to 1236)
              ctx.save();
              ctx.beginPath();
              ctx.rect(frontX, 0, frontWidth, canvas.height);
              ctx.clip();
              // Cover background / art
              ctx.drawImage(img, frontX, 0, frontWidth, canvas.height);
              ctx.restore();

              // 2. Spine Section (x = 588 to 648)
              ctx.save();
              ctx.fillStyle = brandColor;
              ctx.fillRect(spineX, 0, spineWidth, canvas.height);

              // Spine top Nintendo Switch mark
              ctx.fillStyle = "#ffffff";
              ctx.textAlign = "center";
              ctx.font = "900 13px system-ui, -apple-system, sans-serif";
              ctx.fillText("NINTENDO", spineX + spineWidth / 2, 48);
              ctx.font = "900 15px system-ui, -apple-system, sans-serif";
              ctx.fillText(isSwitch2 ? "SWITCH 2" : "SWITCH", spineX + spineWidth / 2, 66);

              // Red / White subtle separator line
              ctx.strokeStyle = "rgba(255,255,255,0.4)";
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(spineX + 8, 80);
              ctx.lineTo(spineX + spineWidth - 8, 80);
              ctx.stroke();

              // Spine Title (Rotated 90 degrees)
              const titleText = (gameName || "NINTENDO SWITCH GAME").toUpperCase();
              ctx.save();
              ctx.translate(spineX + spineWidth / 2, 110);
              ctx.rotate(Math.PI / 2);
              ctx.fillStyle = "#ffffff";
              ctx.textAlign = "left";
              ctx.font = "bold 22px system-ui, -apple-system, sans-serif";
              // Truncate title if too long for spine
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

              // Spine bottom Nintendo mark
              ctx.fillStyle = "#ffffff";
              ctx.textAlign = "center";
              ctx.font = "bold 14px system-ui, -apple-system, sans-serif";
              ctx.fillText("Nintendo", spineX + spineWidth / 2, canvas.height - 40);
              ctx.restore();

              // 3. Back Cover Section (x = 0 to 588)
              ctx.save();
              ctx.beginPath();
              ctx.rect(0, 0, backWidth, canvas.height);
              ctx.clip();

              // Atmospheric blurred artwork backdrop on the back
              ctx.filter = "blur(18px) brightness(0.55)";
              ctx.drawImage(img, -40, -40, backWidth + 80, canvas.height + 80);
              ctx.filter = "none";

              // Subtle overlay gradient on back cover
              const backGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
              backGrad.addColorStop(0, "rgba(10, 12, 16, 0.65)");
              backGrad.addColorStop(0.5, "rgba(10, 12, 16, 0.45)");
              backGrad.addColorStop(1, "rgba(10, 12, 16, 0.95)");
              ctx.fillStyle = backGrad;
              ctx.fillRect(0, 0, backWidth, canvas.height);

              // Back top bar with Switch branding
              ctx.fillStyle = brandColor;
              ctx.fillRect(24, 28, backWidth - 48, 4);

              // Back screenshot / card preview
              ctx.strokeStyle = "rgba(255,255,255,0.2)";
              ctx.lineWidth = 2;
              ctx.strokeRect(36, 70, backWidth - 72, 340);
              ctx.drawImage(img, 38, 72, backWidth - 76, 336);

              // Back game title
              ctx.fillStyle = "#ffffff";
              ctx.font = "bold 26px system-ui, -apple-system, sans-serif";
              ctx.textAlign = "right";
              ctx.fillText(gameName || "Nintendo Switch", backWidth - 36, 460);

              // Technical / Rating spec footer
              ctx.fillStyle = "rgba(255,255,255,0.7)";
              ctx.font = "12px system-ui, -apple-system, sans-serif";
              ctx.fillText("TV Mode • Tabletop Mode • Handheld Mode", backWidth - 36, 490);
              ctx.fillText("1-4 Players • Pro Controller Compatible", backWidth - 36, 510);

              // Footer legal & official seal
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

        // A cover that was supplied but never decoded used to fall through with
        // nothing but the dark base fill, so the case rendered as a black slab.
        // Treat it exactly like having no artwork at all.
        if (!artworkDrawn) {
          ctx.fillStyle = brandColor;
          ctx.fillRect(spineX, 0, spineWidth, canvas.height);

          ctx.fillStyle = "#ffffff";
          ctx.textAlign = "center";
          ctx.font = "bold 15px sans-serif";
          ctx.fillText("SWITCH", spineX + spineWidth / 2, 60);

          ctx.save();
          ctx.translate(spineX + spineWidth / 2, 120);
          ctx.rotate(Math.PI / 2);
          ctx.font = "bold 22px sans-serif";
          ctx.textAlign = "left";
          ctx.fillText(gameName || "Nintendo Switch", 0, 7);
          ctx.restore();
        }

        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = false;
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
        console.error("[SwitchBox3D] Error drawing canvas texture:", err);
      }
    };

    drawTexture();

    return () => {
      isMounted = false;
    };
  }, [coverImage, platform, gameName]);

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
            map={texture}
            // Tint only ever multiplies the map, so it must stay white once
            // there is artwork. Before the canvas is ready this used to paint a
            // near-white panel, which is what a missing texture looked like.
            color={texture ? "#ffffff" : "#3a3f47"}
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
