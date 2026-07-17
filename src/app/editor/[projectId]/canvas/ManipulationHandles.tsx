'use client';

// 조작 핸들(Layer 2) — 선택 오브젝트 bbox 코너 8개를 드래그해 스케일. doc/PIVOT_MANIPULATION.md.
//   앵커(고정점) = 패널 기준점(설정 시) · 미설정이면 잡은 코너의 반대 코너. 스케일 = 잡은 코너↔앵커 축(대각선)에 마우스 투영.
//   시각 피드백: 잡은 핸들=흰색 · 앵커 코너=주황 · 앵커점 주황 마커. Inspector 실시간 + 놓을 때 commit(undo 1회).
import { useRef, useEffect, useState } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useSceneStore } from '@/store/sceneStore';
import { useLiveTransformStore } from '@/store/liveTransformStore';
import { useObjectRefs } from './ObjectRefsContext';
import { CHARACTER_PREVIEW_ID } from './CharacterPreview';
import { localBBox } from '@/lib/objectBBox';
import { anchorLocalPoint, scaleAnchorDelta, isCenterAnchor } from '@/lib/pivotMath';
import type { Vector3 } from '@/types/scene';

const RAD2DEG = 180 / Math.PI;
const _c = new THREE.Vector3();
const _proj = new THREE.Vector3();
const HANDLE = '#0d99ff', HOT = '#ffffff', ANCHOR = '#ff7a0d';
// 코너 방향(화면)별 리사이즈 커서 — atan2 각도를 45°씩 8분할. 리사이즈 커서는 양방향이라 4종 순환.
const CURSORS = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize', 'ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'];

// 핸들을 항상 최우선으로 잡히게 — 오브젝트 뒤(가려진) 코너도 레이캐스트에서 이기도록 거리를 0 근처로 강제.
function topRaycast(this: THREE.Mesh, raycaster: THREE.Raycaster, intersects: THREE.Intersection[]) {
  const start = intersects.length;
  THREE.Mesh.prototype.raycast.call(this, raycaster, intersects);
  for (let k = start; k < intersects.length; k++) intersects[k].distance = 1e-6;
}
// 코너 i(비트 1=x,2=y,4=z, 1=max)의 정규화 앵커(반대 코너용)
const cornerNorm = (i: number): Vector3 => ({ x: i & 1 ? 1 : 0, y: i & 2 ? 1 : 0, z: i & 4 ? 1 : 0 });
// pivot이 코너(각 축 0 또는 1)면 해당 코너 인덱스, 아니면 null(코너 아닌 앵커) — 앵커 핸들 주황 표시용
const pivotCornerIdx = (p?: Vector3): number | null => {
  if (!p) return null;
  const bit = (v: number) => (v <= 0.001 ? 0 : v >= 0.999 ? 1 : -1);
  const bx = bit(p.x), by = bit(p.y), bz = bit(p.z);
  if (bx < 0 || by < 0 || bz < 0) return null;
  return (bx ? 1 : 0) | (by ? 2 : 0) | (bz ? 4 : 0);
};

interface Props {
  orbitRef: React.RefObject<OrbitControlsImpl | null>;
  gizmoDraggingRef: React.MutableRefObject<boolean>;
}

export function ManipulationHandles({ orbitRef, gizmoDraggingRef }: Props) {
  const { camera, size, gl } = useThree();
  const selectedIds = useSceneStore((s) => s.selectedIds);
  const objects = useSceneStore((s) => s.objects);
  const assets = useSceneStore((s) => s.assets);
  const commitTransforms = useSceneStore((s) => s.commitTransforms);
  const refsMap = useObjectRefs();
  const handleRefs = useRef<(THREE.Mesh | null)[]>([]);
  const draggingRef = useRef(false);
  const [hot, setHot] = useState<number | null>(null); // 잡은/올린 핸들 인덱스(색·앵커 마커용)

  const selectedId = selectedIds.length === 1 ? selectedIds[0] : null;
  const obj = selectedId && selectedId !== CHARACTER_PREVIEW_ID ? objects.find((o) => o.id === selectedId) : null;
  const valid = !!obj && !obj.locked && obj.visible;
  const centerMode = isCenterAnchor(obj?.pivot);

  useEffect(() => {
    if (!valid && !draggingRef.current && orbitRef.current) orbitRef.current.enabled = true;
  }, [valid, orbitRef]);

  const cornerLocal = (lb: THREE.Box3, i: number) =>
    _c.set(i & 1 ? lb.max.x : lb.min.x, i & 2 ? lb.max.y : lb.min.y, i & 4 ? lb.max.z : lb.min.z);
  const toScreen = (world: THREE.Vector3) => {
    _proj.copy(world).project(camera);
    return { x: (_proj.x * 0.5 + 0.5) * size.width, y: (-_proj.y * 0.5 + 0.5) * size.height };
  };
  // 매 프레임 핸들 위치·크기 갱신(드래그 중에도 → 핸들이 커지는 박스를 따라감).
  useFrame(() => {
    if (!valid || !selectedId) return;
    const ref = refsMap.current.get(selectedId);
    if (!ref || !ref.parent) return;
    const lb = localBBox(objects, assets, selectedId);
    if (!lb || lb.isEmpty()) return;
    ref.updateWorldMatrix(true, false);
    for (let i = 0; i < 8; i++) {
      const h = handleRefs.current[i];
      if (!h) continue;
      cornerLocal(lb, i).applyMatrix4(ref.matrixWorld);
      h.position.copy(_c);
      h.scale.setScalar(Math.max(0.015, camera.position.distanceTo(_c) * 0.016));
    }
  });

  if (!valid || !selectedId) return null;

  // 코너 i의 화면 방향에 맞는 리사이즈 커서 — 코너↔bbox중심 화면각을 45°씩 8분할.
  const cursorForCorner = (i: number): string => {
    const ref = refsMap.current.get(selectedId);
    const lb = localBBox(objects, assets, selectedId);
    if (!ref || !lb || lb.isEmpty()) return 'nwse-resize';
    ref.updateWorldMatrix(true, false);
    const cs = toScreen(cornerLocal(lb, i).applyMatrix4(ref.matrixWorld).clone());
    const center = toScreen(lb.getCenter(new THREE.Vector3()).applyMatrix4(ref.matrixWorld));
    let deg = Math.atan2(cs.y - center.y, cs.x - center.x) * RAD2DEG;
    if (deg < 0) deg += 360;
    return CURSORS[Math.round(deg / 45) % 8];
  };

  const startDrag = (i: number, e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    const ref = refsMap.current.get(selectedId);
    const cur = objects.find((o) => o.id === selectedId);
    const lb = localBBox(objects, assets, selectedId);
    if (!ref || !cur || !lb || lb.isEmpty()) return;
    draggingRef.current = true;
    gizmoDraggingRef.current = true;
    setHot(i);
    gl.domElement.style.cursor = cursorForCorner(i);
    if (orbitRef.current) orbitRef.current.enabled = false;

    const startScale = { ...cur.scale };
    const startPos = { ...cur.position };
    const rot = cur.rotation;
    const anchorNorm = isCenterAnchor(cur.pivot) ? cornerNorm(i ^ 7) : cur.pivot!;
    const A = anchorLocalPoint(lb, anchorNorm);
    ref.updateWorldMatrix(true, false);
    const anchorScreen = toScreen(A.clone().applyMatrix4(ref.matrixWorld));
    const cornerScreen = toScreen(cornerLocal(lb, i).applyMatrix4(ref.matrixWorld).clone());
    // 잡은 코너↔앵커 축(화면). 마우스를 이 축에 투영한 비율 = 스케일 팩터(옆으로 비껴도 축 방향만 반영 → 일관).
    const ax = cornerScreen.x - anchorScreen.x, ay = cornerScreen.y - anchorScreen.y;
    const axisLen2 = ax * ax + ay * ay || 1;
    const rect = gl.domElement.getBoundingClientRect();

    const move = (ev: PointerEvent) => {
      const mx = ev.clientX - rect.left, my = ev.clientY - rect.top;
      const factor = Math.max(0.05, ((mx - anchorScreen.x) * ax + (my - anchorScreen.y) * ay) / axisLen2);
      const ns = {
        x: Math.max(0.001, startScale.x * factor),
        y: Math.max(0.001, startScale.y * factor),
        z: Math.max(0.001, startScale.z * factor),
      };
      const d = scaleAnchorDelta(A, rot, startScale, ns);
      ref.scale.set(ns.x, ns.y, ns.z);
      ref.position.set(startPos.x + d.x, startPos.y + d.y, startPos.z + d.z);
      useLiveTransformStore.getState().setLive({
        id: selectedId, position: { x: ref.position.x, y: ref.position.y, z: ref.position.z }, rotation: rot, scale: ns,
      });
    };
    const up = () => {
      draggingRef.current = false;
      gizmoDraggingRef.current = false;
      setHot(null);
      if (orbitRef.current) orbitRef.current.enabled = true;
      gl.domElement.style.cursor = '';
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      useLiveTransformStore.getState().setLive(null);
      commitTransforms([{
        id: selectedId,
        position: { x: ref.position.x, y: ref.position.y, z: ref.position.z },
        rotation: { x: ref.rotation.x * RAD2DEG, y: ref.rotation.y * RAD2DEG, z: ref.rotation.z * RAD2DEG },
        scale: { x: ref.scale.x, y: ref.scale.y, z: ref.scale.z },
      }]);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const oppOfHot = hot != null ? hot ^ 7 : null;
  // 앵커 코너 인덱스 — 중심모드=잡은 코너의 반대(hover 시), 패널pivot=고정 코너(항상 주황).
  const anchorIdx = centerMode ? oppOfHot : pivotCornerIdx(obj.pivot);

  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => {
        const color = i === hot ? HOT : i === anchorIdx ? ANCHOR : HANDLE;
        return (
          <mesh
            key={i}
            ref={(m) => { handleRefs.current[i] = m; }}
            renderOrder={1000}
            raycast={topRaycast}
            onPointerDown={(e) => startDrag(i, e)}
            onPointerOver={(e) => {
              e.stopPropagation();
              gl.domElement.style.cursor = cursorForCorner(i);
              if (!draggingRef.current) { setHot(i); if (orbitRef.current) orbitRef.current.enabled = false; }
            }}
            onPointerOut={() => {
              if (draggingRef.current) return;
              gl.domElement.style.cursor = '';
              setHot(null);
              if (orbitRef.current) orbitRef.current.enabled = true;
            }}
          >
            <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial color={color} depthTest={false} transparent opacity={0.95} />
          </mesh>
        );
      })}
    </>
  );
}
