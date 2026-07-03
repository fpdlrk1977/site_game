'use client';

import { useGLTF } from '@react-three/drei';
import { useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { SkeletonUtils } from 'three-stdlib';

interface Props {
  url: string;
  selected: boolean;
  hovered?: boolean;
  onClick: (shiftKey: boolean) => void;
  onHoverChange?: (hovered: boolean) => void;
  wireframe?: boolean;
}

export function GlbObject({ url, selected, hovered = false, onClick, onHoverChange, wireframe = false }: Props) {
  const { scene } = useGLTF(url);
  const clone = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  // Outlines는 단일 mesh에서만 동작하므로, 여러 mesh로 구성된 GLB는 bounding box로 표시
  const bbox = useMemo(() => new THREE.Box3().setFromObject(clone), [clone]);

  useEffect(() => {
    clone.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((mat) => {
        const m = mat as THREE.MeshStandardMaterial;
        if (m.emissive !== undefined) {
          m.emissive.set(selected ? '#3730a3' : hovered ? '#3730a3' : '#000000');
          m.emissiveIntensity = selected ? 0.4 : hovered ? 0.2 : 0;
        }
        m.wireframe = wireframe;
      });
    });
  }, [clone, selected, hovered, wireframe]);

  useEffect(() => {
    return () => {
      clone.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach((m) => (m as THREE.Material).dispose());
      });
    };
  }, [clone]);

  return (
    <>
      <primitive
        object={clone}
        onClick={(e: { stopPropagation: () => void; nativeEvent: MouseEvent }) => { e.stopPropagation(); onClick(e.nativeEvent.shiftKey); }}
        onPointerOver={(e: { stopPropagation: () => void }) => { e.stopPropagation(); onHoverChange?.(true); }}
        onPointerOut={(e: { stopPropagation: () => void }) => { e.stopPropagation(); onHoverChange?.(false); }}
      />
      {(selected || hovered) && (
        <box3Helper args={[bbox, new THREE.Color(selected ? '#7c3aed' : '#a78bfa')]} />
      )}
    </>
  );
}
