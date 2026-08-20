import { useEffect, useMemo, useState } from "react";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

const CANVAS_W = 1236;
const CANVAS_H = 951;
const BACK_W = 588;
const SPINE_W = 60;
const FRONT_X = BACK_W + SPINE_W;
const FRONT_W = 588;

function makeFaceTexture(
  source: THREE.CanvasTexture | null,
  offset: number,
  width: number,
) {
  if (!source) return null;
  const face = source.clone();
  face.image = source.image;
  face.colorSpace = THREE.SRGBColorSpace;
  face.wrapS = THREE.ClampToEdgeWrapping;
  face.wrapT = THREE.ClampToEdgeWrapping;
  face.repeat.set(width / CANVAS_W, 1);
  face.offset.set(offset / CANVAS_W, 0);
  face.needsUpdate = true;
  return face;
}

/**
 * Interactive Switch retail case. The sleeve is built once as a continuous
 * back │ spine │ front sheet, then each physical face samples its own adjacent
 * range from that same texture. This avoids three independently fitted images
 * and therefore avoids visible cuts at the folds.
 */
export function SwitchBox3D({
  coverImage,
  platform,
  gameName,
  onReady,
}: {
  coverImage: string | null;
  platform: string;
  gameName: string;
  onReady?: () => void;
}) {
  const [sleeve, setSleeve] = useState<THREE.CanvasTexture | null>(null);

  useEffect(() => {
    let active = true;
    const canvas = document.createElement("canvas");
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const load = (src: string) =>
      new Promise<HTMLImageElement | null>((resolve) => {
        const image = new Image();
        if (!src.startsWith("data:")) image.crossOrigin = "anonymous";
        image.onload = () => resolve(image);
        image.onerror = () => resolve(null);
        image.src = src;
      });

    const drawCover = (
      image: HTMLImageElement,
      x: number,
      width: number,
      fit: "cover" | "contain",
    ) => {
      const scale =
        fit === "cover"
          ? Math.max(width / image.width, CANVAS_H / image.height)
          : Math.min(width / image.width, CANVAS_H / image.height);
      const dw = image.width * scale;
      const dh = image.height * scale;
      ctx.drawImage(image, x + (width - dw) / 2, (CANVAS_H - dh) / 2, dw, dh);
    };

    const buildSleeve = async () => {
      const image = coverImage ? await load(coverImage) : null;
      if (!active) return;

      ctx.fillStyle = platform === "ns2" ? "#b3000f" : "#e60012";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      if (image) {
        const isFullWrap = image.width / image.height > 1.16;
        if (isFullWrap) {
          // One source image across the complete UV sheet: no panel-by-panel crop.
          ctx.drawImage(image, 0, 0, CANVAS_W, CANVAS_H);
        } else {
          // Create one continuous ambient sleeve from the front cover. The
          // blurred cover crosses both folds, then the readable front is laid
          // on top without cropping any title or key art.
          ctx.save();
          ctx.filter = "blur(34px) saturate(1.35) brightness(0.7)";
          drawCover(image, -45, CANVAS_W + 90, "cover");
          ctx.restore();

          ctx.fillStyle = "rgba(0,0,0,0.38)";
          ctx.fillRect(0, 0, BACK_W, CANVAS_H);
          drawCover(image, FRONT_X, FRONT_W, "contain");

          // A translucent spine tint preserves the artwork underneath at both
          // folds rather than replacing it with an unrelated hard red strip.
          ctx.fillStyle = platform === "ns2" ? "rgba(179,0,15,0.76)" : "rgba(230,0,18,0.76)";
          ctx.fillRect(BACK_W, 0, SPINE_W, CANVAS_H);
          ctx.save();
          ctx.translate(BACK_W + SPINE_W / 2, 150);
          ctx.rotate(Math.PI / 2);
          ctx.fillStyle = "#ffffff";
          ctx.font = "700 28px sans-serif";
          ctx.textAlign = "left";
          ctx.shadowColor = "rgba(0,0,0,0.45)";
          ctx.shadowBlur = 4;
          ctx.fillText(gameName || "Game Title", 0, 9, CANVAS_H - 180);
          ctx.restore();
        }
      }

      const next = new THREE.CanvasTexture(canvas);
      next.colorSpace = THREE.SRGBColorSpace;
      next.anisotropy = 8;
      next.needsUpdate = true;
      if (active) {
        setSleeve((previous) => {
          previous?.dispose();
          return next;
        });
        onReady?.();
      }
    };

    void buildSleeve();
    return () => {
      active = false;
    };
  }, [coverImage, platform, gameName, onReady]);

  const faceMaps = useMemo(() => {
    const maps = {
      back: makeFaceTexture(sleeve, 0, BACK_W),
      spine: makeFaceTexture(sleeve, BACK_W, SPINE_W),
      front: makeFaceTexture(sleeve, FRONT_X, FRONT_W),
    };
    return maps;
  }, [sleeve]);

  useEffect(
    () => () => {
      faceMaps.front?.dispose();
      faceMaps.spine?.dispose();
      faceMaps.back?.dispose();
    },
    [faceMaps],
  );

  const shell = platform === "ns2" ? "#e60012" : "#e8edf2";

  return (
    <>
      <OrbitControls
        makeDefault
        enableRotate
        enableZoom={false}
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.85}
        minPolarAngle={Math.PI / 4}
        maxPolarAngle={Math.PI / 1.5}
      />

      <group scale={0.78} position={[0, -0.2, 0]} rotation={[0, -Math.PI / 7, 0]}>
        {/* Translucent plastic body and the four exposed shell edges. */}
        <mesh>
          <boxGeometry args={[6.18, 9.88, 0.72]} />
          <meshPhysicalMaterial
            color={shell}
            transparent
            opacity={0.8}
            roughness={0.3}
            transmission={0.06}
            clearcoat={0.75}
            clearcoatRoughness={0.24}
          />
        </mesh>

        {/* Adjacent regions of one continuous sleeve texture. */}
        {faceMaps.front && (
          <mesh position={[0, 0, 0.371]}>
            <planeGeometry args={[6, 9.7]} />
            <meshStandardMaterial map={faceMaps.front} roughness={0.56} metalness={0.02} />
          </mesh>
        )}
        {faceMaps.back && (
          <mesh position={[0, 0, -0.371]} rotation={[0, Math.PI, 0]}>
            <planeGeometry args={[6, 9.7]} />
            <meshStandardMaterial map={faceMaps.back} roughness={0.56} metalness={0.02} />
          </mesh>
        )}
        {faceMaps.spine && (
          <mesh position={[-3.091, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
            <planeGeometry args={[0.72, 9.7]} />
            <meshStandardMaterial map={faceMaps.spine} roughness={0.56} metalness={0.02} />
          </mesh>
        )}
      </group>
    </>
  );
}

export default SwitchBox3D;