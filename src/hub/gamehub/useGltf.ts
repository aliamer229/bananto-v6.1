/**
 * Minimal `useGLTF` replacement.
 *
 * `@react-three/drei` builds a shared `THREE.LoadingManager` while its module is
 * being evaluated, which generates random values in the Cloudflare Worker's
 * global scope and made every SSR request fail with a 500. This loader creates
 * nothing until a component actually asks for a model in the browser.
 */

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

type Loaded = {
  scene: THREE.Group;
  nodes: Record<string, THREE.Object3D>;
  materials: Record<string, THREE.Material>;
};

type Entry = { promise: Promise<Loaded>; value?: Loaded; error?: unknown };

const cache = new Map<string, Entry>();

function collect(scene: THREE.Group): Loaded {
  const nodes: Record<string, THREE.Object3D> = {};
  const materials: Record<string, THREE.Material> = {};
  scene.traverse((object) => {
    if (object.name) nodes[object.name] = object;
    const material = (object as THREE.Mesh).material as
      THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(material)) material.forEach((m) => m.name && (materials[m.name] = m));
    else if (material?.name) materials[material.name] = material;
  });
  return { scene, nodes, materials };
}

function load(url: string): Entry {
  const existing = cache.get(url);
  if (existing) return existing;

  const entry: Entry = {
    promise: new Promise<Loaded>((resolve, reject) => {
      new GLTFLoader().load(
        url,
        (gltf) => resolve(collect(gltf.scene as THREE.Group)),
        undefined,
        reject,
      );
    }),
  };
  entry.promise.then(
    (value) => {
      entry.value = value;
    },
    (error) => {
      entry.error = error;
    },
  );
  cache.set(url, entry);
  return entry;
}

/** Suspense-based GLTF read. Throws the pending promise, like drei's hook. */
export function useGLTF(url: string): Loaded {
  const entry = load(url);
  if (entry.error) throw entry.error;
  if (!entry.value) throw entry.promise;
  return entry.value;
}

/** Warm the cache ahead of first render — browser only. */
useGLTF.preload = (url: string) => {
  if (typeof window === "undefined") return;
  void load(url).promise.catch(() => undefined);
};
