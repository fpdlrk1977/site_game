'use client';

import { useGLTF } from '@react-three/drei';
import { useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { SkeletonUtils } from 'three-stdlib';
import { normalizeGlbMaterials } from '@/lib/glbMaterials';
import { glbLocalBboxCache } from '@/lib/glbBboxCache';
import { useSceneStore } from '@/store/sceneStore';

interface Props {
  url: string;
  selected: boolean;
  hovered?: boolean;
  onClick: (shiftKey: boolean) => void;
  /** 더블클릭 — 그룹 안이어도 이 오브젝트를 직접 선택(그룹 진입) */
  onDoubleClick?: (shiftKey: boolean) => void;
  onHoverChange?: (hovered: boolean) => void;
  wireframe?: boolean;
  /** physics 활성 시 콜라이더 가이드 표시 — 모델의 실제 바운딩박스에 맞춰 그린다 */
  colliderGuide?: 'solid' | 'sensor';
  /** 이 GLB를 렌더하는 씬 오브젝트 id — bbox 준비 시 자동 바닥 스냅 재시도용 */
  objectId?: string;
}

export function GlbObject({ url, selected, hovered = false, onClick, onDoubleClick, onHoverChange, wireframe = false, colliderGuide, objectId }: Props) {
  const { scene } = useGLTF(url);
  const clone = useMemo(() => {
    const c = SkeletonUtils.clone(scene);
    // SkeletonUtils.clone은 재질을 "참조 복사"하므로 같은 GLB를 쓰는 인스턴스들이
    // useGLTF 캐시 원본의 재질 하나를 공유한다. 그 상태에서 호버/선택 emissive를
    // 넣으면 다른 인스턴스까지 함께 밝아진다 → 인스턴스별로 재질을 복제해 독립시킨다.
    c.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      // GLB 메시가 그림자를 만들고 받도록 (기본값 false라 미설정 시 모델에 그림자가 아예 없음)
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map((m) => (m as THREE.Material).clone())
        : (mesh.material as THREE.Material).clone();
    });
    normalizeGlbMaterials(c);
    return c;
  }, [scene]);
  // Outlines는 단일 mesh에서만 동작하므로, 여러 mesh로 구성된 GLB는 bounding box로 표시
  const bbox = useMemo(() => new THREE.Box3().setFromObject(clone), [clone]);
  // 인스펙터 "바닥에 놓기"가 재로드 없이 밑면을 계산하도록 로컬 bbox를 캐시에 저장.
  // 캐시가 채워지면(=GLB 로드 완료) 추가 직후 스냅 못한 오브젝트를 바닥에 자동 정렬 재시도.
  useEffect(() => {
    glbLocalBboxCache.set(url, bbox);
    if (objectId) useSceneStore.getState().floorSnapObject(objectId);
  }, [url, bbox, objectId]);
  const guideBox = useMemo(() => {
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    bbox.getSize(size);
    bbox.getCenter(center);
    return { size, center };
  }, [bbox]);

  useEffect(() => {
    clone.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((mat) => {
        const m = mat as THREE.MeshStandardMaterial;
        if (m.emissive !== undefined) {
          // 선택 시엔 틴트 없이 원래 색을 보이게(외곽선 box3Helper로만 표시). 호버는 옅은 글로우 유지.
          m.emissive.set(hovered ? '#3730a3' : '#000000');
          m.emissiveIntensity = hovered ? 0.2 : 0;
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
        // 지오메트리는 useGLTF 캐시 원본과 공유(SkeletonUtils.clone은 지오메트리도 참조 복사)
        // — 여기서 dispose하면 같은 GLB를 쓰는 다른 인스턴스·재마운트의 버퍼가 깨진다.
        // drei가 캐시 해제 시 정리하므로 건드리지 않는다. 재질만 인스턴스 소유라 dispose한다.
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
        onDoubleClick={(e: { stopPropagation: () => void; nativeEvent: MouseEvent }) => { e.stopPropagation(); onDoubleClick?.(e.nativeEvent.shiftKey); }}
        onPointerOver={(e: { stopPropagation: () => void }) => { e.stopPropagation(); onHoverChange?.(true); }}
        onPointerOut={(e: { stopPropagation: () => void }) => { e.stopPropagation(); onHoverChange?.(false); }}
      />
      {(selected || hovered) && (
        <box3Helper args={[bbox, new THREE.Color('#0D99FF')]} />
      )}
      {/* 콜라이더 가이드 — 실제 모델 바운딩박스 크기·중심에 맞춤 (녹색=솔리드, 파랑=센서) */}
      {colliderGuide && (
        <>
          <mesh position={guideBox.center}>
            <boxGeometry args={[guideBox.size.x * 1.02, guideBox.size.y * 1.02, guideBox.size.z * 1.02]} />
            <meshBasicMaterial
              color={colliderGuide === 'sensor' ? '#3b82f6' : '#22c55e'}
              wireframe transparent
              opacity={colliderGuide === 'sensor' ? 0.8 : 0.5}
            />
          </mesh>
          {colliderGuide === 'sensor' && (
            <mesh position={guideBox.center}>
              <boxGeometry args={[guideBox.size.x, guideBox.size.y, guideBox.size.z]} />
              <meshBasicMaterial color="#3b82f6" transparent opacity={0.1} depthWrite={false} />
            </mesh>
          )}
        </>
      )}
    </>
  );
}
