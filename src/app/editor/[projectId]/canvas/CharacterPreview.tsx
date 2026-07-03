'use client';

import { useRef, useEffect, useMemo, Suspense } from 'react';
import { useGLTF } from '@react-three/drei';
import { SkeletonUtils } from 'three-stdlib';
import * as THREE from 'three';
import { useSceneStore } from '@/store/sceneStore';
import { useObjectRefs } from './ObjectRefsContext';
import { pointerDownOnObjectRef } from './boxSelectState';

export const CHARACTER_PREVIEW_ID = '__character_preview__';

function CharacterPreviewInner({ url, scale }: { url: string; scale: number }) {
  const groupRef = useRef<THREE.Group>(null);
  const refsMap = useObjectRefs();
  const { selectedId, selectedIds, selectObject, environment } = useSceneStore();

  const { scene } = useGLTF(url);
  const clone = useMemo(() => SkeletonUtils.clone(scene), [scene]);

  const spawnPos = environment.playerStartPosition ?? { x: 0, y: 0, z: 0 };
  const isSelected = selectedId === CHARACTER_PREVIEW_ID && selectedIds.length === 0;

  // objectRefsRef에 등록 — GizmoController가 이 그룹을 찾을 수 있게
  useEffect(() => {
    if (groupRef.current) refsMap.current.set(CHARACTER_PREVIEW_ID, groupRef.current);
    return () => { refsMap.current.delete(CHARACTER_PREVIEW_ID); };
  }, [refsMap]);

  // 스폰 위치 반영 (EditorObjectInstance와 동일한 imperative 패턴)
  useEffect(() => {
    const g = groupRef.current;
    if (!g) return;
    g.position.set(spawnPos.x, spawnPos.y, spawnPos.z);
  }, [spawnPos.x, spawnPos.y, spawnPos.z]);

  // 선택 하이라이트
  useEffect(() => {
    clone.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((mat) => {
        const m = mat as THREE.MeshStandardMaterial;
        if (m.emissive !== undefined) {
          m.emissive.set(isSelected ? '#3730a3' : '#000000');
          m.emissiveIntensity = isSelected ? 0.4 : 0;
        }
      });
    });
  }, [clone, isSelected]);

  // 선택 시 바운딩박스 헬퍼
  const bbox = useMemo(() => new THREE.Box3().setFromObject(clone), [clone]);

  return (
    <group ref={groupRef} scale={[scale, scale, scale]}>
      <primitive
        object={clone}
        onClick={(e: { stopPropagation: () => void }) => {
          e.stopPropagation();
          selectObject(CHARACTER_PREVIEW_ID);
        }}
        onPointerDown={(e: { stopPropagation: () => void }) => {
          e.stopPropagation();
          pointerDownOnObjectRef.current = true;
        }}
      />
      {isSelected && (
        <box3Helper args={[bbox, new THREE.Color('#7c3aed')]} />
      )}
    </group>
  );
}

export function CharacterPreview(props: { url: string; scale: number }) {
  return (
    <Suspense fallback={null}>
      <CharacterPreviewInner {...props} />
    </Suspense>
  );
}
