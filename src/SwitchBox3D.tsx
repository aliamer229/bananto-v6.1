import React, { useRef, useEffect, useState, forwardRef, useImperativeHandle } from "react";
import { OrbitControls, useGLTF } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { isValidTrim, type TrimBox } from "@/lib/imageTrim";

export interface SwitchBox3DHandle {
  resetView: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
}

export interface SwitchBox3DProps {
  coverImage: string | null;
  isHiRes?: boolean;
  coverTrim?: TrimBox | null | undefined;
  platform?: string;
  gameName?: string;
  onReady?: () => void;
}

export const SwitchBox3D = forwardRef<SwitchBox3DHandle, SwitchBox3DProps>(
  ({ coverImage, isHiRes, coverTrim, onReady }, ref) => {
    const { camera } = useThree();
    const controlsRef = useRef<any>(null);
    const groupRef = useRef<THREE.Group>(null);
    const [texture, setTexture] = useState<THREE.Texture | null>(null);

    useImperativeHandle(ref, () => ({
      resetView: () => {
        if (controlsRef.current) {
          controlsRef.current.reset();
        }
      },
      zoomIn: () => {},
      zoomOut: () => {},
    }));

    // 1. Load the GLB from R2
    // Added a cache-busting query parameter derived from today's date so it updates if changed
    const gltfUrl = "https://assets.banan.to/Pages/Glb/SwitchCase.glb?v=1";
    const gltf = useGLTF(gltfUrl);

    useEffect(() => {
      console.log("[3D] resolved R2 URL:", gltfUrl);
      console.log("[3D] loaded GLB:", gltf);
    }, [gltf, gltfUrl]);

    // 2. Load the Texture
    useEffect(() => {
      if (!coverImage) return;
      const loader = new THREE.TextureLoader();
      loader.load(
        coverImage,
        (loadedTexture) => {
          loadedTexture.colorSpace = THREE.SRGBColorSpace;
          loadedTexture.anisotropy = 16; // high quality filtering
          loadedTexture.minFilter = THREE.LinearMipmapLinearFilter;
          loadedTexture.magFilter = THREE.LinearFilter;
          
          if (coverTrim) {
             loadedTexture.repeat.set(coverTrim.width, coverTrim.height);
             loadedTexture.offset.set(coverTrim.x, 1 - coverTrim.y - coverTrim.height);
          }
          
          setTexture(loadedTexture);
        },
        undefined,
        (err) => {
          console.error("[3D] Error loading texture:", err);
          // If texture fails, don't crash, let it render the blank case
        }
      );
    }, [coverImage, coverTrim]);

    // 3. Apply Texture to GLB & Center it
    useEffect(() => {
      if (!gltf || !texture || !groupRef.current) return;

      // Clone scene so mutations don't pollute the cached GLTF
      const model = gltf.scene.clone();
      
      // Center the model using bounding box
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      model.position.x = -center.x;
      model.position.y = -center.y;
      model.position.z = -center.z;

      // Fit camera to bounding box
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      
      // Don't update camera z if it's already far enough, or do it once
      if (camera.position.z < maxDim) {
         camera.position.z = maxDim * 1.2;
         camera.updateProjectionMatrix();
      }

      const meshNames: string[] = [];
      let targetMeshName = "";

      model.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          meshNames.push(mesh.name);

          // We create a new material to override the mesh's material with our texture
          const newMat = new THREE.MeshStandardMaterial({
             map: texture,
             roughness: 0.4,
             metalness: 0.1,
          });
          
          if (mesh.material) {
             // Apply to material
             if (Array.isArray(mesh.material)) {
                mesh.material = mesh.material.map((m) => {
                   const matName = m.name.toLowerCase();
                   // If it's a fallback, only target the front
                   if (!isHiRes) {
                      if (matName.includes("front") || matName.includes("cover") || matName.includes("box")) {
                         targetMeshName = `${mesh.name}.${m.name}`;
                         return newMat;
                      }
                      return m;
                   } else {
                      // 3D Texture source applies to all relevant sleeve parts
                      if (matName.includes("front") || matName.includes("cover") || matName.includes("spine") || matName.includes("back") || matName.includes("box")) {
                         targetMeshName = `${mesh.name}.${m.name}`;
                         return newMat;
                      }
                      return m;
                   }
                });
             } else {
                const matName = mesh.material.name.toLowerCase();
                const mName = mesh.name.toLowerCase();
                
                // If it's the fallback front cover, we only want to texture the front face/mesh.
                if (!isHiRes) {
                   if (mName.includes("front") || matName.includes("front") || mName.includes("cover") || matName.includes("cover")) {
                      mesh.material = newMat;
                      targetMeshName = mesh.name;
                   }
                } else {
                   // Full wrap: replace anything that looks like the sleeve
                   if (mName.includes("sleeve") || mName.includes("cover") || mName.includes("front") || mName.includes("box") || mName.includes("plane") || mName.includes("mesh") || matName.includes("sleeve") || matName.includes("cover")) {
                       mesh.material = newMat;
                       targetMeshName = mesh.name;
                   } else {
                       // If no specific names, just replace it if it's the main mesh
                       mesh.material = newMat;
                       targetMeshName = mesh.name;
                   }
                }
             }
          }
        }
      });

      console.log(`[3D] mesh names:`, meshNames.join(", "));
      console.log(`[3D] cover texture target mesh:`, targetMeshName || "None found");
      
      // Clear previous children and add the newly cloned/textured model
      groupRef.current.clear();
      groupRef.current.add(model);

      if (onReady) onReady();
    }, [gltf, texture, camera, onReady, isHiRes]);

    return (
      <group>
        <OrbitControls
          ref={controlsRef}
          enablePan={false}
          enableZoom={true}
          enableDamping={true}
          dampingFactor={0.05}
          minDistance={2}
          maxDistance={30}
        />
        {/* We mount the modified scene in groupRef inside the effect */}
        <group ref={groupRef} />
      </group>
    );
  }
);
SwitchBox3D.displayName = "SwitchBox3D";

// Preload the GLB
useGLTF.preload("https://assets.banan.to/Pages/Glb/SwitchCase.glb?v=1");
