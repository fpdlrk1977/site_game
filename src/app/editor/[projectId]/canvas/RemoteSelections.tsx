'use client';

// 원격 협업자의 선택 오브젝트를 그 유저 색 외곽선 + 이름표로 표시(M1, AC①·③).
// SelectionOutline과 동일한 '월드 코너 직접 계산' 방식 — 프리미티브·GLB·그룹·프리팹·콘텐츠 공통.
// 편집(드래그) 중인 오브젝트는 잠금 아이콘을 붙인다.
import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { Lock } from 'lucide-react';
import * as THREE from 'three';
import { useSceneStore } from '@/store/sceneStore';
import { useCollabStore } from '@/store/collabStore';
import { useObjectRefs } from './ObjectRefsContext';
import { localBBox } from '@/lib/objectBBox';

const MARGIN = 1.05;
const EDGES: [number, number][] = [
  [0, 1], [2, 3], [4, 5], [6, 7],
  [0, 2], [1, 3], [4, 6], [5, 7],
  [0, 4], [1, 5], [2, 6], [3, 7],
];
const _corners = Array.from({ length: 8 }, () => new THREE.Vector3());
const _min = new THREE.Vector3();
const _max = new THREE.Vector3();
const _ctr = new THREE.Vector3();
const _lbl = new THREE.Vector3();

export function RemoteSelections() {
  const peers = useCollabStore((s) => s.peers);
  return (
    <>
      {peers.flatMap((p) =>
        p.selectedIds.map((objId) => (
          <RemoteBox
            key={`${p.key}:${objId}`}
            objId={objId}
            color={p.color}
            name={p.name}
            locked={p.editingId === objId}
          />
        )),
      )}
    </>
  );
}

function RemoteBox({ objId, color, name, locked }: {
  objId: string;
  color: string;
  name: string;
  locked: boolean;
}) {
  const objects = useSceneStore((s) => s.objects);
  const assets = useSceneStore((s) => s.assets);
  const refsMap = useObjectRefs();
  const lineRef = useRef<THREE.LineSegments>(null);
  const labelRef = useRef<THREE.Group>(null);

  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(EDGES.length * 2 * 3), 3));
    return g;
  }, []);
  useEffect(() => () => geo.dispose(), [geo]);

  useFrame(() => {
    const line = lineRef.current;
    if (!line) return;
    const ref = refsMap.current.get(objId);
    const lb = localBBox(objects, assets, objId);
    if (!ref || !ref.parent || !lb || lb.isEmpty()) {
      line.visible = false;
      if (labelRef.current) labelRef.current.visible = false;
      return;
    }
    ref.updateWorldMatrix(true, false);
    lb.getCenter(_ctr);
    _min.copy(lb.min).sub(_ctr).multiplyScalar(MARGIN).add(_ctr);
    _max.copy(lb.max).sub(_ctr).multiplyScalar(MARGIN).add(_ctr);
    for (let i = 0; i < 8; i++) {
      _corners[i].set(i & 1 ? _max.x : _min.x, i & 2 ? _max.y : _min.y, i & 4 ? _max.z : _min.z)
        .applyMatrix4(ref.matrixWorld);
    }
    const pos = geo.attributes.position.array as Float32Array;
    let k = 0;
    for (const [a, b] of EDGES) {
      pos[k++] = _corners[a].x; pos[k++] = _corners[a].y; pos[k++] = _corners[a].z;
      pos[k++] = _corners[b].x; pos[k++] = _corners[b].y; pos[k++] = _corners[b].z;
    }
    geo.attributes.position.needsUpdate = true;
    line.visible = true;
    if (labelRef.current) {
      _lbl.set((_min.x + _max.x) / 2, _max.y, (_min.z + _max.z) / 2).applyMatrix4(ref.matrixWorld);
      labelRef.current.position.copy(_lbl);
      labelRef.current.visible = true;
    }
  });

  return (
    <>
      <lineSegments ref={lineRef} geometry={geo} frustumCulled={false} visible={false} renderOrder={999}>
        <lineBasicMaterial color={color} depthTest={false} transparent />
      </lineSegments>
      <group ref={labelRef} visible={false}>
        <Html center zIndexRange={[40, 0]} style={{ pointerEvents: 'none' }}>
          <div
            className="px-1.5 py-0.5 rounded text-[10px] font-medium text-white whitespace-nowrap flex items-center gap-1 shadow"
            style={{ backgroundColor: color }}
          >
            {locked && <Lock size={10} />}
            {name}
          </div>
        </Html>
      </group>
    </>
  );
}
