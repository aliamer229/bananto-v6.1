const noop = () => {};
const noopComponent = (props: any) => null;
const mockVector3 = { set: noop, x: 0, y: 0, z: 0 };
const mockBox3 = { setFromObject: () => ({ getCenter: () => mockVector3, getSize: () => mockVector3 }) };

export const Canvas = noopComponent;
export const useThree = () => ({ camera: { position: mockVector3, updateProjectionMatrix: noop } });
export const useGLTF = Object.assign(() => ({ scene: { clone: () => ({ position: mockVector3, traverse: noop }), clear: noop, add: noop } }), { preload: () => {} });
export const OrbitControls = noopComponent;
export const Center = noopComponent;
export const Float = noopComponent;
export const Html = noopComponent;
export const PerspectiveCamera = noopComponent;
export const useTexture = () => null;
export const useFrame = noop;
export const extend = noop;
export const createPortal = noopComponent;

export const THREE = new Proxy(
  {
    SRGBColorSpace: "srgb",
    LinearMipmapLinearFilter: 1008,
    LinearFilter: 1006,
    Box3: function() { return mockBox3; },
    Vector3: function() { return mockVector3; },
    Group: function() { return { clear: noop, add: noop }; },
    MeshStandardMaterial: function() { return {}; },
    TextureLoader: function() { return { load: noop }; },
  } as any,
  {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (typeof prop === "string" && prop[0] === prop[0]?.toUpperCase()) {
        return function() { return {}; };
      }
      return noop;
    },
  },
);

export const SRGBColorSpace = "srgb";
export const LinearMipmapLinearFilter = 1008;
export const LinearFilter = 1006;
export const Box3 = function() { return mockBox3; };
export const Vector3 = function() { return mockVector3; };
export const Group = function() { return { clear: noop, add: noop }; };
export const MeshStandardMaterial = function() { return {}; };
export const TextureLoader = function() { return { load: noop }; };

export default THREE;

