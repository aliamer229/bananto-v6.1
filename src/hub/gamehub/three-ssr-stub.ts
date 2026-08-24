export const Canvas = (props: any) => null;
export const useThree = () => ({ camera: {} });
export const useGLTF = Object.assign(() => null, { preload: () => {} });
export const OrbitControls = (props: any) => null;

const noop = () => {};
const mockVector3 = { set: noop };
const mockBox3 = { setFromObject: () => ({ getCenter: () => mockVector3, getSize: () => mockVector3 }) };

export const THREE = {
  SRGBColorSpace: "srgb",
  LinearMipmapLinearFilter: 1008,
  LinearFilter: 1006,
  Box3: function() { return mockBox3; },
  Vector3: function() { return mockVector3; },
  MeshStandardMaterial: function() { return {}; },
  TextureLoader: function() { return { load: noop }; },
};

// Also export them individually in case of direct imports or * as THREE resolution
export const SRGBColorSpace = "srgb";
export const LinearMipmapLinearFilter = 1008;
export const LinearFilter = 1006;
export const Box3 = function() { return mockBox3; };
export const Vector3 = function() { return mockVector3; };
export const MeshStandardMaterial = function() { return {}; };
export const TextureLoader = function() { return { load: noop }; };

export default THREE;
