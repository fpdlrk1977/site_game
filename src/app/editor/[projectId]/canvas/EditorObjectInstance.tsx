'use client';

import { useRef, useLayoutEffect, useMemo, useEffect, useState, Suspense } from 'react';
import * as THREE from 'three';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import { Text3D, Center, Line } from '@react-three/drei';
import { createPrimitiveGeometry, primitiveGeomKey, profileSig } from '@/lib/primitiveGeometry';
import { voxelSig } from '@/lib/voxelGeometry';
import { primLocalBboxCache } from '@/lib/primBboxCache';
import { effectiveMaterial } from '@/lib/effectiveMaterial';
import { useShallow } from 'zustand/react/shallow';
import { useSceneStore } from '@/store/sceneStore';
import { useLiveTransformStore } from '@/store/liveTransformStore';
import { useObjectRefs } from './ObjectRefsContext';
import { GlbObject } from './GlbObject';
import { ParticleEmitter } from '@/components/three/ParticleEmitter';
import { PrimitiveMaterial } from '@/components/three/PrimitiveMaterial';
import { pointerDownOnObjectRef } from './boxSelectState';
import type { ObjectNodeSchema, LightType } from '@/types/scene';

const markObjectHit = (e: { stopPropagation: () => void }) => {
  e.stopPropagation();
  pointerDownOnObjectRef.current = true;
};

const DEG2RAD = Math.PI / 180;

interface Props {
  object: ObjectNodeSchema;
}

// 콜라이더 시각화 — 실제 지오메트리 bbox 기준으로 크기·중심을 맞춘다(고정 단위 박스 X).
// box/구체는 bbox=1이라 기존(1.02/0.51)과 픽셀상 동일하고, 돌출/로프트 등 얇은 형상만 실제 크기로 축소된다.
// (에디터 전용 시각화 — 런타임 콜라이더엔 영향 없음.)
function ColliderOverlay({ object, size, center }: { object: ObjectNodeSchema; size: [number, number, number]; center: [number, number, number] }) {
  if (!object.physics.enabled) return null;
  const isSensor = object.physics.isSensor;
  const type = object.physics.colliderType ?? 'box';
  const isSphere = type === 'sphere';
  const r = Math.max(size[0], size[1], size[2]) / 2; // 구 오버레이 반경 = bbox 최대 반너비

  if (!isSensor) {
    return (
      <mesh position={center}>
        {isSphere ? <sphereGeometry args={[r * 1.02, 12, 12]} /> : <boxGeometry args={[size[0] * 1.02, size[1] * 1.02, size[2] * 1.02]} />}
        <meshBasicMaterial color="#22c55e" wireframe transparent opacity={0.5} />
      </mesh>
    );
  }

  return (
    <>
      <mesh position={center}>
        {isSphere ? <sphereGeometry args={[r * 1.02, 12, 12]} /> : <boxGeometry args={[size[0] * 1.02, size[1] * 1.02, size[2] * 1.02]} />}
        <meshBasicMaterial color="#3b82f6" wireframe transparent opacity={0.8} />
      </mesh>
      <mesh position={center}>
        {isSphere ? <sphereGeometry args={[r, 12, 12]} /> : <boxGeometry args={[size[0], size[1], size[2]]} />}
        <meshBasicMaterial color="#3b82f6" transparent opacity={0.1} depthWrite={false} />
      </mesh>
    </>
  );
}

const LIGHT_ICON_COLOR: Record<LightType, string> = {
  point: '#fbbf24',
  spot: '#f97316',
  directional: '#60a5fa',
};

// 라이트 빔의 기본(회전 0) 방향 = 로컬 -Y(아래). object.rotation을 적용해 실제 월드 방향을 얻는다.
const LIGHT_DOWN = new THREE.Vector3(0, -1, 0);
const LIGHT_HANDLE_DIST = 3; // 라이트 target(방향)까지의 로컬 거리(방향만 쓰므로 값 자체는 무의미)
const LIGHT_MIN_LEN = 0.5;   // dash 최소 길이(핸들이 라이트에 붙어 사라지지 않게)
const _lightRaycaster = new THREE.Raycaster();
const _lightNdc = new THREE.Vector2();
// 월드 빔 방향 → object.rotation(도) 변환. 로컬 -Y를 그 방향으로 돌리는 최소 회전(roll 무시 — 라이트엔 무의미).
function beamDirToRotDeg(dir: THREE.Vector3): { x: number; y: number; z: number } {
  const q = new THREE.Quaternion().setFromUnitVectors(LIGHT_DOWN, dir);
  const e = new THREE.Euler().setFromQuaternion(q);
  return { x: e.x / DEG2RAD, y: e.y / DEG2RAD, z: e.z / DEG2RAD };
}

function LightObjectInstance({ object }: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const refsMap = useObjectRefs();
  const selectObject = useSceneStore((s) => s.selectObject);
  const toggleSelectObject = useSceneStore((s) => s.toggleSelectObject);
  const selectedId = useSceneStore((s) => s.selectedId);
  const selectedIds = useSceneStore((s) => s.selectedIds);
  const isSelected = selectedIds.length > 0 ? selectedIds.includes(object.id) : selectedId === object.id;
  const lc = object.light!;
  const iconColor = LIGHT_ICON_COLOR[lc.type];

  // useLayoutEffect: 커밋 중 동기 등록 → 재부모화(언마운트→리마운트) 시 기즈모가
  // 옛(분리된) ref를 붙들지 않도록 새 ref를 페인트 전에 refsMap에 반영한다
  useLayoutEffect(() => {
    if (groupRef.current) refsMap.current.set(object.id, groupRef.current);
    return () => { refsMap.current.delete(object.id); };
  }, [object.id, refsMap]);

  useLayoutEffect(() => {
    const g = groupRef.current;
    if (!g) return;
    g.position.set(object.position.x, object.position.y, object.position.z);
    g.rotation.set(object.rotation.x * DEG2RAD, object.rotation.y * DEG2RAD, object.rotation.z * DEG2RAD);
    g.scale.set(1, 1, 1);
    g.visible = object.visible; // 언마운트 대신 플래그 토글 (좌표 리셋 버그 방지)
  }, [object.position.x, object.position.y, object.position.z,
    object.rotation.x, object.rotation.y, object.rotation.z, object.visible]);


  const handleClick = (shiftKey: boolean) => selectByClick(object, shiftKey);

  const updateObject = useSceneStore((s) => s.updateObject);
  const pushHistory = useSceneStore((s) => s.pushHistory);
  const controls = useThree((s) => s.controls) as { enabled: boolean } | null;
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);

  // (A) 라이브 트랜스폼 구독 — 메인 기즈모로 라이트를 옮기는/돌리는 '중'에도 dash가 실시간으로 따라오게.
  // 기즈모는 드래그 중 liveTransformStore에 매 프레임 게시하고 object.position/rotation은 commit 때만 갱신됨.
  const live = useLiveTransformStore((s) => s.live);
  const lv = live && live.id === object.id ? live : null;
  const px = lv ? lv.position.x : object.position.x;
  const py = lv ? lv.position.y : object.position.y;
  const pz = lv ? lv.position.z : object.position.z;
  const rrx = lv ? lv.rotation.x : object.rotation.x;
  const rry = lv ? lv.rotation.y : object.rotation.y;
  const rrz = lv ? lv.rotation.z : object.rotation.z;
  const isDir = lc.type !== 'point'; // point는 무지향성 → 방향 기즈모 없음

  // 실제 three 라이트의 target(방향) — 그룹의 로컬 -Y에 둔다. 그룹이 회전하면 함께 돌아
  // emission 방향이 object.rotation을 따라간다("후레쉬를 위로 하면 빛도 위로").
  const targetObj = useMemo(() => new THREE.Object3D(), []);

  // 현재 빔 방향(월드). 핸들 드래그 중이면 그 방향으로 덮어씀.
  const baseDir = useMemo(() => {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rrx * DEG2RAD, rry * DEG2RAD, rrz * DEG2RAD));
    return LIGHT_DOWN.clone().applyQuaternion(q);
  }, [rrx, rry, rrz]);
  const [drag, setDrag] = useState<THREE.Vector3 | null>(null);   // 드래그 중 빔 방향
  const [dragLen, setDragLen] = useState<number | null>(null);    // 드래그 중 빔 길이
  const [dragging, setDragging] = useState(false);
  const commitRef = useRef<{ dir: THREE.Vector3; len: number } | null>(null);
  const dir = drag ?? baseDir;

  // (B) dash 길이 = 저장된 빔 길이(light.distance)를 바닥(y=0)까지로 클램프 → min=라이트, max=바닥.
  const storedLen = lc.distance ?? (lc.type === 'spot' ? 20 : 5);
  const floorReach = dir.y < -1e-3 ? py / -dir.y : Infinity; // 빔이 바닥에 닿는 거리(위/수평이면 무한대)
  const dashLen = dragLen ?? Math.max(LIGHT_MIN_LEN, Math.min(storedLen, floorReach));

  // 카메라를 향한 평면(라이트 중심 통과)에 광선을 투영 → 3D 지점 p. p.y는 바닥 아래로 못 감(max=바닥).
  // p로부터 방향(dir)과 길이(len=|p-light|)를 동시에 얻는다 → 핸들 하나로 방향+길이 조절.
  const _camN = useMemo(() => new THREE.Vector3(), []);
  const _plane = useMemo(() => new THREE.Plane(), []);
  const solveHandle = (ray: THREE.Ray): { dir: THREE.Vector3; len: number } | null => {
    const lp = new THREE.Vector3(px, py, pz);
    camera.getWorldDirection(_camN);
    _plane.setFromNormalAndCoplanarPoint(_camN, lp);
    const hit = new THREE.Vector3();
    if (!ray.intersectPlane(_plane, hit)) return null;
    if (hit.y < 0) hit.y = 0; // 바닥 아래로 못 내려감 → 최대 길이는 바닥
    const d = hit.sub(lp);
    const len = d.length();
    if (len < 1e-4) return null;
    return { dir: d.divideScalar(len), len: Math.max(LIGHT_MIN_LEN, len) };
  };
  // 드래그 중 실시간: 그룹 회전(=emission 미리보기) 즉시 반영 + Inspector 회전 수치 라이브 게시.
  const publishLive = (d: THREE.Vector3) => {
    const g = groupRef.current;
    if (g) g.quaternion.setFromUnitVectors(LIGHT_DOWN, d);
    useLiveTransformStore.getState().setLive({
      id: object.id, position: { x: px, y: py, z: pz }, rotation: beamDirToRotDeg(d), scale: { x: 1, y: 1, z: 1 },
    });
  };

  // 드래그는 window 리스너 + 카메라 레이캐스트로 처리 → 커서가 핸들을 벗어나도 안정적으로 따라온다.
  useEffect(() => {
    if (!dragging) return;
    const el = gl.domElement;
    const move = (ev: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      _lightNdc.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
      _lightRaycaster.setFromCamera(_lightNdc, camera);
      const r = solveHandle(_lightRaycaster.ray);
      if (!r) return;
      commitRef.current = r;
      setDrag(r.dir);
      setDragLen(r.len);
      publishLive(r.dir);
    };
    const up = () => {
      setDragging(false);
      document.body.style.cursor = '';
      if (controls) controls.enabled = true;
      const r = commitRef.current;
      // 방향(rotation) + 길이(light.distance) 함께 커밋(undo 1회).
      if (r) { updateObject(object.id, { rotation: beamDirToRotDeg(r.dir), light: { ...lc, distance: r.len } }); pushHistory(); }
      setDrag(null);
      setDragLen(null);
      useLiveTransformStore.getState().setLive(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging]);

  const onHandleDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    pointerDownOnObjectRef.current = true;
    commitRef.current = { dir: dir.clone(), len: dashLen };
    if (controls) controls.enabled = false; // orbit 잠금(드래그가 카메라로 안 새게)
    setDrag(dir.clone());
    setDragLen(dashLen);
    setDragging(true);
  };

  // 방향 핸들(빔 끝) 월드 좌표 + 핸들 방향 정렬 쿼터니언(로컬 +Y → dir).
  const hx = px + dir.x * dashLen, hy = py + dir.y * dashLen, hz = pz + dir.z * dashLen;
  const handleQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);

  return (
    <>
    <group ref={groupRef} onPointerDown={markObjectHit}>
      {/* 실제 라이트 — 에디터에서도 조명 효과 미리보기. spot/directional은 target으로 방향 제어. */}
      {lc.type === 'point' && (
        <pointLight
          color={lc.color} intensity={lc.intensity}
          distance={lc.distance ?? 20} decay={lc.decay ?? 2}
          castShadow={lc.castShadow}
        />
      )}
      {lc.type === 'spot' && (
        <spotLight
          color={lc.color} intensity={lc.intensity}
          distance={lc.distance ?? 20} decay={lc.decay ?? 2}
          angle={lc.angle ?? Math.PI / 6} penumbra={lc.penumbra ?? 0.1}
          castShadow={lc.castShadow}
          target={targetObj}
        />
      )}
      {lc.type === 'directional' && (
        <directionalLight color={lc.color} intensity={lc.intensity} castShadow={lc.castShadow} target={targetObj} />
      )}
      {isDir && <primitive object={targetObj} position={[0, -LIGHT_HANDLE_DIST, 0]} />}

      {/* 아이콘 — 클릭 가능한 시각 표시자 */}
      <mesh
        onClick={(e) => { e.stopPropagation(); handleClick(e.nativeEvent.shiftKey); }}
        onDoubleClick={(e) => { e.stopPropagation(); selectExact(object, e.nativeEvent.shiftKey); }}
      >
        <octahedronGeometry args={[0.18, 0]} />
        <meshBasicMaterial color={iconColor} />
      </mesh>
      {/* 외곽 glow ring */}
      <mesh>
        <sphereGeometry args={[0.28, 8, 8]} />
        <meshBasicMaterial color={iconColor} transparent opacity={0.12} depthWrite={false} />
      </mesh>
      {/* spot: 방향 콘 와이어프레임 — 로컬 -Y(빔)로 펼쳐져 회전 시 함께 돌며 방향을 보여줌 */}
      {lc.type === 'spot' && (
        <mesh position={[0, -1.5, 0]}>
          <coneGeometry args={[Math.tan(lc.angle ?? Math.PI / 6) * 3, 3, 16, 1, true]} />
          <meshBasicMaterial color={iconColor} wireframe transparent opacity={0.3} />
        </mesh>
      )}
      {/* 선택 하이라이트 */}
      {isSelected && (
        <mesh>
          <sphereGeometry args={[0.4, 8, 8]} />
          <meshBasicMaterial color="#7c3aed" wireframe />
        </mesh>
      )}
    </group>

    {/* ── 방향 기즈모(spot/directional) — 라이트에서 빔 방향으로 뻗는 점선 + 끝의 드래그 핸들.
        핸들을 끌면 빛 방향이 바뀌고(그룹 회전+target 이동) Inspector 수치가 실시간 갱신된다.
        object.visible=false면 통째로 사라진다. 회전 그룹 밖(월드 공간)이라 좌표는 직접 계산. ── */}
    {isDir && object.visible && (
      <group>
        <Line
          points={[[px, py, pz], [hx, hy, hz]]}
          color={iconColor}
          lineWidth={1.5}
          dashed
          dashSize={0.25}
          gapSize={0.15}
          transparent
          opacity={0.85}
          depthTest={false}
          renderOrder={998}
        />
        <group position={[hx, hy, hz]} quaternion={handleQuat}>
          {/* 방향 화살촉(빔 방향) */}
          <mesh position={[0, 0.17, 0]} renderOrder={999}>
            <coneGeometry args={[0.13, 0.34, 14]} />
            <meshBasicMaterial color={iconColor} depthTest={false} depthWrite={false} />
          </mesh>
          {/* 링(빔에 수직) — 잡는 '원' */}
          <mesh rotation={[Math.PI / 2, 0, 0]} renderOrder={999}>
            <ringGeometry args={[0.2, 0.3, 24]} />
            <meshBasicMaterial color={iconColor} transparent opacity={0.9} depthTest={false} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
          {/* 잡기 히트영역(투명·크게) — 드래그로 방향 조절 */}
          <mesh
            renderOrder={999}
            onPointerDown={onHandleDown}
            onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'grab'; }}
            onPointerOut={() => { if (!dragging) document.body.style.cursor = ''; }}
          >
            <sphereGeometry args={[0.42, 12, 12]} />
            <meshBasicMaterial transparent opacity={0} depthTest={false} depthWrite={false} />
          </mesh>
        </group>
      </group>
    )}

    {/* point 라이트 — 방향이 없으므로 위치/높이 표시용 수직 드롭 라인만(visible 게이트). */}
    {lc.type === 'point' && object.visible && py > 0.05 && (
      <group>
        <Line
          points={[[px, py, pz], [px, 0.002, pz]]}
          color={iconColor}
          lineWidth={1.5}
          dashed
          dashSize={0.25}
          gapSize={0.15}
          transparent
          opacity={0.8}
          depthTest={false}
          renderOrder={998}
        />
        <mesh position={[px, 0.004, pz]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={998}>
          <ringGeometry args={[0.16, 0.26, 24]} />
          <meshBasicMaterial color={iconColor} transparent opacity={0.8} depthWrite={false} depthTest={false} />
        </mesh>
      </group>
    )}
    </>
  );
}

// object의 조상(자기 포함) 중 parentId===scopeId 인 노드(=스코프 그룹의 직속 자식) id. 스코프 밖이면 null.
function scopeChildOnPath(object: ObjectNodeSchema, scopeId: string): string | null {
  const all = useSceneStore.getState().objects;
  let cur: ObjectNodeSchema | undefined = object;
  while (cur) {
    if (cur.parentId === scopeId) return cur.id;
    if (!cur.parentId) return null;
    const pid: string = cur.parentId;
    cur = all.find((o) => o.id === pid);
  }
  return null;
}

// 단일 클릭 — 기본은 최상위 조상 그룹 선택. 단, 그룹 격리 스코프에 '진입'한 상태면
// 그 스코프 안에서 형제(스코프의 직속 자식)를 선택한다. 스코프 밖을 클릭하면 스코프 해제 후 최상위 선택.
function selectByClick(object: ObjectNodeSchema, shiftKey: boolean) {
  const store = useSceneStore.getState();
  if (object.locked) { if (!shiftKey) { store.selectObject(null); store.setGroupScope(null); } return; }

  const scope = store.groupScope;
  let targetId: string;
  if (scope && store.objects.some((o) => o.id === scope)) {
    const inScope = scopeChildOnPath(object, scope);
    if (inScope) {
      targetId = inScope; // 스코프 내 형제 선택 — 최상위로 튕기지 않음
    } else {
      store.setGroupScope(null); // 스코프 밖 클릭 → 해제
      targetId = findRootAncestorId(object);
    }
  } else {
    targetId = findRootAncestorId(object);
  }
  if (shiftKey) store.toggleSelectObject(targetId);
  else store.selectObject(targetId);
}

// 더블 클릭 — 클릭한 '바로 그 오브젝트(리프)'를 직접 선택하고, 그 부모 그룹으로 격리 스코프에 진입한다.
// 이후 단일 클릭은 그 그룹 안의 형제를 고를 수 있다(빈 곳/Esc/스코프 밖 클릭으로 나감).
// R3F onDoubleClick은 레이가 맞은 가장 깊은 메쉬에서 먼저 발생하므로 중첩 그룹이어도 정확히 그 자식을 고른다.
// (계층 트리는 selectedId 변화를 감지해 조상 그룹들을 자동으로 펼친다.)
function selectExact(object: ObjectNodeSchema, shiftKey: boolean) {
  if (object.locked) return;
  const store = useSceneStore.getState();
  // 그룹을 더블클릭하면 그 그룹으로 진입(scope=자기 자신), 리프면 부모 그룹으로 진입.
  store.setGroupScope(object.isGroup ? object.id : (object.parentId ?? null));
  if (shiftKey) store.toggleSelectObject(object.id);
  else store.selectObject(object.id);
  store.requestFocusSelected(); // 더블클릭 = 그 대상으로 카메라 프레이밍
}

// 중첩 그룹 클릭 시 최상위 조상 그룹 ID를 반환
function findRootAncestorId(object: ObjectNodeSchema): string {
  if (!object.parentId) return object.id;
  const allObjects = useSceneStore.getState().objects;
  let targetId = object.id;
  let parentId: string | null = object.parentId;
  while (parentId) {
    targetId = parentId;
    const parent = allObjects.find((o) => o.id === parentId);
    parentId = parent?.parentId ?? null;
  }
  return targetId;
}

function GroupObjectInstance({ object }: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const refsMap = useObjectRefs();
  const selectObject = useSceneStore((s) => s.selectObject);
  const toggleSelectObject = useSceneStore((s) => s.toggleSelectObject);
  const selectedIds = useSceneStore((s) => s.selectedIds);
  const selectedId = useSceneStore((s) => s.selectedId);
  const children = useSceneStore(useShallow((s) => s.objects.filter((o) => o.parentId === object.id)));
  const isSelected = selectedIds.length > 0 ? selectedIds.includes(object.id) : selectedId === object.id;

  // useLayoutEffect: 커밋 중 동기 등록 → 재부모화(언마운트→리마운트) 시 기즈모가
  // 옛(분리된) ref를 붙들지 않도록 새 ref를 페인트 전에 refsMap에 반영한다
  useLayoutEffect(() => {
    if (groupRef.current) refsMap.current.set(object.id, groupRef.current);
    return () => { refsMap.current.delete(object.id); };
  }, [object.id, refsMap]);

  // useLayoutEffect: 브라우저 페인트 전(R3F 렌더 전) 동기 실행
  // useEffect는 페인트 후 실행되므로 그룹 신규 마운트 시 첫 프레임에 (0,0,0)으로 렌더됨 → 바닥 통과 flash 발생
  useLayoutEffect(() => {
    const g = groupRef.current;
    if (!g) return;
    g.position.set(object.position.x, object.position.y, object.position.z);
    g.rotation.set(object.rotation.x * DEG2RAD, object.rotation.y * DEG2RAD, object.rotation.z * DEG2RAD);
    g.scale.set(object.scale.x, object.scale.y, object.scale.z);
    g.visible = object.visible; // 언마운트 대신 플래그 토글 (좌표 리셋 버그 방지)
  }, [object.position.x, object.position.y, object.position.z,
      object.rotation.x, object.rotation.y, object.rotation.z,
      object.scale.x, object.scale.y, object.scale.z, object.visible]);

  return (
    // 그룹 <group>에는 onClick을 두지 않는다 — 자식 클릭이 findRootAncestorId로 이미 그룹을 선택하며,
    // 여기에 onClick을 두면 자식 클릭이 조상 그룹으로 버블링돼 스코프 선택을 덮어쓴다(형제 클릭이 최상위로 튕기던 버그).
    <group ref={groupRef} onPointerDown={markObjectHit}>
      {/* 그룹 선택 마커(원점의 마름모)는 제거 — 기즈모(bbox 중심)와 위치가 달라 오해를 줬음.
          선택 표시는 기즈모 + 계층 트리 하이라이트로 충분. 그룹 선택/진입은 자식 클릭으로 처리된다. */}
      {children.map((child) => (
        <EditorObjectInstance key={child.id} object={child} />
      ))}
    </group>
  );
}

export function EditorObjectInstance({ object }: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const refsMap = useObjectRefs();
  const selectObject = useSceneStore((s) => s.selectObject);
  const toggleSelectObject = useSceneStore((s) => s.toggleSelectObject);
  const selectedId = useSceneStore((s) => s.selectedId);
  const selectedIds = useSceneStore((s) => s.selectedIds);
  const assets = useSceneStore((s) => s.assets);
  const materialAssets = useSceneStore((s) => s.materialAssets);
  const wireframeMode = useSceneStore((s) => s.wireframeMode);
  const isSelected = selectedIds.length > 0 ? selectedIds.includes(object.id) : selectedId === object.id;
  const [hovered, setHovered] = useState(false);
  // 잠긴 오브젝트는 선택뿐 아니라 호버 하이라이트도 뜨지 않도록 hovered=true를 무시한다
  const handlePointerOver = (e: { stopPropagation: () => void }) => { e.stopPropagation(); if (!object.locked) setHovered(true); };
  const handlePointerOut = (e: { stopPropagation: () => void }) => { e.stopPropagation(); setHovered(false); };

  // useLayoutEffect: 커밋 중 동기 등록 → 재부모화(언마운트→리마운트) 시 기즈모가
  // 옛(분리된) ref를 붙들지 않도록 새 ref를 페인트 전에 refsMap에 반영한다
  useLayoutEffect(() => {
    if (groupRef.current) refsMap.current.set(object.id, groupRef.current);
    return () => { refsMap.current.delete(object.id); };
  }, [object.id, refsMap]);

  useLayoutEffect(() => {
    const g = groupRef.current;
    if (!g) return;
    g.position.set(object.position.x, object.position.y, object.position.z);
    g.rotation.set(
      object.rotation.x * DEG2RAD,
      object.rotation.y * DEG2RAD,
      object.rotation.z * DEG2RAD,
    );
    g.scale.set(object.scale.x, object.scale.y, object.scale.z);
    // visible은 언마운트가 아니라 플래그로 토글 — 언마운트 시 새 그룹이 기본 좌표로
    // 생성되고 이 effect가 (deps 불변으로) 재실행 안 돼 좌표/크기가 리셋되는 버그 방지
    g.visible = object.visible;
  }, [
    object.position.x, object.position.y, object.position.z,
    object.rotation.x, object.rotation.y, object.rotation.z,
    object.scale.x, object.scale.y, object.scale.z,
    object.visible,
  ]);

  // 그룹 오브젝트는 별도 컴포넌트로 렌더 (hooks 이후에 early return)
  if (object.isGroup) return <GroupObjectInstance object={object} />;
  if (object.light) return <LightObjectInstance object={object} />;

  const assetRef = object.assetId ? assets.find((a) => a.id === object.assetId) : null;
  // 재질 리졸브(공존형) — materialId 참조가 있으면 공용 에셋 재질, 없으면 인라인.
  const mat = effectiveMaterial(object, materialAssets);
  const color = mat?.color ?? '#a78bfa';
  const roughness = mat?.roughness ?? 0.5;
  const metalness = mat?.metalness ?? 0.1;
  const emissive = mat?.emissive ?? '#000000';
  // 렌더 옵션(셰이딩/양면/그림자) — 미설정 = 스무스·앞면·그림자 생성+수신
  const rdFlat = object.render?.flatShading ?? false;
  const rdSide = object.render?.doubleSided ? THREE.DoubleSide : THREE.FrontSide;
  const rdCast = object.render?.castShadow ?? false;
  const rdReceive = object.render?.receiveShadow ?? false;

  // 프리미티브 지오메트리(둥근 박스·각뿔대 등 확장 파라미터 반영). 파라미터 바뀌면 재생성·이전 것 dispose.
  const primGeom = useMemo(
    () => createPrimitiveGeometry(object.primitiveShape, object.geom),
    // profileSig/voxelSig는 내용을 반영 → 펜툴·복셀 재편집으로 데이터가 바뀌면 지오메트리 재생성.
    [object.primitiveShape, object.geom?.cornerRadius, object.geom?.cornerSegments, object.geom?.topScale, (object.geom?.sections ?? []).join(','), object.geom?.extrudeDepth, object.geom?.profileClosed, profileSig(object.geom), voxelSig(object.geom?.voxels), object.geom?.subdivisions],
  );
  useEffect(() => () => primGeom.dispose(), [primGeom]);

  // 실제 지오메트리 bounding box(원시) — 선택/호버 가이드와 콜라이더 오버레이가 공유한다.
  // (돌출/로프트/평면처럼 한 축이 얇은 형상에서 고정 단위 박스 가이드가 과대 표시되던 문제 수정.
  //  normalizeUnit이 최대 변만 1로 맞춰 다른 축은 <1이 되므로.) box/구체는 bbox=1이라 무변화.
  const bbox = useMemo(() => {
    primGeom.computeBoundingBox();
    const b = primGeom.boundingBox;
    if (!b) return { size: [1, 1, 1] as [number, number, number], center: [0, 0, 0] as [number, number, number] };
    return {
      size: [
        Math.max(b.max.x - b.min.x, 0.02),
        Math.max(b.max.y - b.min.y, 0.02),
        Math.max(b.max.z - b.min.z, 0.02),
      ] as [number, number, number],
      center: [(b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2] as [number, number, number],
    };
  }, [primGeom]);

  // 프리미티브/콘텐츠의 실제 로컬 bbox를 캐시 → objectBBox.localBBox가 읽어 드래그 아웃라인·정렬·바닥
  // 스냅이 실제 크기를 쓴다(예전엔 단위 큐브 가정). GLB/라이트/파티클은 제외(각자 경로).
  useEffect(() => {
    if (object.assetId || object.light || object.particle) return;
    const key = primitiveGeomKey(object.primitiveShape, object.geom);
    const [sx, sy, sz] = bbox.size;
    const [cx, cy, cz] = bbox.center;
    primLocalBboxCache.set(
      key,
      new THREE.Box3(
        new THREE.Vector3(cx - sx / 2, cy - sy / 2, cz - sz / 2),
        new THREE.Vector3(cx + sx / 2, cy + sy / 2, cz + sz / 2),
      ),
    );
  }, [bbox, object.primitiveShape, object.geom, object.assetId, object.light, object.particle]);

  const handleClick = (shiftKey: boolean) => selectByClick(object, shiftKey);

  // 파티클 이미터 렌더링
  if (object.particle) {
    return (
      <group ref={groupRef} onPointerDown={markObjectHit}>
        <ParticleEmitter config={object.particle} />
        {/* 선택 표시 — 빌보드 와이어프레임 구체 */}
        {isSelected && (
          <mesh onClick={(e) => { e.stopPropagation(); handleClick(e.nativeEvent.shiftKey); }}>
            <sphereGeometry args={[0.3, 8, 8]} />
            <meshBasicMaterial color="#7c3aed" wireframe transparent opacity={0.6} />
          </mesh>
        )}
        {!isSelected && (
          <mesh onClick={(e) => { e.stopPropagation(); handleClick(e.nativeEvent.shiftKey); }}>
            <sphereGeometry args={[0.3, 8, 8]} />
            <meshBasicMaterial transparent opacity={0} />
          </mesh>
        )}
      </group>
    );
  }

  // Content 오브젝트 렌더링
  if (object.content) {
    return (
      <group
        ref={groupRef}
        onClick={(e) => { e.stopPropagation(); handleClick(e.nativeEvent.shiftKey); }}
        onDoubleClick={(e) => { e.stopPropagation(); selectExact(object, e.nativeEvent.shiftKey); }}
        onPointerDown={markObjectHit}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
      >
        {object.content.type === 'text' ? (
          <Suspense fallback={null}>
            <Center>
              <Text3D
                font="/fonts/helvetiker_regular.typeface.json"
                size={object.content.fontSize ?? 0.5}
                height={object.content.depth ?? 0.1}
                curveSegments={12}
                bevelEnabled
                bevelThickness={0.01}
                bevelSize={0.008}
                bevelSegments={4}
              >
                {object.content.text ?? ''}
                <meshStandardMaterial
                  color={color}
                  roughness={roughness}
                  metalness={metalness}
                  emissive={isSelected ? '#4338ca' : emissive}
                  emissiveIntensity={isSelected ? 0.4 : (emissive !== '#000000' ? 1 : 0)}
                  wireframe={wireframeMode}
                />
              </Text3D>
            </Center>
          </Suspense>
        ) : (
          <mesh>
            <planeGeometry args={[1, 1]} />
            <meshBasicMaterial color={isSelected ? '#7c3aed' : hovered ? '#4338ca' : '#334155'} />
          </mesh>
        )}
        {(isSelected || hovered) && (
          <mesh>
            <planeGeometry args={[1.05, 1.05]} />
            <meshBasicMaterial color={isSelected ? '#7c3aed' : '#a78bfa'} wireframe />
          </mesh>
        )}
        <ColliderOverlay object={object} size={bbox.size} center={bbox.center} />
      </group>
    );
  }

  return (
    <group ref={groupRef} onPointerDown={markObjectHit}>
      {assetRef ? (
        <Suspense fallback={
          <mesh castShadow receiveShadow onClick={(e) => { e.stopPropagation(); handleClick(e.nativeEvent.shiftKey); }}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color="#52525b" wireframe />
          </mesh>
        }>
          <GlbObject
            url={assetRef.dracoUrl}
            objectId={object.id}
            selected={isSelected}
            hovered={hovered}
            onClick={(shiftKey) => handleClick(shiftKey)}
            onDoubleClick={(shiftKey) => selectExact(object, shiftKey)}
            onHoverChange={(h) => setHovered(h && !object.locked)}
            wireframe={wireframeMode}
            colliderGuide={object.physics.enabled ? (object.physics.isSensor ? 'sensor' : 'solid') : undefined}
          />
        </Suspense>
      ) : (
        <mesh
          geometry={primGeom}
          onClick={(e) => { e.stopPropagation(); handleClick(e.nativeEvent.shiftKey); }}
          onDoubleClick={(e) => { e.stopPropagation(); selectExact(object, e.nativeEvent.shiftKey); }}
          onPointerOver={handlePointerOver}
          onPointerOut={handlePointerOut}
          castShadow={rdCast}
          receiveShadow={rdReceive}
        >
          <PrimitiveMaterial
            color={color}
            roughness={roughness}
            metalness={metalness}
            wireframe={wireframeMode}
            emissive={isSelected ? '#4338ca' : emissive}
            emissiveIntensity={isSelected ? 0.4 : (emissive !== '#000000' ? 1 : 0)}
            textureUrl={mat?.textureUrl}
            repeat={mat?.textureRepeat}
            flatShading={rdFlat}
            side={rdSide}
            clearcoat={mat?.clearcoat}
            sheen={mat?.sheen}
            transmission={mat?.transmission}
            ior={mat?.ior}
            vertexColors={object.primitiveShape === 'voxel'}
          />
        </mesh>
      )}
      {!assetRef && (isSelected || hovered) && (
        <mesh position={bbox.center}>
          <boxGeometry args={[bbox.size[0] * 1.04, bbox.size[1] * 1.04, bbox.size[2] * 1.04]} />
          <meshBasicMaterial color={isSelected ? '#7c3aed' : '#a78bfa'} wireframe />
        </mesh>
      )}
      {/* 콜라이더 시각화 — 에디터 전용 (GLB는 GlbObject가 실제 바운딩박스 기준으로 그림) */}
      {!assetRef && <ColliderOverlay object={object} size={bbox.size} center={bbox.center} />}
    </group>
  );
}
