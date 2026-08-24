const fs = require('fs');
let content = fs.readFileSync('src/SwitchBox3D.tsx', 'utf-8');

// Add useGLTF import if not present
if (!content.includes('useGLTF')) {
    content = content.replace(
        'import { isValidTrim, type TrimBox } from "@/lib/imageTrim";',
        'import { isValidTrim, type TrimBox } from "@/lib/imageTrim";\nimport { useGLTF } from "@/hub/gamehub/useGltf";\nimport SafeBoundary from "@/components/SafeBoundary";'
    );
}

// Rename SwitchBox3D to SwitchBoxProcedural
content = content.replace(
    'export function SwitchBox3D({',
    'function SwitchBoxProcedural({'
);

// We need to change the export at the bottom.
content = content.replace(
    'export default SwitchBox3D;',
    ''
);

// Append the new GLBCase and SwitchBox3D component
content += `

function GLBCase({ url, texture, groupRef }) {
  const { scene } = useGLTF(url);
  const cloned = useMemo(() => scene.clone(), [scene]);

  useEffect(() => {
    // 1. Apply texture to the appropriate material
    if (texture) {
      cloned.traverse((child) => {
        if (child.isMesh) {
          const mesh = child;
          if (mesh.material) {
            const matName = mesh.material.name?.toLowerCase() || "";
            const meshName = mesh.name?.toLowerCase() || "";
            // Apply if named cover, insert, art, or if it's the only material
            if (matName.includes("cover") || matName.includes("art") || meshName.includes("cover") || meshName.includes("art")) {
              mesh.material.map = texture;
              mesh.material.needsUpdate = true;
            } else if (!matName.includes("plastic") && !matName.includes("box")) {
              // Fallback just in case
              mesh.material.map = texture;
              mesh.material.needsUpdate = true;
            }
          }
        }
      });
    }

    // 2. Calculate Bounding Box and Center
    const box = new THREE.Box3().setFromObject(cloned);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    cloned.position.x = -center.x;
    cloned.position.y = -center.y;
    cloned.position.z = -center.z;

    // 3. Fix Orientation
    if (groupRef.current) {
      groupRef.current.rotation.set(0, 0, 0); // Reset
      // Auto-detect orientation: A case should be tallest in Y
      if (size.z > size.y && size.z > size.x) {
        // Lying on back -> Rotate to stand up
        groupRef.current.rotation.x = Math.PI / 2;
      } else if (size.x > size.y && size.x > size.z) {
        // Lying on side -> Rotate to stand up
        groupRef.current.rotation.z = Math.PI / 2;
      }
    }
  }, [cloned, texture, groupRef]);

  return <primitive object={cloned} />;
}

export function SwitchBox3D(props: SwitchBox3DProps) {
  return (
    <SafeBoundary fallback={<SwitchBoxProcedural {...props} />}>
      <React.Suspense fallback={<SwitchBoxProcedural {...props} />}>
        {/* We would load the GLB here, but we pass it as a child or internal to a wrapper */}
        {/* Wait, the procedural geometry has the OrbitControls and Texture drawing! */}
        <SwitchBoxProcedural {...props} />
      </React.Suspense>
    </SafeBoundary>
  );
}

export default SwitchBox3D;
`;

fs.writeFileSync('src/SwitchBox3D.tsx', content);
