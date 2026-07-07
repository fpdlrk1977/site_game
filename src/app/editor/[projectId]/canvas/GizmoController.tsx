'use client';

import { useRef, useEffect, useState } from 'react';
import { TransformControls } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useSceneStore } from '@/store/sceneStore';
import { useObjectRefs } from './ObjectRefsContext';
import { CHARACTER_PREVIEW_ID } from './CharacterPreview';
import { localCenter, worldBBox } from '@/lib/objectBBox';

const RAD2DEG = 180 / Math.PI;
const DEG2RAD = Math.PI / 180;

// 재사용 스크래치 (프록시↔오브젝트 변환용)
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _lp = new THREE.Vector3();
const _lq = new THREE.Quaternion();
const _ls = new THREE.Vector3();

interface Props {
  orbitRef: React.RefObject<OrbitControlsImpl | null>;
  gizmoDraggingRef: React.MutableRefObject<boolean>;
}

function MultiGizmo({ orbitRef, gizmoDraggingRef }: Props) {
  const { selectedIds, transformMode, transformSpace,
    snapEnabled, snapTranslate, snapRotate, updateObject, pushHistory } = useSceneStore();
  const refsMap = useObjectRefs();

  // ref callback → group이 마운트되는 순간 상태 업데이트 → 리렌더 발생
  const [pivotEl, setPivotEl] = useState<THREE.Group | null>(null);

  const dragStartPivot = useRef(new THREE.Vector3());
  const dragStartPositions = useRef<Map<string, THREE.Vector3>>(new Map());
  const dragStartQuaternions = useRef<Map<string, THREE.Quaternion>>(new Map());
  const dragStartScales = useRef<Map<string, THREE.Vector3>>(new Map());

  // pivotEl이 준비되거나 선택이 바뀌면 centroid로 피벗 재배치
  useEffect(() => {
    if (!pivotEl || selectedIds.length < 2) return;
    let cx = 0, cy = 0, cz = 0, n = 0;
    for (const id of selectedIds) {
      const ref = refsMap.current.get(id);
      if (ref) { cx += ref.position.x; cy += ref.position.y; cz += ref.position.z; n++; }
    }
    if (n === 0) return;
    pivotEl.position.set(cx / n, cy / n, cz / n);
    pivotEl.rotation.set(0, 0, 0);
    pivotEl.scale.set(1, 1, 1);
  }, [pivotEl, selectedIds, refsMap]);

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
            if (transformMode === 'translate') {
              const dx = pivotEl.position.x - dragStartPivot.current.x;
              const dy = pivotEl.position.y - dragStartPivot.current.y;
              const dz = pivotEl.position.z - dragStartPivot.current.z;
              const { objects: objs } = useSceneStore.getState();
              for (const id of selectedIds) {
                const ref = refsMap.current.get(id);
                const start = dragStartPositions.current.get(id);
                const obj = objs.find((o) => o.id === id);
                const skipClamp = obj?.parentId != null;
                if (ref && start) {
                  let newY: number;
                  if (skipClamp) {
                    newY = start.y + dy;
                  } else if (obj?.isGroup) {
                    const kids = objs.filter(o => o.parentId === id && !o.isGroup && !o.assetId && !o.content && !o.particle && !o.light);
                    const minY = kids.reduce((m, c) => Math.max(m, (c.scale?.y ?? 1) * 0.5 - (c.position?.y ?? 0)), 0);
                    newY = Math.max(minY, start.y + dy);
                  } else {
                    newY = Math.max(0, start.y + dy);
                  }
                  ref.position.set(start.x + dx, newY, start.z + dz);
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
            if (orbitRef.current) orbitRef.current.enabled = true;
            const { objects: objs } = useSceneStore.getState();
            for (const id of selectedIds) {
              const ref = refsMap.current.get(id);
              if (!ref) continue;
              const obj = objs.find((o) => o.id === id);
              const skipClamp = obj?.parentId != null;
              let finalY = ref.position.y;
              if (!skipClamp) {
                if (obj?.isGroup) {
                  const kids = objs.filter(o => o.parentId === id && !o.isGroup && !o.assetId && !o.content && !o.particle && !o.light);
                  const minY = kids.reduce((m, c) => Math.max(m, (c.scale?.y ?? 1) * 0.5 - (c.position?.y ?? 0)), 0);
                  finalY = Math.max(minY, ref.position.y);
                } else {
                  finalY = Math.max(0, ref.position.y);
                }
              }
              updateObject(id, {
                position: { x: ref.position.x, y: finalY, z: ref.position.z },
                rotation: { x: ref.rotation.x * RAD2DEG, y: ref.rotation.y * RAD2DEG, z: ref.rotation.z * RAD2DEG },
                scale: { x: ref.scale.x, y: ref.scale.y, z: ref.scale.z },
              });
            }
            pushHistory();
          }}
        />
      )}
    </>
  );
}

function SingleGizmo({ orbitRef, gizmoDraggingRef }: Props) {
  const { selectedId, transformMode, transformSpace, snapEnabled, snapTranslate, snapRotate,
    objects, assets, updateObject, updateEnvironment, pushHistory } = useSceneStore();
  const refsMap = useObjectRefs();
  // 기즈모는 "형상 중심에 놓인 프록시"에 붙는다 → 위젯이 원점(하단)이 아니라 중심에 뜨고,
  // 프록시는 재부모화되지 않으므로 예전의 scene graph 에러도 없다. 조작은 오브젝트로 역매핑.
  const proxyRef = useRef<THREE.Object3D | null>(null);
  if (proxyRef.current === null) proxyRef.current = new THREE.Object3D();
  const cLocalRef = useRef(new THREE.Vector3()); // 선택 오브젝트의 로컬 형상 중심
  const floorMinYRef = useRef(0);

  const isCharPreview = selectedId === CHARACTER_PREVIEW_ID;
  const selectedObject = isCharPreview ? null : objects.find((o) => o.id === selectedId);
  const target = selectedId ? refsMap.current.get(selectedId) : undefined;

  const valid = !!selectedId && (isCharPreview || (!!selectedObject && !selectedObject.locked && selectedObject.visible));
  const effectiveMode = isCharPreview ? 'translate' : transformMode;
  const skipYClamp = !isCharPreview && (selectedObject?.parentId != null);

  // 선택 오브젝트의 로컬 형상 중심(cLocal) 갱신 — 프리미티브/캐릭터는 원점(0)
  useEffect(() => {
    if (isCharPreview || !selectedId) { cLocalRef.current.set(0, 0, 0); return; }
    const c = localCenter(objects, assets, selectedId);
    cLocalRef.current.copy(c ?? _p.set(0, 0, 0));
  }, [selectedId, isCharPreview, objects, assets]);

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
    if (effectiveMode === 'translate' && !skipYClamp && !isCharPreview) {
      _lp.y = Math.max(floorMinYRef.current, _lp.y); // bbox 밑면 바닥 클램프(루트 기준)
    }
    target.position.copy(_lp);
    target.quaternion.copy(_lq);
    target.scale.copy(_ls);
  };

  return (
    <>
      <primitive object={proxyRef.current} />
      <TransformControls
        object={proxyRef.current}
        mode={effectiveMode}
        space={transformSpace}
        translationSnap={snapEnabled ? snapTranslate : null}
        rotationSnap={shiftSnap ? 15 * DEG2RAD : (snapEnabled ? snapRotate * DEG2RAD : null)}
        scaleSnap={snapEnabled ? 0.1 : null}
        onMouseDown={() => {
          gizmoDraggingRef.current = true;
          if (orbitRef.current) orbitRef.current.enabled = false;
          if (effectiveMode === 'translate' && !skipYClamp && !isCharPreview) {
            const st = useSceneStore.getState();
            const o = st.objects.find((x) => x.id === selectedId);
            const b = worldBBox(st.objects, st.assets, selectedId!);
            floorMinYRef.current = o && b ? o.position.y - b.min.y : 0;
          }
        }}
        onChange={() => { if (gizmoDraggingRef.current) applyProxyToTarget(); }}
        onMouseUp={() => {
          gizmoDraggingRef.current = false;
          if (orbitRef.current) orbitRef.current.enabled = true;
          const pos = target.position, rot = target.rotation, scl = target.scale;
          if (isCharPreview) {
            updateEnvironment({ playerStartPosition: { x: pos.x, y: Math.max(0, pos.y), z: pos.z } });
          } else {
            updateObject(selectedId!, {
              position: { x: pos.x, y: pos.y, z: pos.z },
              rotation: { x: rot.x * RAD2DEG, y: rot.y * RAD2DEG, z: rot.z * RAD2DEG },
              scale: { x: scl.x, y: scl.y, z: scl.z },
            });
          }
          pushHistory();
        }}
      />
    </>
  );
}

export function GizmoController({ orbitRef, gizmoDraggingRef }: Props) {
  const selectedIds = useSceneStore((s) => s.selectedIds);
  return selectedIds.length > 1
    ? <MultiGizmo orbitRef={orbitRef} gizmoDraggingRef={gizmoDraggingRef} />
    : <SingleGizmo orbitRef={orbitRef} gizmoDraggingRef={gizmoDraggingRef} />;
}
