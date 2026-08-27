import React, { useRef, useEffect, useMemo, useState, forwardRef, useImperativeHandle } from "react";
import { OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";

import { nintendoCaseModelUrl } from "@/config/publicAssets";
import { applySleeveTexture } from "@/lib/sleeveTexture";

/**
 * The Nintendo keep case, rendered from the canonical Cloudflare R2 geometry.
 *
 * ## Geometry and artwork are different things
 *
 * The GLB is a **reusable physical case** — one authored in Blender, three
 * meshes (`box`, `foil`, `placeholder`), no textures baked in. Every Nintendo
 * game in the store renders on that same geometry. What changes per product is
 * the artwork painted onto the `placeholder` sleeve, which comes from the
 * product's own media fields. A game never needs its own model.
 *
 * ## The texture contract, read off the model rather than guessed
 *
 * `placeholder` is a single wrap that folds around the case, and its authored
 * UVs lay the three faces out left→right across one image:
 *
 * ```
 *   U 0.000 ─────────── 0.473 ── 0.526 ─────────── 1.000
 *          │    BACK          │ SPINE │    FRONT       │
 * ```
 *
 * V runs top→bottom (0 at the top edge), which is image order, so the texture
 * is uploaded with `flipY = false`. The canvas below is built to exactly that
 * layout: 1236 × 951, with 588 px of back, 60 px of spine and 588 px of front.
 *
 * Those numbers are measured from the model's own `TEXCOORD_0` accessor, not
 * invented, and the UVs themselves are never touched. If the artwork looks
 * wrong the bug is in which image was chosen or how it was composited — the
 * mapping is already correct.
 *
 * ## Two texture modes, declared by the caller
 *
 * The component does not sniff aspect ratios to decide what it was handed.
 *
 * - `wrap` — the caller resolved a real **3D Texture Source**: one image that
 *   already contains back + spine + front. It is drawn across the whole canvas
 *   untouched, which is the faithful path.
 * - `composed` — no wrap exists, and the caller has explicitly opted to build
 *   one from the **Front Box Cover**. The front region gets the artwork; spine
 *   and back are generated. This is a deliberate, visible fallback chosen by
 *   the caller, not a silent substitution inside a resolver.
 */

export interface SwitchBox3DHandle {
  resetView: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
}

export type SwitchBoxTextureMode = "wrap" | "composed";

export interface SwitchBox3DProps {
  /** The artwork to paint on the sleeve. */
  coverImage?: string | null;
  /**
   * How to interpret `coverImage`. `wrap` = a full back+spine+front insert;
   * `composed` = front-only art the component must build a sleeve around.
   */
  textureMode?: SwitchBoxTextureMode;
  platform?: string;
  gameName?: string;
  coverTrim?: unknown;
  /**
   * Geometry has arrived. **Not** a signal that anything is visible yet — the
   * case is untextured at this point, which is exactly the state that used to
   * be revealed to customers as a grey box.
   */
  onReady?: () => void;
  /**
   * Artwork is on the mesh. This is the one that means "safe to show".
   */
  onTextured?: () => void;
  /** Reported when the artwork or the model could not be used. */
  onTextureError?: (reason: string) => void;
}

/** The printable sleeve layout, in pixels, matching the model's authored UVs. */
const SLEEVE = {
  width: 1236,
  height: 951,
  backWidth: 588,
  spineWidth: 60,
  frontWidth: 588,
} as const;

const SPINE_X = SLEEVE.backWidth;
const FRONT_X = SLEEVE.backWidth + SLEEVE.spineWidth;


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

/**
 * The blank case texture the model was authored against — plastic sheen and
 * fold shading, no game artwork. It is a static model resource, not product
 * media, so it lives with the other build assets rather than in a product row.
 */
function loadBaseTexture(): Promise<HTMLImageElement | null> {
  if (
    cachedBaseTextureImg &&
    cachedBaseTextureImg.complete &&
    cachedBaseTextureImg.naturalWidth > 0
  ) {
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

/** Copies a node's authored transform onto the mesh that borrows its geometry. */
function applyNodeTransform(target: THREE.Object3D | null, source: THREE.Object3D | undefined) {
  if (!target || !source) return;
  target.position.copy(source.position);
  target.quaternion.copy(source.quaternion);
  target.scale.copy(source.scale);
}

export const SwitchBox3D = forwardRef<SwitchBox3DHandle, SwitchBox3DProps>(
  (
    {
      coverImage,
      textureMode = "composed",
      platform = "ns",
      gameName = "Nintendo Switch",
      onReady,
      onTextured,
      onTextureError,
    },
    ref,
  ) => {
    // Cloudflare R2 is the source of truth for the geometry. The URL is
    // same-origin and extension-less on purpose — see src/config/publicAssets.ts.
    const modelUrl = nintendoCaseModelUrl(platform);
    const gltf = useGLTF(modelUrl) as any;
    const materials = gltf?.materials || {};
    const scene = gltf?.scene;
    const group = useRef<THREE.Group>(null);
    const controlsRef = useRef<any>(null);

    // Resolve the three authored meshes once per loaded model. `gltf.nodes` is
    // a fresh object each render, so reading it inline made every effect that
    // depended on it re-run on every frame.
    const { boxNode, placeholderNode, foilNode } = useMemo(() => {
      const nodes = gltf?.nodes || {};
      const byName = (name: string) =>
        (nodes[name] || scene?.getObjectByName?.(name)) as THREE.Mesh | undefined;
      return {
        boxNode: byName("box"),
        placeholderNode: byName("placeholder"),
        foilNode: byName("foil"),
      };
    }, [gltf, scene]);

    const boxRef = useRef<THREE.Mesh>(null);
    const placeholderRef = useRef<THREE.Mesh>(null);
    const foilRef = useRef<THREE.Mesh>(null);

    useImperativeHandle(ref, () => ({
      resetView: () => {
        if (controlsRef.current) controlsRef.current.reset();
      },
      zoomIn: () => {},
      zoomOut: () => {},
    }));

    useEffect(() => {
      onReady?.();
    }, [onReady, scene]);


    // The GLB carries per-node scale and translation (the sleeve sits fractionally
    // proud of the shell). Borrowing only `geometry` would drop those and float
    // the artwork off the case, so the authored transforms are copied across.
    useEffect(() => {
      applyNodeTransform(boxRef.current, boxNode);
      applyNodeTransform(placeholderRef.current, placeholderNode);
      applyNodeTransform(foilRef.current, foilNode);
    }, [boxNode, placeholderNode, foilNode]);

    const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null);
    const sleeveMaterialRef = useRef<THREE.MeshStandardMaterial>(null);

    /*
      Applying the artwork is a two-step operation, and skipping the second step
      is what produced the grey case. See `applySleeveTexture`.
    */
    useEffect(() => {
      applySleeveTexture(sleeveMaterialRef.current, texture);
    }, [texture]);
    /*
      The signal the stage actually reveals on. `scene` resolving only means the
      glTF arrived; the mesh is still wearing its authored placeholder material
      until the composited artwork is uploaded. Reporting readiness at the
      former is how an untextured case reached production.
    */
    useEffect(() => {
      if (scene && texture) onTextured?.();
    }, [onTextured, scene, texture]);

    useEffect(() => {
      let isMounted = true;
      const canvas = document.createElement("canvas");
      canvas.width = SLEEVE.width;
      canvas.height = SLEEVE.height;
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) return;

      const isSwitch2 = platform === "ns2" || platform === "switch2";
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

          if (coverImage) {
            const img = await loadCoverImage(coverImage);
            if (!img && isMounted) {
              onTextureError?.("artwork_load_failed");
            }

            if (isMounted && img && img.complete && img.naturalWidth > 0) {
              artworkDrawn = true;

              if (textureMode === "wrap") {
                // A real 3D Texture Source: back + spine + front already laid
                // out. Drawn edge to edge, untouched — the model's UVs do the
                // rest.
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              } else {
                // Front Box Cover only. Paint the front region, then build the
                // spine and back the printed insert would have carried.
                ctx.save();
                ctx.beginPath();
                ctx.rect(FRONT_X, 0, SLEEVE.frontWidth, canvas.height);
                ctx.clip();
                ctx.drawImage(img, FRONT_X, 0, SLEEVE.frontWidth, canvas.height);
                ctx.restore();

                // Spine
                ctx.save();
                ctx.fillStyle = brandColor;
                ctx.fillRect(SPINE_X, 0, SLEEVE.spineWidth, canvas.height);

                ctx.fillStyle = "#ffffff";
                ctx.textAlign = "center";
                ctx.font = "900 13px system-ui, -apple-system, sans-serif";
                ctx.fillText("NINTENDO", SPINE_X + SLEEVE.spineWidth / 2, 48);
                ctx.font = "900 15px system-ui, -apple-system, sans-serif";
                ctx.fillText(
                  isSwitch2 ? "SWITCH 2" : "SWITCH",
                  SPINE_X + SLEEVE.spineWidth / 2,
                  66,
                );

                ctx.strokeStyle = "rgba(255,255,255,0.4)";
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(SPINE_X + 8, 80);
                ctx.lineTo(SPINE_X + SLEEVE.spineWidth - 8, 80);
                ctx.stroke();

                const titleText = (gameName || "NINTENDO SWITCH GAME").toUpperCase();
                ctx.save();
                ctx.translate(SPINE_X + SLEEVE.spineWidth / 2, 110);
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
                ctx.fillText("Nintendo", SPINE_X + SLEEVE.spineWidth / 2, canvas.height - 40);
                ctx.restore();

                // Back
                ctx.save();
                ctx.beginPath();
                ctx.rect(0, 0, SLEEVE.backWidth, canvas.height);
                ctx.clip();

                ctx.filter = "blur(18px) brightness(0.55)";
                ctx.drawImage(img, -40, -40, SLEEVE.backWidth + 80, canvas.height + 80);
                ctx.filter = "none";

                const backGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
                backGrad.addColorStop(0, "rgba(10, 12, 16, 0.65)");
                backGrad.addColorStop(0.5, "rgba(10, 12, 16, 0.45)");
                backGrad.addColorStop(1, "rgba(10, 12, 16, 0.95)");
                ctx.fillStyle = backGrad;
                ctx.fillRect(0, 0, SLEEVE.backWidth, canvas.height);

                ctx.fillStyle = brandColor;
                ctx.fillRect(24, 28, SLEEVE.backWidth - 48, 4);

                ctx.strokeStyle = "rgba(255,255,255,0.2)";
                ctx.lineWidth = 2;
                ctx.strokeRect(36, 70, SLEEVE.backWidth - 72, 340);
                ctx.drawImage(img, 38, 72, SLEEVE.backWidth - 76, 336);

                ctx.fillStyle = "#ffffff";
                ctx.font = "bold 26px system-ui, -apple-system, sans-serif";
                ctx.textAlign = "right";
                ctx.fillText(gameName || "Nintendo Switch", SLEEVE.backWidth - 36, 460);

                ctx.fillStyle = "rgba(255,255,255,0.7)";
                ctx.font = "12px system-ui, -apple-system, sans-serif";
                ctx.fillText(
                  "TV Mode • Tabletop Mode • Handheld Mode",
                  SLEEVE.backWidth - 36,
                  490,
                );
                ctx.fillText("1-4 Players • Pro Controller Compatible", SLEEVE.backWidth - 36, 510);

                ctx.fillStyle = "rgba(255,255,255,0.4)";
                ctx.font = "10px monospace";
                ctx.fillText(
                  "Official Nintendo Licensed Product",
                  SLEEVE.backWidth - 36,
                  canvas.height - 45,
                );
                ctx.restore();
              }
            }
          }

          /*
            No artwork means no case.

            This used to compose a "blank retail case" — brand-coloured spine,
            game title, nothing on the front — and then upload it like any other
            texture. That is precisely the grey box customers were seeing: the
            artwork 404s or fails CORS, and the viewer confidently renders an
            empty case as though that were the product.

            Refusing to build a texture at all is what makes the guarantee
            structural instead of a race between `onTextureError` and
            `onTextured`. `texture` is only ever set with real artwork on it, so
            the stage can only ever reveal a painted case.
          */
          if (!artworkDrawn) {
            if (isMounted) onTextureError?.(coverImage ? "artwork_unusable" : "no_artwork");
            return;
          }

          const tex = new THREE.CanvasTexture(canvas);
          tex.colorSpace = THREE.SRGBColorSpace;
          // The model's V axis runs top→bottom, matching image order.
          tex.flipY = false;
          tex.needsUpdate = true;

          if (isMounted) {
            setTexture((prev) => {
              if (prev) prev.dispose();
              return tex;
            });
          }
        } catch (err) {
          console.error("[3D] texture composition failed:", err);
          onTextureError?.("texture_composition_failed");
        }
      };

      drawTexture();

      return () => {
        isMounted = false;
      };
    }, [coverImage, textureMode, platform, gameName, onTextureError]);

    // Dispose the canvas texture when the case unmounts, so repeatedly opening
    // product pages on a phone does not accumulate GPU memory.
    useEffect(() => {
      return () => {
        setTexture((prev) => {
          if (prev) prev.dispose();
          return null;
        });
      };
    }, []);

    const isSwitch2 = platform === "ns2" || platform === "switch2";

    // Fallback plastic material when GLTF materials are generic
    const plasticMaterial =
      materials?.plastic ||
      new THREE.MeshPhysicalMaterial({
        transparent: true,
        opacity: isSwitch2 ? 0.4 : 0.25,
        roughness: 0.1,
        metalness: 0.05,
        transmission: 0.85,
        ior: 1.5,
        thickness: 0.1,
        depthWrite: false,
        color: new THREE.Color(isSwitch2 ? "#e60012" : "#ffffff"),
      });

    // Make sure foil has alpha
    if (materials?.foil) {
      materials.foil.transparent = true;
      materials.foil.opacity = 0.5;
      materials.foil.depthWrite = false;
    }

    // The shell tint is the only physical difference between a Switch and a
    // Switch 2 case, which is why both share one geometry.
    if (materials?.plastic) {
      materials.plastic.transparent = true;
      materials.plastic.opacity = isSwitch2 ? 0.4 : 0.25;
      materials.plastic.depthWrite = false;
      materials.plastic.color.set(isSwitch2 ? "#e60012" : "#ffffff");
    }

    const boxGeometry = boxNode?.geometry;
    const placeholderGeometry = placeholderNode?.geometry;
    const foilGeometry = foilNode?.geometry;

    return (
      <group
        ref={group}
        dispose={null}
        scale={0.65}
        position={[0, -0.5, 0]}
        rotation={[0, -Math.PI / 6, 0]}
        /*
          Nothing is drawn until the sleeve is wearing its artwork. The stage
          only reveals this layer once `onTextured` fires, so this is belt and
          braces — but it is the difference between "the grey case is unlikely"
          and "there is no frame in which a grey case can be drawn".
        */
        visible={Boolean(texture)}
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
          <mesh ref={boxRef} geometry={boxGeometry} material={materials?.plastic || plasticMaterial} />
        )}

        {placeholderGeometry && (
          <mesh ref={placeholderRef} geometry={placeholderGeometry}>
            {/*
              `map` is deliberately not a prop here. R3F would assign it on the
              next render without bumping the material version, which leaves the
              already-compiled shader sampling nothing — see
              `applySleeveTexture`. The effect above is the single writer.
            */}
            <meshStandardMaterial
              ref={sleeveMaterialRef}
              roughness={0.6}
              metalness={0.1}
              side={THREE.DoubleSide}
              transparent={false}
              opacity={1}
              depthWrite={true}
              depthTest={true}
              color="#ffffff"
            />
          </mesh>
        )}

        {foilGeometry && (
          <mesh ref={foilRef} geometry={foilGeometry} material={materials?.foil || foilNode?.material} />
        )}
      </group>
    );
  },
);

SwitchBox3D.displayName = "SwitchBox3D";

/*
  There is deliberately no module-scope `useGLTF.preload(...)` here.

  The old one fired the moment anything imported this module, which put a
  200 KB model on the wire during the storefront's first paint even though the
  viewer only ever appears on a product page. `CaseStage` already lazy-loads
  `CaseStageWebGL`, and `useGLTF` suspends on first render, so the model is
  fetched exactly when the viewer is about to show it and is cached by
  `useGLTF` for every product opened afterwards.
*/
