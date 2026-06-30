'use client';

import { useGLTF } from '@react-three/drei';
import { useMemo, useEffect } from 'react';
import * as THREE from 'three';

interface Props {
  url: string;
  selected: boolean;
  onClick: (shiftKey: boolean) => void;
  wireframe?: boolean;
}

export function GlbObject({ url, selected, onClick, wireframe = false }: Props) {
  const { scene } = useGLTF(url);
  const clone = useMemo(() => scene.clone(true), [scene]);

  useEffect(() => {
    clone.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((mat) => {
        const m = mat as THREE.MeshStandardMaterial;
        if (m.emissive !== undefined) {
          m.emissive.set(selected ? '#3730a3' : '#000000');
          m.emissiveIntensity = selected ? 0.4 : 0;
        }
        m.wireframe = wireframe;
      });
    });
  }, [clone, selected, wireframe]);

  return (
    <primitive
      object={clone}
      onClick={(e: { stopPropagation: () => void; nativeEvent: MouseEvent }) => { e.stopPropagation(); onClick(e.nativeEvent.shiftKey); }}
    />
  );
}
