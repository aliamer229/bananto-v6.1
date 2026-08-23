import React, { useRef, useEffect, useState, useMemo } from "react";
import { OrbitControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { readPrefs } from "@/lib/prefs";
import { isValidTrim, type TrimBox } from "@/lib/imageTrim";

export const SWITCH_GLB_URL = "/models/SwitchCase.glb";

export interface SwitchBox3DProps {
  /** Highest-resolution front cover available — see `resolveNintendoImage(…, "3d-texture")`. */
  coverImage: string | null;
  /** Crop rectangle for `coverImage`, so the box fills the face instead of floating in white. */
  coverTrim?: TrimBox | null | undefined;
  platform?: string;
  gameName?: string;
  onReady?: () => void;
}

/** Builds authentic procedural geometries for the Nintendo Switch case */
function createSwitchCaseGeometries() {
  const W = 6.2;
  const H = 10.25;
  const D = 0.68;
  const spineR = D / 2;

  // 1. Sleeve Insert Wrap Geometry
  const colsBack = 24;
  const colsSpine = 16;
  const colsFront = 24;
  const rows = 32;
  const totalCols = colsBack + colsSpine + colsFront;

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const uBackStart = 0.0;
  const uBackEnd = 588 / 1236;
  const uSpineEnd = (588 + 60) / 1236;
  const uFrontEnd = 1.0;

  for (let r = 0; r <= rows; r++) {
    const v = r / rows;
    const y = -H / 2 + v * H;

    // Back panel: x from +W/2 down to -(W/2 - spineR), z = -D/2
    for (let c = 0; c <= colsBack; c++) {
      const t = c / colsBack;
      const x = W / 2 - t * (W - spineR);
      const z = -D / 2;
      const u = uBackStart + t * (uBackEnd - uBackStart);
      positions.push(x, y, z);
      normals.push(0, 0, -1);
      uvs.push(u, v);
    }

    // Spine curve: angle from -PI/2 to -3PI/2 around center (-W/2 + spineR, 0)
    for (let c = 1; c <= colsSpine; c++) {
      const t = c / colsSpine;
      const angle = -Math.PI / 2 - t * Math.PI;
      const cx = -W / 2 + spineR;
      const x = cx + Math.cos(angle) * spineR;
      const z = Math.sin(angle) * spineR;
      const u = uBackEnd + t * (uSpineEnd - uBackEnd);
      const nx = Math.cos(angle);
      const nz = Math.sin(angle);
      positions.push(x, y, z);
      normals.push(nx, 0, nz);
      uvs.push(u, v);
    }

    // Front panel: x from -(W/2 - spineR) to +W/2, z = +D/2
    for (let c = 1; c <= colsFront; c++) {
      const t = c / colsFront;
      const x = -(W / 2 - spineR) + t * (W - spineR);
      const z = D / 2;
      const u = uSpineEnd + t * (uFrontEnd - uSpineEnd);
      positions.push(x, y, z);
      normals.push(0, 0, 1);
      uvs.push(u, v);
    }
  }

  const vertsPerRow = totalCols + 1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < totalCols; c++) {
      const i0 = r * vertsPerRow + c;
      const i1 = i0 + 1;
      const i2 = (r + 1) * vertsPerRow + c;
      const i3 = i2 + 1;

      indices.push(i0, i2, i1);
      indices.push(i1, i2, i3);
    }
  }

  const placeholder = new THREE.BufferGeometry();
  placeholder.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  placeholder.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  placeholder.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  placeholder.setIndex(indices);
  placeholder.computeVertexNormals();

  // 2. Plastic outer case
  const shape = new THREE.Shape();
  const boxW = 6.26;
  const boxH = 10.32;
  const r = 0.22;
  const x = -boxW / 2;
  const y = -boxH / 2;

  shape.moveTo(x + r, y);
  shape.lineTo(x + boxW - r, y);
  shape.quadraticCurveTo(x + boxW, y, x + boxW, y + r);
  shape.lineTo(x + boxW, y + boxH - r);
  shape.quadraticCurveTo(x + boxW, y + boxH, x + boxW - r, y + boxH);
  shape.lineTo(x + r, y + boxH);
  shape.quadraticCurveTo(x, y + boxH, x, y + boxH - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);

  const boxExtrudeSettings = {
    steps: 1,
    depth: 0.72,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.03,
    bevelOffset: 0,
    bevelSegments: 3,
  };
  const boxGeo = new THREE.ExtrudeGeometry(shape, boxExtrudeSettings);
  boxGeo.center();

  // 3. Foil protective outer sleeve
  const foilExtrudeSettings = {
    steps: 1,
    depth: 0.74,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.04,
    bevelOffset: 0,
    bevelSegments: 3,
  };
  const foilGeo = new THREE.ExtrudeGeometry(shape, foilExtrudeSettings);
  foilGeo.center();

  return {
    placeholder,
    box: boxGeo,
    foil: foilGeo,
  };
}

/**
 * Authentic 3D Nintendo Switch game box.
 */
export function SwitchBox3D({
  coverImage,
  coverTrim,
  platform = "ns1",
  gameName = "",
  onReady,
}: SwitchBox3DProps) {
  const { gl } = useThree();
  const group = useRef<THREE.Group>(null);
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null);

  const geometries = useMemo(() => createSwitchCaseGeometries(), []);

  const materials = useMemo(() => {
    const isSwitch2 = platform === "ns2";
    const plasticMat = new THREE.MeshStandardMaterial({
      transparent: true,
      opacity: isSwitch2 ? 0.26 : 0.12,
      depthWrite: false,
      depthTest: true,
      color: new THREE.Color(isSwitch2 ? "#d60012" : "#f5f5f5"),
      roughness: 0.04,
      metalness: 0.08,
    });

    const foilMat = new THREE.MeshStandardMaterial({
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      depthTest: true,
      roughness: 0.04,
      metalness: 0.06,
      color: new THREE.Color("#ffffff"),
    });

    return { plastic: plasticMat, foil: foilMat };
  }, [platform]);

  useEffect(() => {
    onReady?.();
  }, [onReady]);

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
        We enforce a minimum baseline of 2048px width so spine text, Nintendo
        branding, and vector art are super-sampled with razor-sharp fidelity.
      */
      const maxTexture = Math.min(gl?.capabilities?.maxTextureSize || 4096, 4096);
      const wanted = artW > 0 ? Math.ceil(artW / FRONT_FRACTION) : 2048;
      const width = Math.max(2048, Math.min(maxTexture, wanted));
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
      // Neutral background base instead of harsh black
      const bgGrad = ctx.createLinearGradient(0, 0, width, height);
      bgGrad.addColorStop(0, "#1c1f26");
      bgGrad.addColorStop(0.5, "#15181f");
      bgGrad.addColorStop(1, "#101217");
      ctx.fillStyle = bgGrad;
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
        // Spine
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

        // Front Header Band
        ctx.fillStyle = brandColor;
        ctx.fillRect(frontX, 0, frontW, 70 * scale);
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "left";
        ctx.font = `900 ${16 * scale}px system-ui, -apple-system, sans-serif`;
        ctx.fillText("NINTENDO SWITCH", frontX + 24 * scale, 42 * scale);

        // Front Center Title
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.textAlign = "center";
        ctx.font = `bold ${32 * scale}px system-ui, -apple-system, sans-serif`;
        ctx.fillText(gameName || "Nintendo Switch Game", frontX + frontW / 2, height / 2);
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
      // panel drops to a low mip and reads as blurred. Maximize anisotropic filtering.
      const maxAniso = gl?.capabilities?.getMaxAnisotropy?.() ?? 16;
      tex.anisotropy = Math.max(1, maxAniso);
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
        <mesh geometry={geometries.placeholder} renderOrder={1}>
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
        <mesh geometry={geometries.box} material={materials.plastic} renderOrder={2} />

        {/* 3. Foil protective outer sleeve */}
        <mesh geometry={geometries.foil} material={materials.foil} renderOrder={3} />
      </group>
    </>
  );
}

export default SwitchBox3D;
