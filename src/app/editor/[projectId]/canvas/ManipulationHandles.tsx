'use client';

// 조작 핸들(Layer 2) — 선택 오브젝트 bbox 위 핸들을 드래그해 스케일. doc/PIVOT_MANIPULATION.md.
//   코너 8개 = 3축 균일 스케일 · 면 6개 = 1축 스케일(폭/높이/깊이만).
//   앵커(고정점) = 패널 기준점(설정 시) · 미설정이면 잡은 핸들의 반대쪽. 스케일 = 잡은 핸들↔앵커 축에 마우스 투영.
//   시각 피드백: 잡은 핸들=흰색 · 반대(앵커) 핸들=주황. Inspector 실시간 + 놓을 때 commit(undo 1회).
import { useRef, useEffect, useState } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
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
const _center = new THREE.Vector3(); // bbox 중심 월드(앞뒤 판정 기준)
const _viewC = new THREE.Vector3();  // 중심→카메라
const _nx = new THREE.Vector3(), _ny = new THREE.Vector3(), _nz = new THREE.Vector3(); // 월드 면 법선
const _wq = new THREE.Quaternion();  // 오브젝트 월드 회전
const CENTER_NORM = { x: 0.5, y: 0.5, z: 0.5 }; // bbox 중심 정규화
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
// 드래그 HUD 치수 문자열 — bbox 로컬치수 × 스케일 = 실제 W×H×D(m). 소수 1자리 반올림.
const fmtDim = (n: number) => n.toFixed(1);
const dimsText = (sz: THREE.Vector3, s: { x: number; y: number; z: number }) =>
  `${fmtDim(sz.x * s.x)} × ${fmtDim(sz.y * s.y)} × ${fmtDim(sz.z * s.z)} m`;

// 앞 핸들은 오브젝트 표면에 묻히지 않게 레이캐스트에서 최우선(거리 0 근처). 숨긴(뒤) 핸들은 제외.
function topRaycast(this: THREE.Mesh, raycaster: THREE.Raycaster, intersects: THREE.Intersection[]) {
  if (this.visible === false) return; // 뒤쪽 숨긴 핸들은 클릭 대상 아님(카메라 돌려 앞으로 와야 잡힘)
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
  // 핸들 드래그 신호 — 기즈모 자체 드래그(gizmoDraggingRef)와 분리. 이걸 켜도 기즈모 프록시 동기화는
  // 계속 돌아 핸들로 스케일 중에도 기즈모가 오브젝트를 실시간 추종한다.
  handleDraggingRef: React.MutableRefObject<boolean>;
}

export function ManipulationHandles({ orbitRef, handleDraggingRef }: Props) {
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
  const [draggingState, setDraggingState] = useState(false); // 드래그 중(HUD 렌더 트리거)
  const dragIdxRef = useRef<number | null>(null); // 드래그 중인 핸들 인덱스(HUD 위치용, useFrame)
  const hudRef = useRef<HTMLDivElement>(null); // HUD 텍스트(명령형 갱신)
  const hudInitRef = useRef(''); // 드래그 시작 시 초기 치수 문자열
  const hudGroupRef = useRef<THREE.Group>(null); // HUD 앵커(핸들 위치 추종, useFrame)

  const selectedId = selectedIds.length === 1 ? selectedIds[0] : null;
  const obj = selectedId && selectedId !== CHARACTER_PREVIEW_ID ? objects.find((o) => o.id === selectedId) : null;
  // 스케일 핸들은 실제 bbox가 있는 형상만 대상. 라이트/파티클/모터, 그리고 자식 없는 빈 그룹(bbox 없음)은 제외.
  //   ★ 제외 안 하면 위치를 못 잡은 핸들 14개가 월드 원점에 1×1 파란 박스로 떠 버린다(빈 모터/빈 그룹 배치 시).
  const hbb = obj && !obj.light && !obj.particle && !obj.isActuator ? localBBox(objects, assets, obj.id) : null;
  const valid = !!obj && !obj.locked && obj.visible && !!hbb && !hbb.isEmpty();
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

  // 핸들 위치·크기·앞뒤가시성 + HUD 추종 갱신. useFrame(매 프레임) + 드래그 move에서도 직접 호출
  //   → 윈도우 pointermove로 스케일이 바뀌는 순간 핸들이 즉시 따라가게(실시간 추종 보장).
  const layoutHandles = () => {
    if (!valid || !selectedId) return;
    const ref = refsMap.current.get(selectedId);
    if (!ref || !ref.parent) return;
    const lb = localBBox(objects, assets, selectedId);
    if (!lb || lb.isEmpty()) return;
    ref.updateWorldMatrix(true, false);
    _center.copy(anchorLocalPoint(lb, CENTER_NORM)).applyMatrix4(ref.matrixWorld); // bbox 중심 월드
    // 면 앞뒤 판정 — 오브젝트 월드 회전으로 축 법선 구하고 (중심→카메라)와 내적.
    ref.getWorldQuaternion(_wq);
    _nx.set(1, 0, 0).applyQuaternion(_wq);
    _ny.set(0, 1, 0).applyQuaternion(_wq);
    _nz.set(0, 0, 1).applyQuaternion(_wq);
    _viewC.copy(camera.position).sub(_center);
    const dX = _nx.dot(_viewC), dY = _ny.dot(_viewC), dZ = _nz.dot(_viewC);
    const fXp = dX > 0, fXm = dX < 0, fYp = dY > 0, fYm = dY < 0, fZp = dZ > 0, fZm = dZ < 0;
    const faceFront = [fXm, fXp, fYm, fYp, fZm, fZp]; // 면 인덱스 8..13 = -X,+X,-Y,+Y,-Z,+Z 앞면 여부
    for (let i = 0; i < HANDLES.length; i++) {
      const h = handleRefs.current[i];
      if (!h) continue;
      _c.copy(anchorLocalPoint(lb, normOf(HANDLES[i]))).applyMatrix4(ref.matrixWorld);
      h.position.copy(_c);
      h.scale.setScalar(Math.max(0.015, camera.position.distanceTo(_c) * 0.016) * (i >= 8 ? 0.8 : 1));
      // 가시성 — 코너는 인접 3면 중 하나라도 앞면이면 보임(완전히 가려진 코너만 숨김), 면은 그 면이 앞면일 때만.
      h.visible = i < 8
        ? ((i & 1 ? fXp : fXm) || (i & 2 ? fYp : fYm) || (i & 4 ? fZp : fZm))
        : faceFront[i - 8];
    }
    // HUD 앵커를 잡은 핸들 위치로 추종(드래그 중).
    if (draggingRef.current && dragIdxRef.current != null && hudGroupRef.current) {
      const h = handleRefs.current[dragIdxRef.current];
      if (h) hudGroupRef.current.position.copy(h.position);
    }
  };
  useFrame(layoutHandles);

  // 드래그 시작 시 HUD 초기 치수 텍스트 세팅(첫 move 전 빈 표시 방지).
  useEffect(() => {
    if (draggingState && hudRef.current) hudRef.current.textContent = hudInitRef.current;
  }, [draggingState]);

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
    handleDraggingRef.current = true;
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
    const lbSize = lb.getSize(new THREE.Vector3()); // 로컬 치수(Ctrl 그리드 스냅·HUD용)
    const snapStep = useSceneStore.getState().snapTranslate || 0.5;
    const faceKey: 'x' | 'y' | 'z' | null = idx >= 8 ? (def.ax ? 'x' : def.ay ? 'y' : 'z') : null;
    hudInitRef.current = dimsText(lbSize, startScale); // 시작 치수
    dragIdxRef.current = idx;
    setDraggingState(true);
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
      layoutHandles(); // 스케일 변경 즉시 핸들 위치 재배치(실시간 추종)
      if (hudRef.current) hudRef.current.textContent = dimsText(lbSize, ns); // HUD 실시간 치수
      useLiveTransformStore.getState().setLive({
        id: selectedId, position: { x: ref.position.x, y: ref.position.y, z: ref.position.z }, rotation: rot, scale: ns,
      });
    };
    const up = () => {
      draggingRef.current = false;
      handleDraggingRef.current = false;
      dragIdxRef.current = null;
      setHot(null);
      setAltActive(false);
      setDraggingState(false);
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
      {/* 드래그 HUD — 잡은 핸들 옆 실시간 치수(명령형 텍스트 갱신). */}
      {draggingState && (
        <group ref={hudGroupRef}>
          <Html center zIndexRange={[100, 0]} style={{ pointerEvents: 'none' }}>
            <div
              ref={hudRef}
              style={{
                transform: 'translate(16px, -16px)',
                background: 'rgba(20, 20, 28, 0.9)',
                color: '#fff',
                fontSize: 11,
                fontWeight: 500,
                lineHeight: 1.3,
                padding: '3px 7px',
                borderRadius: 5,
                whiteSpace: 'nowrap',
                userSelect: 'none',
                boxShadow: '0 1px 5px rgba(0,0,0,0.45)',
              }}
            />
          </Html>
        </group>
      )}
    </>
  );
}
