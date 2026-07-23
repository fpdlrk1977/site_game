'use client';

import { useRef, useEffect, useState, useReducer } from 'react';
import { TransformControls } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useSceneStore } from '@/store/sceneStore';
import { useLiveTransformStore } from '@/store/liveTransformStore';
import { useObjectRefs } from './ObjectRefsContext';
import { CHARACTER_PREVIEW_ID } from './CharacterPreview';
import { localCenter, worldBBox, localBBox } from '@/lib/objectBBox';
import { anchorLocalPoint, isCenterAnchor } from '@/lib/pivotMath';

const RAD2DEG = 180 / Math.PI;
const DEG2RAD = Math.PI / 180;

// 재사용 스크래치 (프록시↔오브젝트 변환용)
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _lp = new THREE.Vector3();
const _lq = new THREE.Quaternion();
const _ls = new THREE.Vector3();
const _snapBox = new THREE.Box3();
const OBJECT_SNAP_THRESHOLD = 0.2; // 월드 거리(m) — 이 안쪽이면 다른 오브젝트 모서리/중심에 흡착(고정값=예측 가능·점프 상한)

interface Props {
  orbitRef: React.RefObject<OrbitControlsImpl | null>;
  gizmoDraggingRef: React.MutableRefObject<boolean>;
}

function MultiGizmo({ orbitRef, gizmoDraggingRef }: Props) {
  const { selectedIds, transformMode, transformSpace,
    snapEnabled, snapTranslate, snapRotate, commitTransforms } = useSceneStore();
  const refsMap = useObjectRefs();

  // ref callback → group이 마운트되는 순간 상태 업데이트 → 리렌더 발생
  const [pivotEl, setPivotEl] = useState<THREE.Group | null>(null);

  const dragStartPivot = useRef(new THREE.Vector3());
  const dragStartPositions = useRef<Map<string, THREE.Vector3>>(new Map());
  const dragStartQuaternions = useRef<Map<string, THREE.Quaternion>>(new Map());
  const dragStartScales = useRef<Map<string, THREE.Vector3>>(new Map());

  // 피벗을 선택 오브젝트들의 '월드 bbox union 중심'에 둔다.
  //  - 그룹 단일 기즈모(bbox 중심)와 동일 기준 → 다중선택 기즈모와 그룹 기즈모 위치가 일치(문제 B 해결).
  //  - 드래그 중이 아니면 매 프레임 재동기화 → undo/redo 등 외부 위치 변경 후에도 피벗이 오브젝트를 따라간다
  //    (스테일 피벗이 다음 상호작용에서 잘못된 델타로 오브젝트를 끌어당기던 문제 A 해결).
  const syncPivot = () => {
    if (!pivotEl || selectedIds.length < 2) return;
    const { objects, assets } = useSceneStore.getState();
    const box = new THREE.Box3().makeEmpty();
    for (const id of selectedIds) {
      const b = worldBBox(objects, assets, id);
      if (b && !b.isEmpty()) box.union(b);
    }
    if (box.isEmpty()) return;
    box.getCenter(pivotEl.position);
    pivotEl.rotation.set(0, 0, 0);
    pivotEl.scale.set(1, 1, 1);
  };
  useEffect(syncPivot, [pivotEl, selectedIds]); // 초기/선택 변경 시 배치
  useFrame(() => { if (!gizmoDraggingRef.current) syncPivot(); }); // 드래그 아닐 때 지속 동기화

  return (
    <>
      {/* ref callback: 그룹이 씬에 추가되는 순간 setPivotEl 호출 → 리렌더 */}
      <group ref={setPivotEl} />

      {pivotEl && (
        <TransformControls
          object={pivotEl}
          mode={transformMode}
          space={transformSpace}
          translationSnap={snapEnabled ? snapTranslate : null}
          rotationSnap={snapEnabled ? snapRotate * DEG2RAD : null}
          scaleSnap={snapEnabled ? 0.1 : null}
          onMouseDown={() => {
            gizmoDraggingRef.current = true;
            useLiveTransformStore.getState().setDragging(true); // 드래그 중 호버 가이드 억제
            if (orbitRef.current) orbitRef.current.enabled = false;
            // 이전 드래그에서 pivotEl에 누적된 rotation/scale 초기화
            // 초기화하지 않으면 두 번째 rotate/scale 시 변환이 중첩 적용돼 좌표가 깨짐
            pivotEl.rotation.set(0, 0, 0);
            pivotEl.scale.set(1, 1, 1);
            dragStartPivot.current.copy(pivotEl.position);
            dragStartPositions.current.clear();
            dragStartQuaternions.current.clear();
            dragStartScales.current.clear();
            for (const id of selectedIds) {
              const ref = refsMap.current.get(id);
              if (ref && ref.parent) {
                dragStartPositions.current.set(id, ref.position.clone());
                dragStartQuaternions.current.set(id, ref.quaternion.clone());
                dragStartScales.current.set(id, ref.scale.clone());
              }
            }
          }}
          onChange={() => {
            // 드래그 중일 때만 적용 — 마우스를 놓은 뒤 syncPivot이 pivotEl을 리셋하며 튀는 stray onChange가
            // dragStart 기준으로 refs를 시작 스케일/위치로 되돌려 커밋을 덮어쓰던 버그 방지(다중선택 revert).
            if (!gizmoDraggingRef.current) return;
            if (transformMode === 'translate') {
              const dx = pivotEl.position.x - dragStartPivot.current.x;
              const dy = pivotEl.position.y - dragStartPivot.current.y;
              const dz = pivotEl.position.z - dragStartPivot.current.z;
              const { objects: objs } = useSceneStore.getState();
              for (const id of selectedIds) {
                const ref = refsMap.current.get(id);
                const start = dragStartPositions.current.get(id);
                if (ref && start) {
                  // 바닥(y=0) 침범 클램프 제거(사용자 요청) — 바닥 아래로도 이동 가능. '바닥에 놓기' 스냅은 유지.
                  ref.position.set(start.x + dx, start.y + dy, start.z + dz);
                }
              }
            } else if (transformMode === 'rotate') {
              for (const id of selectedIds) {
                const ref = refsMap.current.get(id);
                const startPos = dragStartPositions.current.get(id);
                const startQ = dragStartQuaternions.current.get(id);
                if (!ref || !startPos || !startQ) continue;
                const relPos = startPos.clone().sub(dragStartPivot.current);
                relPos.applyQuaternion(pivotEl.quaternion);
                ref.position.copy(relPos).add(dragStartPivot.current);
                ref.quaternion.copy(pivotEl.quaternion).multiply(startQ);
              }
            } else if (transformMode === 'scale') {
              const { x: sx, y: sy, z: sz } = pivotEl.scale;
              for (const id of selectedIds) {
                const ref = refsMap.current.get(id);
                const startPos = dragStartPositions.current.get(id);
                const startScale = dragStartScales.current.get(id);
                if (!ref || !startPos || !startScale) continue;
                const relPos = startPos.clone().sub(dragStartPivot.current);
                relPos.x *= sx; relPos.y *= sy; relPos.z *= sz;
                ref.position.copy(relPos).add(dragStartPivot.current);
                ref.scale.set(startScale.x * sx, startScale.y * sy, startScale.z * sz);
              }
            }
          }}
          onMouseUp={() => {
            gizmoDraggingRef.current = false;
            useLiveTransformStore.getState().setDragging(false);
            if (orbitRef.current) orbitRef.current.enabled = true;
            const { objects: objs } = useSceneStore.getState();
            // 모든 대상의 최종 트랜스폼을 모아 원자적으로 1회 커밋(undo 기준 오염 없음).
            type Vec3 = { x: number; y: number; z: number };
            const updates: { id: string; position: Vec3; rotation: Vec3; scale: Vec3 }[] = [];
            for (const id of selectedIds) {
              const ref = refsMap.current.get(id);
              if (!ref) continue;
              // 바닥(y=0) 침범 클램프 제거(사용자 요청) — 위치 그대로 커밋. '바닥에 놓기' 스냅은 유지.
              updates.push({
                id,
                position: { x: ref.position.x, y: ref.position.y, z: ref.position.z },
                rotation: { x: ref.rotation.x * RAD2DEG, y: ref.rotation.y * RAD2DEG, z: ref.rotation.z * RAD2DEG },
                scale: { x: ref.scale.x, y: ref.scale.y, z: ref.scale.z },
              });
            }
            if (updates.length > 0) commitTransforms(updates);
          }}
        />
      )}
    </>
  );
}

function SingleGizmo({ orbitRef, gizmoDraggingRef }: Props) {
  const { selectedId, transformMode, transformSpace, snapEnabled, snapTranslate, snapRotate, objectSnap,
    objects, assets, animClips, pivotMotorId, commitTransforms, updateEnvironment, pushHistory } = useSceneStore();
  const refsMap = useObjectRefs();
  // 기즈모는 "형상 중심에 놓인 프록시"에 붙는다 → 위젯이 원점(하단)이 아니라 중심에 뜨고,
  // 프록시는 재부모화되지 않으므로 예전의 scene graph 에러도 없다. 조작은 오브젝트로 역매핑.
  const proxyRef = useRef<THREE.Object3D | null>(null);
  if (proxyRef.current === null) proxyRef.current = new THREE.Object3D();
  const cLocalRef = useRef(new THREE.Vector3()); // 선택 오브젝트의 로컬 형상 중심
  const floorMinYRef = useRef(0);
  const snapTargetsRef = useRef<THREE.Box3[]>([]); // 오브젝트 스냅 대상(다른 루트 오브젝트 월드 bbox, 드래그 시작 시 스냅샷)

  // 새로 추가/선택된 오브젝트의 3D ref는 그 인스턴스가 마운트된 '다음 프레임'에 refsMap에 등록된다.
  // refsMap은 Map(ref)이라 등록돼도 리렌더가 안 나 → 기즈모가 안 뜨고, 한 번 더 클릭해야 뜨던 버그.
  // 아래 useFrame이 ref 유무 변화를 감지해 딱 한 번 강제 리렌더한다(등록=즉시 표시·제거=즉시 숨김).
  const [, bumpGizmo] = useReducer((x: number) => x + 1, 0);

  const isCharPreview = selectedId === CHARACTER_PREVIEW_ID;
  const selectedObject = isCharPreview ? null : objects.find((o) => o.id === selectedId);
  const target = selectedId ? refsMap.current.get(selectedId) : undefined;

  const valid = !!selectedId && (isCharPreview || (!!selectedObject && !selectedObject.locked && selectedObject.visible));
  const effectiveMode = isCharPreview ? 'translate' : transformMode;
  const skipYClamp = !isCharPreview && (selectedObject?.parentId != null);
  const pivotMoving = !!pivotMotorId && pivotMotorId === selectedId; // 경첩 이동 모드 = 기즈모 숨김

  // 선택 오브젝트의 로컬 회전중심(cLocal) 갱신 — 기본은 형상 중심(프리미티브/캐릭터는 원점 0).
  //   단, 회전 모드 + 이 오브젝트를 rootId로 갖는 pivot(경첩) 클립이 있으면 → cLocal을 그 경첩 점으로.
  //   pivot은 오브젝트 원점 기준 스케일드 오프셋(0.5×scale) → 지오메트리-로컬은 pivot/scale (형상중심 안 더함:
  //   런타임 pivotOffset·노란 표식과 동일하게 원점 기준). 프록시가 그 점 기준으로 회전 →
  //   origin = restOrigin + (pivot − R·pivot)로 baked 저장(= 런타임 pivotOffset과 픽셀 일치).
  useEffect(() => {
    if (isCharPreview || !selectedId) { cLocalRef.current.set(0, 0, 0); return; }
    // 애니 경첩 pivot(회전 모드): 이 오브젝트가 어느 클립 트랙의 pivot을 가지면 그 경첩 기준으로 회전.
    let animPivot: { x: number; y: number; z: number } | undefined;
    if (transformMode === 'rotate') {
      for (const cl of animClips) {
        const tr = cl.tracks.find((t) => t.objectId === selectedId);
        if (tr) { animPivot = tr.pivot ?? (cl.rootId === selectedId ? cl.pivot : undefined); break; }
      }
    }
    // 오브젝트 앵커(pivot) 설정 → 스케일·회전 **둘 다** 그 앵커 점을 중심(cLocal)으로.
    //   → 기즈모가 앵커 기준으로 스케일(하단 앵커면 아래 고정)/회전(앵커 축 회전). doc/PIVOT_MANIPULATION.md.
    //   애니 경첩(animPivot)이 있으면 그게 우선(기존 애니 경첩 편집 보존).
    const selObj = objects.find((o) => o.id === selectedId);
    // 모터(액추에이터): 원점=경첩(dot)이 곧 회전축 → 이동/회전/스케일 기즈모를 항상 원점에 둔다.
    //   (일반 그룹처럼 자식 bbox 중심에 두면 위젯이 경첩과 어긋나 헷갈림. doc/PIVOT_MANIPULATION.md §6)
    if (selObj?.isActuator) { cLocalRef.current.set(0, 0, 0); return; }
    const anchorSet = !isCenterAnchor(selObj?.pivot);
    if ((transformMode === 'scale' || transformMode === 'rotate') && anchorSet && !animPivot) {
      const lb = localBBox(objects, assets, selectedId);
      cLocalRef.current.copy(lb && !lb.isEmpty() ? anchorLocalPoint(lb, selObj!.pivot!) : (localCenter(objects, assets, selectedId) ?? _p.set(0, 0, 0)));
    } else if (animPivot) {
      const sc = selObj?.scale ?? { x: 1, y: 1, z: 1 };
      cLocalRef.current.set(
        sc.x ? animPivot.x / sc.x : 0,
        sc.y ? animPivot.y / sc.y : 0,
        sc.z ? animPivot.z / sc.z : 0,
      );
    } else {
      cLocalRef.current.copy(localCenter(objects, assets, selectedId) ?? _p.set(0, 0, 0));
    }
  }, [selectedId, isCharPreview, objects, assets, transformMode, animClips]);

  // Shift 누르는 동안 회전 15° 스냅 (Figma식)
  const [shiftSnap, setShiftSnap] = useState(false);
  useEffect(() => {
    const sync = (e: KeyboardEvent) => setShiftSnap(e.shiftKey);
    window.addEventListener('keydown', sync);
    window.addEventListener('keyup', sync);
    return () => { window.removeEventListener('keydown', sync); window.removeEventListener('keyup', sync); };
  }, []);

  // 드래그 중이 아니면 프록시를 오브젝트(형상 중심/회전/스케일)에 매 프레임 동기화
  useFrame(() => {
    const proxy = proxyRef.current!;
    // ref 유무가 render 시점(target)과 달라졌으면(마운트 등록/언마운트) 한 번 리렌더 → 기즈모 즉시 반영.
    const liveTarget = selectedId ? refsMap.current.get(selectedId) : undefined;
    if (!!liveTarget !== !!target) { bumpGizmo(); return; }
    if (gizmoDraggingRef.current || !valid || !target || !target.parent) return;
    target.updateWorldMatrix(true, false);
    target.matrixWorld.decompose(_p, _q, _s);
    proxy.position.copy(cLocalRef.current).applyMatrix4(target.matrixWorld); // 월드 형상 중심
    proxy.quaternion.copy(_q);
    proxy.scale.copy(_s);
  });

  if (!valid || !target) return null;

  // 프록시(월드) → 오브젝트 로컬 pos/rot/scale 역매핑
  const applyProxyToTarget = () => {
    const proxy = proxyRef.current!;
    // 오브젝트 원점(월드) = 프록시위치 − Q·(S ⊙ cLocal) → 형상 중심이 프록시 위치에 오게 한다
    const cScaled = _lp.copy(cLocalRef.current).multiply(proxy.scale).applyQuaternion(proxy.quaternion);
    const originWorld = _ls.copy(proxy.position).sub(cScaled);
    const mWorld = new THREE.Matrix4().compose(originWorld, proxy.quaternion, proxy.scale);
    const parent = target.parent;
    if (parent) {
      parent.updateWorldMatrix(true, false);
      mWorld.premultiply(new THREE.Matrix4().copy(parent.matrixWorld).invert());
    }
    mWorld.decompose(_lp, _lq, _ls);
    // 바닥(y=0) 침범 방지 클램프 제거(2026-07-22, 사용자 요청) — 오브젝트가 바닥 아래로도 이동 가능.
    //   '바닥에 놓기'(floorSnapObject) 스냅은 그대로 유지된다(별개 기능).
    target.position.copy(_lp);
    target.quaternion.copy(_lq);
    target.scale.copy(_ls);
    // 오브젝트 스냅(자석) — 이동 시, 다른 루트 오브젝트의 bbox 모서리/중심에 축별로 흡착.
    // 루트 오브젝트 전용(중첩은 로컬좌표라 제외). 토글 OFF면 완전 무영향.
    if (objectSnap && effectiveMode === 'translate' && !isCharPreview && selectedObject && !selectedObject.parentId) {
      applyObjectSnap();
    }
  };

  // 드래그 중인 오브젝트의 월드 bbox(정밀, 가이드박스 오염 없는 스키마 기반)를 계산해
  // 각 축의 min/center/max를 스냅 대상들의 min/center/max와 비교, 임계값 내 최근접에 흡착.
  const applyObjectSnap = () => {
    const lb = localBBox(objects, assets, selectedId!);
    if (!lb || lb.isEmpty() || snapTargetsRef.current.length === 0) return;
    target!.updateWorldMatrix(true, false);
    _snapBox.copy(lb).applyMatrix4(target!.matrixWorld); // 후보 위치의 월드 bbox
    // 자석 범위 = 고정 월드값. (카메라 거리 비례 방식은 폐기: 큰 오브젝트를 멀리서 편집할 때
    //   snapDist가 커져 지나치는 순간 최대 snapDist만큼 오브젝트가 순간이동 → "화면이 휙" 튀는 버그.)
    //   고정값이면 프레임당 점프가 최대 0.2m로 상한이 걸려 예측 가능하다.
    const snapDist = OBJECT_SNAP_THRESHOLD;
    (['x', 'y', 'z'] as const).forEach((axis) => {
      const feats = [_snapBox.min[axis], (_snapBox.min[axis] + _snapBox.max[axis]) / 2, _snapBox.max[axis]];
      let best: number | null = null;
      let bestDist = snapDist;
      for (const tb of snapTargetsRef.current) {
        const tf = [tb.min[axis], (tb.min[axis] + tb.max[axis]) / 2, tb.max[axis]];
        for (const f of feats) for (const t of tf) {
          const d = Math.abs(f - t);
          if (d < bestDist) { bestDist = d; best = t - f; }
        }
      }
      if (best !== null) target!.position[axis] += best;
    });
    // 바닥 침범 클램프 제거(사용자 요청) — 스냅만 적용, y 재클램프 안 함.
  };

  // 스케일 모드는 코너 핸들(ManipulationHandles)이 담당 → 스케일 기즈모 숨김(중복 방지). 이동/회전은 기즈모 유지.
  // 경첩 이동 모드 중엔 기즈모 전체를 숨긴다 — 기즈모 중심(XYZ 자유이동 핸들)이 경첩과 같은 자리라
  // 그대로 두면 경첩 드래그를 기즈모가 가져간다(ActuatorGizmo의 경첩 핸들이 담당).
  const showGizmo = (isCharPreview || effectiveMode !== 'scale') && !pivotMoving;

  return (
    <>
      <primitive object={proxyRef.current} />
      {showGizmo && (
      <TransformControls
        object={proxyRef.current}
        mode={effectiveMode}
        space={transformSpace}
        translationSnap={snapEnabled ? snapTranslate : null}
        rotationSnap={shiftSnap ? 15 * DEG2RAD : (snapEnabled ? snapRotate * DEG2RAD : null)}
        scaleSnap={snapEnabled ? 0.1 : null}
        onMouseDown={() => {
          gizmoDraggingRef.current = true;
          useLiveTransformStore.getState().setDragging(true); // 드래그 중 호버 가이드 억제
          if (orbitRef.current) orbitRef.current.enabled = false;
          if (effectiveMode === 'translate' && !skipYClamp && !isCharPreview) {
            const st = useSceneStore.getState();
            const o = st.objects.find((x) => x.id === selectedId);
            const b = worldBBox(st.objects, st.assets, selectedId!);
            floorMinYRef.current = o && b ? o.position.y - b.min.y : 0;
          }
          // 오브젝트 스냅 대상 스냅샷 — 다른 루트 오브젝트들의 월드 bbox(드래그 중 고정).
          if (objectSnap && effectiveMode === 'translate' && !isCharPreview) {
            const st = useSceneStore.getState();
            const boxes: THREE.Box3[] = [];
            for (const o of st.objects) {
              if (o.id === selectedId || o.parentId || !o.visible || o.isGroup) continue;
              const b = worldBBox(st.objects, st.assets, o.id);
              if (b && !b.isEmpty()) boxes.push(b.clone());
            }
            snapTargetsRef.current = boxes;
          }
        }}
        onChange={() => {
          if (!gizmoDraggingRef.current) return;
          applyProxyToTarget();
          // 라이브 채널에 실시간 트랜스폼 게시 → Inspector 수치가 드래그 중 즉시 갱신(캔버스 리렌더 없음).
          if (!isCharPreview && selectedId) {
            const p = target.position, r = target.rotation, s = target.scale;
            useLiveTransformStore.getState().setLive({
              id: selectedId,
              position: { x: p.x, y: p.y, z: p.z },
              rotation: { x: r.x * RAD2DEG, y: r.y * RAD2DEG, z: r.z * RAD2DEG },
              scale: { x: s.x, y: s.y, z: s.z },
            });
          }
        }}
        onMouseUp={() => {
          gizmoDraggingRef.current = false;
          if (orbitRef.current) orbitRef.current.enabled = true;
          useLiveTransformStore.getState().setLive(null); // 확정값은 아래 commitTransforms가 메인 스토어에 반영
          useLiveTransformStore.getState().setDragging(false);
          const pos = target.position, rot = target.rotation, scl = target.scale;
          if (isCharPreview) {
            updateEnvironment({ playerStartPosition: { x: pos.x, y: Math.max(0, pos.y), z: pos.z } });
            pushHistory();
          } else {
            // 원자적 커밋(단일 대상) — _prevSnapshot 오염 없이 undo 기준 일관.
            commitTransforms([{
              id: selectedId!,
              position: { x: pos.x, y: pos.y, z: pos.z },
              rotation: { x: rot.x * RAD2DEG, y: rot.y * RAD2DEG, z: rot.z * RAD2DEG },
              scale: { x: scl.x, y: scl.y, z: scl.z },
            }]);
          }
        }}
      />
      )}
    </>
  );
}

export function GizmoController({ orbitRef, gizmoDraggingRef }: Props) {
  const selectedIds = useSceneStore((s) => s.selectedIds);
  return selectedIds.length > 1
    ? <MultiGizmo orbitRef={orbitRef} gizmoDraggingRef={gizmoDraggingRef} />
    : <SingleGizmo orbitRef={orbitRef} gizmoDraggingRef={gizmoDraggingRef} />;
}
