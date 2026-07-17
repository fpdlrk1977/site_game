'use client';

// 조작 핸들(Layer 2) — 선택 오브젝트 bbox 위 핸들을 드래그해 스케일. doc/PIVOT_MANIPULATION.md.
//   코너 8개 = 3축 균일 스케일 · 면 6개 = 1축 스케일(폭/높이/깊이만).
//   앵커(고정점) = 패널 기준점(설정 시) · 미설정이면 잡은 핸들의 반대쪽. 스케일 = 잡은 핸들↔앵커 축에 마우스 투영.
//   시각 피드백: 잡은 핸들=흰색 · 반대(앵커) 핸들=주황. Inspector 실시간 + 놓을 때 commit(undo 1회).
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
// 화면 방향별 리사이즈 커서 — atan2 각도를 45°씩 8분할. 리사이즈 커서는 양방향이라 4종 순환.
const CURSORS = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize', 'ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'];

// 핸들 정의 — norm=정규화 위치(0/0.5/1), a*=그 축을 스케일할지(코너=3축, 면=1축).
type HandleDef = { nx: number; ny: number; nz: number; ax: boolean; ay: boolean; az: boolean };
// 인덱스 0..7 = 코너(비트 1=x,2=y,4=z 유지), 8..13 = 면(축쌍 -,+).
const CORNERS: HandleDef[] = Array.from({ length: 8 }, (_, i) => ({
  nx: i & 1 ? 1 : 0, ny: i & 2 ? 1 : 0, nz: i & 4 ? 1 : 0, ax: true, ay: true, az: true,
}));
const FACES: HandleDef[] = [
  { nx: 0, ny: 0.5, nz: 0.5, ax: true, ay: false, az: false },  // 8  -X
  { nx: 1, ny: 0.5, nz: 0.5, ax: true, ay: false, az: false },  // 9  +X
  { nx: 0.5, ny: 0, nz: 0.5, ax: false, ay: true, az: false },  // 10 -Y
  { nx: 0.5, ny: 1, nz: 0.5, ax: false, ay: true, az: false },  // 11 +Y
  { nx: 0.5, ny: 0.5, nz: 0, ax: false, ay: false, az: true },  // 12 -Z
  { nx: 0.5, ny: 0.5, nz: 1, ax: false, ay: false, az: true },  // 13 +Z
];
const HANDLES: HandleDef[] = [...CORNERS, ...FACES];
const normOf = (d: HandleDef): Vector3 => ({ x: d.nx, y: d.ny, z: d.nz });

// 핸들을 항상 최우선으로 잡히게 — 오브젝트 뒤(가려진) 핸들도 레이캐스트에서 이기도록 거리를 0 근처로 강제.
function topRaycast(this: THREE.Mesh, raycaster: THREE.Raycaster, intersects: THREE.Intersection[]) {
  const start = intersects.length;
  THREE.Mesh.prototype.raycast.call(this, raycaster, intersects);
  for (let k = start; k < intersects.length; k++) intersects[k].distance = 1e-6;
}
// pivot이 코너(각 축 0 또는 1)면 해당 코너 인덱스, 아니면 null — 패널 앵커 핸들 주황 표시용
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
  const [hot, setHot] = useState<number | null>(null); // 잡은/올린 핸들 인덱스(색·앵커 표시용)
  const [altActive, setAltActive] = useState(false); // Alt=중심 기준 드래그 중(앵커 주황 표시 억제)

  const selectedId = selectedIds.length === 1 ? selectedIds[0] : null;
  const obj = selectedId && selectedId !== CHARACTER_PREVIEW_ID ? objects.find((o) => o.id === selectedId) : null;
  const valid = !!obj && !obj.locked && obj.visible;
  const centerMode = isCenterAnchor(obj?.pivot);

  useEffect(() => {
    if (!valid && !draggingRef.current && orbitRef.current) orbitRef.current.enabled = true;
  }, [valid, orbitRef]);

  const toScreen = (world: THREE.Vector3) => {
    _proj.copy(world).project(camera);
    return { x: (_proj.x * 0.5 + 0.5) * size.width, y: (-_proj.y * 0.5 + 0.5) * size.height };
  };
  // 잡은 핸들 d의 앵커(고정) 정규화 좌표 — 스케일 축은 (중심모드=반대쪽 · 패널pivot=pivot), 비스케일 축은 핸들과 동일.
  const anchorNormFor = (d: HandleDef, pivot?: Vector3): Vector3 => ({
    x: d.ax ? (centerMode ? 1 - d.nx : pivot!.x) : d.nx,
    y: d.ay ? (centerMode ? 1 - d.ny : pivot!.y) : d.ny,
    z: d.az ? (centerMode ? 1 - d.nz : pivot!.z) : d.nz,
  });

  // 매 프레임 핸들 위치·크기 갱신(드래그 중에도 → 핸들이 커지는 박스를 따라감). 면 핸들은 조금 작게(부차적).
  useFrame(() => {
    if (!valid || !selectedId) return;
    const ref = refsMap.current.get(selectedId);
    if (!ref || !ref.parent) return;
    const lb = localBBox(objects, assets, selectedId);
    if (!lb || lb.isEmpty()) return;
    ref.updateWorldMatrix(true, false);
    for (let i = 0; i < HANDLES.length; i++) {
      const h = handleRefs.current[i];
      if (!h) continue;
      _c.copy(anchorLocalPoint(lb, normOf(HANDLES[i]))).applyMatrix4(ref.matrixWorld);
      h.position.copy(_c);
      h.scale.setScalar(Math.max(0.015, camera.position.distanceTo(_c) * 0.016) * (i >= 8 ? 0.8 : 1));
    }
  });

  if (!valid || !selectedId) return null;

  // 핸들 i의 화면 방향에 맞는 리사이즈 커서 — 핸들↔bbox중심 화면각을 45°씩 8분할.
  const cursorForHandle = (i: number): string => {
    const ref = refsMap.current.get(selectedId);
    const lb = localBBox(objects, assets, selectedId);
    if (!ref || !lb || lb.isEmpty()) return 'nwse-resize';
    ref.updateWorldMatrix(true, false);
    const hs = toScreen(anchorLocalPoint(lb, normOf(HANDLES[i])).applyMatrix4(ref.matrixWorld));
    const center = toScreen(lb.getCenter(new THREE.Vector3()).applyMatrix4(ref.matrixWorld));
    let deg = Math.atan2(hs.y - center.y, hs.x - center.x) * RAD2DEG;
    if (deg < 0) deg += 360;
    return CURSORS[Math.round(deg / 45) % 8];
  };

  const startDrag = (idx: number, e: { stopPropagation: () => void; altKey: boolean }) => {
    e.stopPropagation();
    const def = HANDLES[idx];
    const ref = refsMap.current.get(selectedId);
    const cur = objects.find((o) => o.id === selectedId);
    const lb = localBBox(objects, assets, selectedId);
    if (!ref || !cur || !lb || lb.isEmpty()) return;
    draggingRef.current = true;
    gizmoDraggingRef.current = true;
    setHot(idx);
    // Alt = 중심 기준(앵커 무시 → 양쪽 대칭 성장). 앵커/축이 바뀌므로 시작 시 캡처.
    const altCenter = !!e.altKey;
    setAltActive(altCenter);
    gl.domElement.style.cursor = cursorForHandle(idx);
    if (orbitRef.current) orbitRef.current.enabled = false;

    const startScale = { ...cur.scale };
    const startPos = { ...cur.position };
    const rot = cur.rotation;
    const anchorN = altCenter ? { x: 0.5, y: 0.5, z: 0.5 } : anchorNormFor(def, cur.pivot);
    const A = anchorLocalPoint(lb, anchorN); // 로컬 앵커 점(고정)
    const lbSize = lb.getSize(new THREE.Vector3()); // 로컬 치수(Ctrl 그리드 스냅용)
    const snapStep = useSceneStore.getState().snapTranslate || 0.5;
    const faceKey: 'x' | 'y' | 'z' | null = idx >= 8 ? (def.ax ? 'x' : def.ay ? 'y' : 'z') : null;
    ref.updateWorldMatrix(true, false);
    const anchorScreen = toScreen(A.clone().applyMatrix4(ref.matrixWorld));
    const handleScreen = toScreen(anchorLocalPoint(lb, normOf(def)).applyMatrix4(ref.matrixWorld));
    // 잡은 핸들↔앵커 축(화면). 마우스를 이 축에 투영한 비율 = 스케일 팩터(옆으로 비껴도 축 방향만 반영 → 일관).
    const ax = handleScreen.x - anchorScreen.x, ay = handleScreen.y - anchorScreen.y;
    const axisLen2 = ax * ax + ay * ay || 1;
    const rect = gl.domElement.getBoundingClientRect();

    const move = (ev: PointerEvent) => {
      const mx = ev.clientX - rect.left, my = ev.clientY - rect.top;
      const factor = Math.max(0.05, ((mx - anchorScreen.x) * ax + (my - anchorScreen.y) * ay) / axisLen2);
      // 축 마스크 — 코너는 3축 균일, 면은 해당 1축만.
      const ns = {
        x: def.ax ? Math.max(0.001, startScale.x * factor) : startScale.x,
        y: def.ay ? Math.max(0.001, startScale.y * factor) : startScale.y,
        z: def.az ? Math.max(0.001, startScale.z * factor) : startScale.z,
      };
      // Ctrl/Cmd = 스냅. 면(1축)=그 축 치수를 그리드 스텝에 · 코너(균일)=팩터 0.1 단위(균일 유지).
      if (ev.ctrlKey || ev.metaKey) {
        if (faceKey) {
          const ls = lbSize[faceKey] || 1;
          ns[faceKey] = Math.max(snapStep, Math.round((ls * ns[faceKey]) / snapStep) * snapStep) / ls;
        } else {
          const sf = Math.max(0.1, Math.round(factor / 0.1) * 0.1);
          ns.x = startScale.x * sf; ns.y = startScale.y * sf; ns.z = startScale.z * sf;
        }
      }
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
      setAltActive(false);
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

  // 앵커 핸들 인덱스(주황) — 중심모드=잡은 핸들의 반대(코너=^7·면=^1), 패널pivot=고정 코너.
  //   Alt(중심 기준) 드래그 중엔 앵커가 중심이라 특정 핸들이 아님 → 주황 억제.
  const anchorIdx = altActive
    ? null
    : !centerMode
      ? pivotCornerIdx(obj.pivot)
      : hot == null ? null : hot < 8 ? hot ^ 7 : hot ^ 1;

  return (
    <>
      {HANDLES.map((_, i) => {
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
              gl.domElement.style.cursor = cursorForHandle(i);
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
