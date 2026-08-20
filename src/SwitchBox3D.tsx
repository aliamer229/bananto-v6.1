import { useRef, useEffect, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "@react-three/drei";

import { useGLTF } from "@/hub/gamehub/useGltf";

const CANVAS_W = 1236;
const CANVAS_H = 951;
const BACK_W = 588;
const SPINE_W = 60;
const FRONT_W = 588;

/**
 * Nintendo Switch retail case.
 *
 * The GLB is UV-unwrapped so a single flat 1236x951 image wraps as
 * BACK (588) + SPINE (60) + FRONT (588). We build that flat image on a canvas:
 * a full wrap-around artwork is drawn as-is, while a front-only cover is
 * placed in the front panel (and mirrored/dimmed on the back) so it never
 * looks sliced.
 */
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
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const spineX = BACK_W;
    const frontX = BACK_W + SPINE_W;

    const loadImage = (src: string) =>
      new Promise<HTMLImageElement | null>((resolve) => {
        const img = new Image();
        if (!src.startsWith("data:")) img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
      });

    const drawSpine = () => {
      ctx.fillStyle = platform === "ns2" ? "#b3000f" : "#e60012";
      ctx.fillRect(spineX, 0, SPINE_W, CANVAS_H);

      ctx.save();
      ctx.translate(spineX + SPINE_W / 2, 80);
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.font = "bold 16px sans-serif";
      ctx.fillText("SWITCH" + (platform === "ns2" ? " 2" : ""), 0, 0);
      ctx.restore();

      ctx.save();
      ctx.translate(spineX + SPINE_W / 2, 200);
      ctx.rotate(Math.PI / 2);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 28px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(gameName || "Game Title", 0, 10);
      ctx.restore();
    };

    /** Draw `img` into a panel using cover-fit so it is never distorted. */
    const drawCover = (
      img: HTMLImageElement,
      x: number,
      y: number,
      w: number,
      h: number,
    ) => {
      const scale = Math.max(w / img.width, h / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
      ctx.restore();
    };

    /**
     * Front panel: the artwork must read as one whole cover, not a slice.
     * A blown-up blurred copy fills the panel edge to edge, then the artwork
     * itself is drawn fully contained on top — nothing important gets cut.
     */
    const drawContain = (
      img: HTMLImageElement,
      x: number,
      y: number,
      w: number,
      h: number,
    ) => {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();

      // Backdrop from the art itself so the panel never shows bare white bars.
      ctx.filter = "blur(28px) saturate(1.4) brightness(0.75)";
      const bScale = Math.max(w / img.width, h / img.height) * 1.25;
      const bw = img.width * bScale;
      const bh = img.height * bScale;
      ctx.drawImage(img, x + (w - bw) / 2, y + (h - bh) / 2, bw, bh);
      ctx.filter = "none";

      const scale = Math.min(w / img.width, h / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
      ctx.restore();
    };


    const drawTexture = async () => {
      try {
        const baseImg = await loadImage("/textures/GZAfvAF3.jpg");
        if (!isMounted) return;
        if (baseImg) ctx.drawImage(baseImg, 0, 0, CANVAS_W, CANVAS_H);
        else {
          ctx.fillStyle = "#f2f2f2";
          ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        }

        const img = coverImage ? await loadImage(coverImage) : null;
        if (!isMounted) return;

        if (img) {
          const ratio = img.width / img.height;
          const wrapRatio = CANVAS_W / CANVAS_H; // ~1.30 → full back+spine+front art
          const isFullWrap = ratio > wrapRatio * 0.85;

          if (isFullWrap) {
            ctx.drawImage(img, 0, 0, CANVAS_W, CANVAS_H);
          } else {
            // Front-only artwork: back panel gets a dimmed mirrored copy.
            ctx.save();
            ctx.translate(BACK_W, 0);
            ctx.scale(-1, 1);
            drawCover(img, 0, 0, BACK_W, CANVAS_H);
            ctx.restore();
            ctx.fillStyle = "rgba(0,0,0,0.55)";
            ctx.fillRect(0, 0, BACK_W, CANVAS_H);

            drawSpine();
            drawContain(img, frontX, 0, FRONT_W, CANVAS_H);

          }
        } else {
          drawSpine();
        }

        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.flipY = false;
        tex.anisotropy = 8;
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

    void drawTexture();

    return () => {
      isMounted = false;
    };
  }, [coverImage, platform, gameName]);

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
    <>
      <OrbitControls
        makeDefault
        enablePan={false}
        enableZoom={false}
        enableRotate
        rotateSpeed={0.9}
        minPolarAngle={Math.PI / 4}
        maxPolarAngle={Math.PI / 1.5}
        enableDamping
        dampingFactor={0.08}
      />

    <group ref={group} dispose={null} scale={0.65} position={[0, -0.5, 0]} rotation={[0, -Math.PI / 6, 0]}>
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

useGLTF.preload("/source/SwitchCase.glb");

export default SwitchBox3D;
