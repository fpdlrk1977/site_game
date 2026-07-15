"use client";

import { useRef, useEffect, useMemo, Suspense } from "react";
import { useGLTF } from "@react-three/drei";
import { SkeletonUtils } from "three-stdlib";
import * as THREE from "three";
import { normalizeGlbMaterials } from "@/lib/glbMaterials";
import { useSceneStore, CHARACTER_PREVIEW_ID } from "@/store/sceneStore";
import { useObjectRefs } from "./ObjectRefsContext";
import { pointerDownOnObjectRef } from "./boxSelectState";

// 기존 import 경로 호환을 위한 re-export (원본은 sceneStore가 소유)
export { CHARACTER_PREVIEW_ID } from "@/store/sceneStore";

function CharacterPreviewInner({ url, scale }: { url: string; scale: number }) {
  const groupRef = useRef<THREE.Group>(null);
  const refsMap = useObjectRefs();
  const { selectedId, selectedIds, selectObject, environment } = useSceneStore();

  const { scene } = useGLTF(url);
  const clone = useMemo(() => {
    const c = SkeletonUtils.clone(scene);
    normalizeGlbMaterials(c);
    return c;
  }, [scene]);

  const spawnPos = environment.playerStartPosition ?? { x: 0, y: 0, z: 0 };
  // selectObject는 selectedIds를 [id]로 세팅하므로 length는 1이 정상값
  // (다중 선택 중에는 selectedId가 프리뷰일 수 없음 — toggleSelectObject가 제외)
  const isSelected = selectedId === CHARACTER_PREVIEW_ID && selectedIds.length <= 1;

  // objectRefsRef에 등록 — GizmoController가 이 그룹을 찾을 수 있게
  useEffect(() => {
    if (groupRef.current) refsMap.current.set(CHARACTER_PREVIEW_ID, groupRef.current);
    return () => {
      refsMap.current.delete(CHARACTER_PREVIEW_ID);
    };
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
          // 선택해도 틴트 없이 원래 색 유지(선택 표시는 아래 box3Helper 외곽선만).
          m.emissive.set("#000000");
          m.emissiveIntensity = 0;
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
      {isSelected && <box3Helper args={[bbox, new THREE.Color("#0D99FF")]} />}
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
