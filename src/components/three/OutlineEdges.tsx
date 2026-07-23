'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { Edges } from '@react-three/drei';

// 재질 외곽선 '전체' 모드 — 오브젝트 실제 지오메트리의 하드 모서리(EdgesGeometry)를 '보이는 것만' 그린다.
//   drei <Edges>는 Line2/LineMaterial 기반이라 화면 픽셀 두께(lineWidth)를 지원 → 실루엣(Outlines)과 굵기를 맞춘다.
//   각진 박스 정면의 Y자 안쪽 모서리는 표면과 같은 깊이라 z-fighting으로 묻힌다 → 지오메트리 '중심' 기준으로
//   아주 살짝(0.4%) 부풀려(scale/position) 표면보다 카메라 쪽에 오게 한다: 앞 모서리는 이기고, 뒤는 mesh에 가려짐.
//   중심 기준이라 바닥이 0인 형상(복셀)도 위로 밀리지 않는다. 에디터·뷰어 공용.
export function OutlineEdges({
  geometry,
  threshold = 1,
  color = '#000000',
  lineWidth = 4,
}: {
  geometry: THREE.BufferGeometry;
  threshold?: number;
  color?: string;
  lineWidth?: number;
}) {
  const { pos, scl } = useMemo(() => {
    geometry.computeBoundingBox();
    const c = new THREE.Vector3();
    (geometry.boundingBox ?? new THREE.Box3()).getCenter(c);
    const s = 1.004;
    return { pos: [-(s - 1) * c.x, -(s - 1) * c.y, -(s - 1) * c.z] as [number, number, number], scl: s };
  }, [geometry]);
  return (
    <Edges
      geometry={geometry}
      threshold={threshold}
      color={color}
      lineWidth={lineWidth}
      scale={scl}
      position={pos}
      transparent
      depthWrite={false}
      renderOrder={7}
      raycast={() => {}}
    />
  );
}
