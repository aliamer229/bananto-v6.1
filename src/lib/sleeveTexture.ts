import type * as THREE from "three";

/**
 * Puts the composited sleeve artwork on the material — and makes three.js
 * actually sample it.
 *
 * Assigning `.map` is not enough, and this is the whole reason a grey case
 * reached customers. `WebGLPrograms` decides `USE_MAP` when it *compiles* the
 * shader, and the renderer only recompiles when the material's `version`
 * changes. The sleeve material first renders while the artwork is still being
 * composited, so it compiles with no map, with no texture fetch anywhere in
 * the fragment shader. When the texture arrives a moment later, `map` is set,
 * the image is uploaded to the GPU — and the shader that was already compiled
 * never reads it. The mesh keeps drawing flat `color`, which under this
 * scene's ambient + two directional lights lands at almost exactly rgb(100,
 * 100, 100): a smooth, evenly lit, empty grey case.
 *
 * It is invisible to every check that does not put a camera on it. The texture
 * exists, `material.map` is the right object, the UVs are correct, no error is
 * thrown, `onTextured` fires — and the customer sees a grey box.
 *
 * `needsUpdate = true` bumps `material.version`, which is what forces the
 * recompile. Returns whether the material was there to update.
 */
export function applySleeveTexture(
  material: THREE.MeshStandardMaterial | null | undefined,
  texture: THREE.Texture | null,
): boolean {
  if (!material) return false;
  material.map = texture;
  // A material compiled without a map has no texture fetch in its shader; a
  // material compiled with one has no way back to plain colour. Either
  // direction needs the recompile.
  material.needsUpdate = true;
  return true;
}
