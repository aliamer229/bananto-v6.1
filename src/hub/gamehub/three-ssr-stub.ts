/**
 * SSR stub for `three`, its GLTF loader, and `@react-three/fiber`.
 *
 * Those libraries do work in module scope (three's shared `LoadingManager`,
 * timers, random values). Cloudflare Workers forbid that at global scope, so
 * once the bundler pulled them into the server bundle every published request
 * failed with "Disallowed operation called within global scope" — a 500 on the
 * very first page load.
 *
 * The 3D case is browser-only anyway: it is lazy-loaded after first paint,
 * behind a WebGL and viewport check, and the CSS case is what renders on the
 * server. So the server never needs the real modules. This side-effect free
 * stub replaces them in the SSR build only; the browser build keeps the real
 * libraries untouched.
 *
 * Exports must cover every binding the 3D components import by name, otherwise
 * the SSR build fails with "X is not exported".
 */
class Empty {}
const fn = () => undefined;

// three
export class Group extends Empty {}
export class Mesh extends Empty {}
export class Object3D extends Empty {}
export class Material extends Empty {}
export class MeshStandardMaterial extends Empty {}
export class Color extends Empty {}
export class CanvasTexture extends Empty {}
export class Texture extends Empty {}
export class TextureLoader extends Empty {
  load(_url: string, onLoad?: (texture: any) => void) {
    return new Texture();
  }
  setCrossOrigin(_crossOrigin: string) {
    return this;
  }
}
export class LoadingManager extends Empty {}
export class Vector2 extends Empty {}
export class Vector3 extends Empty {}
export class Box3 extends Empty {}
export class OrthographicCamera extends Empty {}
export class PerspectiveCamera extends Empty {}
export class Quaternion extends Empty {}
export class QuadraticBezierCurve3 extends Empty {}

export const MathUtils = {
  clamp: (value: number) => value,
  lerp: (a: number) => a,
  degToRad: (value: number) => value,
  radToDeg: (value: number) => value,
  damp: (a: number) => a,
};

export const DoubleSide = 2;
export const FrontSide = 0;
export const BackSide = 1;

export const SRGBColorSpace = "srgb";
export const LinearSRGBColorSpace = "srgb-linear";

// Texture filtering / wrapping constants used by the sleeve texture.
export const LinearFilter = 1006;
export const LinearMipmapLinearFilter = 1008;
export const NearestFilter = 1003;
export const ClampToEdgeWrapping = 1001;
export const RepeatWrapping = 1000;

// three/examples/jsm/loaders/GLTFLoader.js
export class GLTFLoader extends Empty {}

// @react-three/fiber
export const Canvas = () => null;
export const useFrame = fn;
export const useThree = () => ({});
export const useLoader = fn;
export const extend = fn;
export const invalidate = fn;
export const context = {};

// @react-three/drei
export const useGLTF = () => ({ nodes: {}, materials: {} });
useGLTF.preload = fn;
export const OrbitControls = () => null;
export const Environment = () => null;

export default {};
