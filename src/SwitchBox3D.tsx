import React, { useRef, useEffect, useState } from "react";
import { useGLTF, OrbitControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { readPrefs } from "@/lib/prefs";
import { isValidTrim, type TrimBox } from "@/lib/imageTrim";

export const SWITCH_GLB_URL = "https://assets.banan.to/Pages/Glb/SwitchCase.glb";

export interface SwitchBox3DProps {
  /** Highest-resolution front cover available — see `resolveNintendoImage(…, "3d-texture")`. */
  coverImage: string | null;
  /** Crop rectangle for `coverImage`, so the box fills the face instead of floating in white. */
  coverTrim?: TrimBox | null | undefined;
  platform?: string;
  gameName?: string;
  onReady?: () => void;
}

/**
 * Authentic 3D Nintendo Switch game box, using the GLB hosted at
 * {@link SWITCH_GLB_URL}.
 *
 * ## The texture, and why it was soft
 *
 * The `placeholder` mesh is the printed insert: one sheet whose UVs run
 * back │ spine │ front. Handing it a front-only cover as the map therefore
 * stretched that cover across all three panels, so the front face showed
 * roughly the middle fifth of the artwork blown up — the "blurry 3D cover".
 * Three more things compounded it:
 *
 * - **Anisotropy was 1.** The box is always seen at an angle, which is the
 *   exact case anisotropic filtering exists for. At 1, mip selection is driven
 *   by the steepest axis and the whole face drops to a low mip.
 * - **The source was the listing cover**, sized for a 260px card.
 * - **Untrimmed art**: on a reference-01 source the actual box occupied ~40% of
 *   the file, so even a large file spent most of its pixels on white margin.
 *
 * So the sleeve is composited here instead, at a resolution derived from the
 * *source* image (capped by the GPU's `maxTextureSize`), with the crop applied
 * so every texel of the front panel is artwork. `LinearMipmapLinearFilter` plus
 * `capabilities.getMaxAnisotropy()` keeps it sharp at grazing angles, and
 * `SRGBColorSpace` keeps it the colour the file says it is.
 *
 * Switching product disposes the previous texture and its canvas, so nothing
 * stale is left bound to the material.
 */
export function SwitchBox3D({
  coverImage,
  coverTrim,
  platform = "ns1",
  gameName = "",
  onReady,
}: SwitchBox3DProps) {
  const { nodes, materials } = useGLTF(SWITCH_GLB_URL) as any;
  const { gl } = useThree();
  const group = useRef<THREE.Group>(null);
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null);

  useEffect(() => {
    if (nodes && materials) {
      onReady?.();
    }
  }, [nodes, materials, onReady]);

  useEffect(() => {
    let isMounted = true;

    /*
      Sleeve proportions. The reference insert is 1236 x 951 with the spine
      centred, which is what the GLB's UVs were authored against; only the
      pixel density changes below, never these ratios.
    */
    const LAYOUT = { back: 588, spine: 60, front: 588, height: 951 };
    const TEMPLATE_W = LAYOUT.back + LAYOUT.spine + LAYOUT.front;
    const FRONT_FRACTION = LAYOUT.front / TEMPLATE_W;

    const canvas = document.createElement("canvas");
    const isSwitch2 = platform === "ns2";
    const brandColor = isSwitch2 ? "#d60012" : "#e60012";

    const drawTexture = async () => {
      let img: HTMLImageElement | null = null;

      if (coverImage) {
        img = await new Promise<HTMLImageElement | null>((resolve) => {
          const el = new Image();
          // cdnImage() proxies remote artwork through the same-origin /api/img,
          // so only genuinely cross-origin URLs need (or can use) CORS mode —
          // asking for it on a same-origin URL can only fail the load.
          if (/^https?:\/\//i.test(coverImage)) {
            try {
              if (new URL(coverImage).origin !== window.location.origin) {
                el.crossOrigin = "anonymous";
              }
            } catch {
              el.crossOrigin = "anonymous";
            }
          }
          el.onload = () => resolve(el);
          el.onerror = () => {
            console.warn("[SwitchBox3D] Cover image load error:", coverImage);
            resolve(null);
          };
          el.src = coverImage;
        });
      }

      if (!isMounted) return;

      const trim = isValidTrim(coverTrim) ? (coverTrim as TrimBox) : null;
      const artW = img ? img.naturalWidth * (trim?.width ?? 1) : 0;

      /*
        Size the sleeve so the front panel is at least as wide as the artwork
        that lands on it — anything less throws away source detail before the
        GPU ever sees it. Bounded by what this GPU will actually sample and by
        4096 (a 4096 x 3153 RGBA texture is already ~50 MB with mipmaps).
      */
      const maxTexture = Math.min(gl?.capabilities?.maxTextureSize || 4096, 4096);
      const wanted = artW > 0 ? Math.ceil(artW / FRONT_FRACTION) : TEMPLATE_W;
      const width = Math.max(TEMPLATE_W, Math.min(maxTexture, wanted));
      const height = Math.round(width * (LAYOUT.height / TEMPLATE_W));

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) return;

      const scale = width / TEMPLATE_W;
      const backW = LAYOUT.back * scale;
      const spineW = LAYOUT.spine * scale;
      const spineX = backW;
      const frontX = backW + spineW;
      const frontW = LAYOUT.front * scale;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.fillStyle = "#111317";
      ctx.fillRect(0, 0, width, height);

      let artworkDrawn = false;

      if (img && img.naturalWidth > 0) {
        artworkDrawn = true;

        // Source rectangle inside the file: the trimmed artwork when we have a
        // crop, the whole file otherwise. Every draw below samples this, so the
        // empty margin never reaches the sleeve.
        const sx = (trim?.left ?? 0) * img.naturalWidth;
        const sy = (trim?.top ?? 0) * img.naturalHeight;
        const sw = (trim?.width ?? 1) * img.naturalWidth;
        const sh = (trim?.height ?? 1) * img.naturalHeight;

        if (sw / sh > 1.15) {
          // Already a full back│spine│front wrap: use it as authored.
          ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height);
        } else {
          // Front panel — the artwork, edge to edge.
          ctx.drawImage(img, sx, sy, sw, sh, frontX, 0, frontW, height);

          // Spine.
          ctx.save();
          ctx.fillStyle = brandColor;
          ctx.fillRect(spineX, 0, spineW, height);
          ctx.fillStyle = "#ffffff";
          ctx.textAlign = "center";
          ctx.font = `900 ${13 * scale}px system-ui, -apple-system, sans-serif`;
          ctx.fillText("NINTENDO", spineX + spineW / 2, 48 * scale);
          ctx.font = `900 ${15 * scale}px system-ui, -apple-system, sans-serif`;
          ctx.fillText(isSwitch2 ? "SWITCH 2" : "SWITCH", spineX + spineW / 2, 66 * scale);

          ctx.strokeStyle = "rgba(255,255,255,0.4)";
          ctx.lineWidth = Math.max(1, scale);
          ctx.beginPath();
          ctx.moveTo(spineX + 8 * scale, 80 * scale);
          ctx.lineTo(spineX + spineW - 8 * scale, 80 * scale);
          ctx.stroke();

          const titleText = (gameName || "NINTENDO SWITCH GAME").toUpperCase();
          ctx.save();
          ctx.translate(spineX + spineW / 2, 110 * scale);
          ctx.rotate(Math.PI / 2);
          ctx.fillStyle = "#ffffff";
          ctx.textAlign = "left";
          ctx.font = `bold ${22 * scale}px system-ui, -apple-system, sans-serif`;
          const maxSpineLength = height - 240 * scale;
          let renderedTitle = titleText;
          if (ctx.measureText(renderedTitle).width > maxSpineLength) {
            while (
              ctx.measureText(`${renderedTitle}...`).width > maxSpineLength &&
              renderedTitle.length > 5
            ) {
              renderedTitle = renderedTitle.slice(0, -1);
            }
            renderedTitle += "...";
          }
          ctx.fillText(renderedTitle, 0, 7 * scale);
          ctx.restore();

          ctx.fillStyle = "#ffffff";
          ctx.textAlign = "center";
          ctx.font = `bold ${14 * scale}px system-ui, -apple-system, sans-serif`;
          ctx.fillText("Nintendo", spineX + spineW / 2, height - 40 * scale);
          ctx.restore();

          // Back panel: a darkened, blurred wash of the same artwork with a
          // framed still, which is what a retail back reads as at this size.
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, 0, backW, height);
          ctx.clip();
          ctx.filter = `blur(${18 * scale}px) brightness(0.55)`;
          ctx.drawImage(
            img,
            sx,
            sy,
            sw,
            sh,
            -40 * scale,
            -40 * scale,
            backW + 80 * scale,
            height + 80 * scale,
          );
          ctx.filter = "none";

          const backGrad = ctx.createLinearGradient(0, 0, 0, height);
          backGrad.addColorStop(0, "rgba(10, 12, 16, 0.65)");
          backGrad.addColorStop(0.5, "rgba(10, 12, 16, 0.45)");
          backGrad.addColorStop(1, "rgba(10, 12, 16, 0.95)");
          ctx.fillStyle = backGrad;
          ctx.fillRect(0, 0, backW, height);

          ctx.fillStyle = brandColor;
          ctx.fillRect(24 * scale, 28 * scale, backW - 48 * scale, 4 * scale);

          ctx.strokeStyle = "rgba(255,255,255,0.2)";
          ctx.lineWidth = 2 * scale;
          ctx.strokeRect(36 * scale, 70 * scale, backW - 72 * scale, 340 * scale);
          ctx.drawImage(
            img,
            sx,
            sy,
            sw,
            sh,
            38 * scale,
            72 * scale,
            backW - 76 * scale,
            336 * scale,
          );

          ctx.fillStyle = "#ffffff";
          ctx.font = `bold ${26 * scale}px system-ui, -apple-system, sans-serif`;
          ctx.textAlign = "right";
          ctx.fillText(gameName || "Nintendo Switch", backW - 36 * scale, 460 * scale);

          ctx.fillStyle = "rgba(255,255,255,0.7)";
          ctx.font = `${12 * scale}px system-ui, -apple-system, sans-serif`;
          ctx.fillText("TV Mode • Tabletop Mode • Handheld Mode", backW - 36 * scale, 490 * scale);
          ctx.fillText("1-4 Players • Pro Controller Compatible", backW - 36 * scale, 510 * scale);

          ctx.fillStyle = "rgba(255,255,255,0.4)";
          ctx.font = `${10 * scale}px monospace`;
          ctx.fillText(
            "Official Nintendo Licensed Product",
            backW - 36 * scale,
            height - 45 * scale,
          );
          ctx.restore();
        }
      }

      // A cover that was supplied but never decoded used to fall through with
      // nothing but the dark base fill, so the case rendered as a black slab.
      // Treat it exactly like having no artwork at all.
      if (!artworkDrawn) {
        ctx.fillStyle = brandColor;
        ctx.fillRect(spineX, 0, spineW, height);

        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.font = `bold ${15 * scale}px sans-serif`;
        ctx.fillText("SWITCH", spineX + spineW / 2, 60 * scale);

        ctx.save();
        ctx.translate(spineX + spineW / 2, 120 * scale);
        ctx.rotate(Math.PI / 2);
        ctx.font = `bold ${22 * scale}px sans-serif`;
        ctx.textAlign = "left";
        ctx.fillText((gameName || "NINTENDO SWITCH").toUpperCase(), 0, 7 * scale);
        ctx.restore();

        ctx.fillStyle = "rgba(255,255,255,0.75)";
        ctx.textAlign = "center";
        ctx.font = `bold ${34 * scale}px system-ui, -apple-system, sans-serif`;
        ctx.fillText(gameName || "Nintendo Switch", frontX + frontW / 2, height / 2);
      }

      if (!isMounted) return;

      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      // glTF UVs have their origin at the top-left, which is also the canvas'.
      tex.flipY = false;
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      // The face is nearly always viewed at an angle; without this the whole
      // panel drops to a low mip and reads as blurred.
      tex.anisotropy = gl?.capabilities?.getMaxAnisotropy?.() ?? 1;
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.needsUpdate = true;

      setTexture((prev) => {
        if (prev) prev.dispose();
        return tex;
      });
    };

    void drawTexture();

    return () => {
      isMounted = false;
    };
  }, [coverImage, coverTrim, platform, gameName, gl]);

  // Release the last texture when the viewer unmounts, so navigating away from
  // a product does not leave its sleeve resident on the GPU.
  useEffect(
    () => () => {
      setTexture((prev) => {
        if (prev) prev.dispose();
        return null;
      });
    },
    [],
  );

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
