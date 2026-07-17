'use client';

// 단일 선택 오브젝트의 점선(dash) 외곽선 — 월드 공간에서 그려 모든 타입 공통 적용 + 대시 균일.
//   기존 per-type 외곽선(EdgeBox/EdgePlane/box3Helper)은 그룹 안(스케일 적용 후)이라 비균일 스케일이
//   대시를 늘렸다. 여기서는 매 프레임 오브젝트 월드 코너를 직접 계산해 lineDistances를 월드 단위로 구하므로
//   스케일/회전과 무관하게 대시 간격이 항상 일정하다. 프리미티브·GLB·그룹·프리팹·콘텐츠 전부 커버.
import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSceneStore } from '@/store/sceneStore';
import { useObjectRefs } from './ObjectRefsContext';
import { CHARACTER_PREVIEW_ID } from './CharacterPreview';
import { localBBox } from '@/lib/objectBBox';

const MARGIN = 1.03; // bbox보다 살짝 크게(표면과 z-fighting 방지)
// 코너 8개(비트 x=1,y=2,z=4) → 12 모서리(24 정점)
const EDGES: [number, number][] = [
  [0, 1], [2, 3], [4, 5], [6, 7], // x
  [0, 2], [1, 3], [4, 6], [5, 7], // y
  [0, 4], [1, 5], [2, 6], [3, 7], // z
];
const _corners = Array.from({ length: 8 }, () => new THREE.Vector3());
const _min = new THREE.Vector3();
const _max = new THREE.Vector3();
const _ctr = new THREE.Vector3();

export function SelectionOutline() {
  const selectedIds = useSceneStore((s) => s.selectedIds);
  const objects = useSceneStore((s) => s.objects);
  const assets = useSceneStore((s) => s.assets);
  const refsMap = useObjectRefs();
  const lineRef = useRef<THREE.LineSegments>(null);

  const id = selectedIds.length === 1 ? selectedIds[0] : null;
  const obj = id && id !== CHARACTER_PREVIEW_ID ? objects.find((o) => o.id === id) : null;
  // 라이트/파티클은 자체 표식(구/기즈모)이 있어 제외. 숨김/잠금 제외.
  const valid = !!obj && !obj.locked && obj.visible && !obj.light && !obj.particle;

  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(EDGES.length * 2 * 3), 3));
    return g;
  }, []);
  useEffect(() => () => geo.dispose(), [geo]);

  useFrame(() => {
    const line = lineRef.current;
    if (!line) return;
    if (!valid || !id) { line.visible = false; return; }
    const ref = refsMap.current.get(id);
    const lb = localBBox(objects, assets, id);
    if (!ref || !ref.parent || !lb || lb.isEmpty()) { line.visible = false; return; }
    ref.updateWorldMatrix(true, false);
    // 마진 적용한 로컬 min/max
    lb.getCenter(_ctr);
    _min.copy(lb.min).sub(_ctr).multiplyScalar(MARGIN).add(_ctr);
    _max.copy(lb.max).sub(_ctr).multiplyScalar(MARGIN).add(_ctr);
    // 8 코너 월드 좌표
    for (let i = 0; i < 8; i++) {
      _corners[i].set(i & 1 ? _max.x : _min.x, i & 2 ? _max.y : _min.y, i & 4 ? _max.z : _min.z)
        .applyMatrix4(ref.matrixWorld);
    }
    // 12 모서리 정점 채우기
    const pos = geo.attributes.position.array as Float32Array;
    let k = 0;
    for (const [a, b] of EDGES) {
      pos[k++] = _corners[a].x; pos[k++] = _corners[a].y; pos[k++] = _corners[a].z;
      pos[k++] = _corners[b].x; pos[k++] = _corners[b].y; pos[k++] = _corners[b].z;
    }
    geo.attributes.position.needsUpdate = true;
    line.computeLineDistances(); // 월드 좌표 기반 → 대시 균일
    line.visible = true;
  });

  return (
    <lineSegments ref={lineRef} geometry={geo} frustumCulled={false} visible={false}>
      <lineDashedMaterial color="#0D99FF" dashSize={0.14} gapSize={0.09} />
    </lineSegments>
  );
}
