'use client';

import { useRef, useEffect, useState } from 'react';
import { TransformControls } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useSceneStore } from '@/store/sceneStore';
import { useObjectRefs } from './ObjectRefsContext';

const RAD2DEG = 180 / Math.PI;
const DEG2RAD = Math.PI / 180;

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
            dragStartPivot.current.copy(pivotEl.position);
            dragStartPositions.current.clear();
            dragStartQuaternions.current.clear();
            dragStartScales.current.clear();
            for (const id of selectedIds) {
              const ref = refsMap.current.get(id);
              if (ref) {
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
              for (const id of selectedIds) {
                const ref = refsMap.current.get(id);
                const start = dragStartPositions.current.get(id);
                if (ref && start) ref.position.set(start.x + dx, Math.max(0, start.y + dy), start.z + dz);
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
            for (const id of selectedIds) {
              const ref = refsMap.current.get(id);
              if (!ref) continue;
              updateObject(id, {
                position: { x: ref.position.x, y: Math.max(0, ref.position.y), z: ref.position.z },
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
    objects, updateObject, pushHistory } = useSceneStore();
  const refsMap = useObjectRefs();

  const selectedObject = objects.find((o) => o.id === selectedId);
  if (!selectedId || !selectedObject || selectedObject.locked || !selectedObject.visible) return null;

  const target = refsMap.current.get(selectedId);
  if (!target) return null;

  return (
    <TransformControls
      object={target}
      mode={transformMode}
      space={transformSpace}
      translationSnap={snapEnabled ? snapTranslate : null}
      rotationSnap={snapEnabled ? snapRotate * DEG2RAD : null}
      scaleSnap={snapEnabled ? 0.1 : null}
      onMouseDown={() => { gizmoDraggingRef.current = true; if (orbitRef.current) orbitRef.current.enabled = false; }}
      onChange={() => {
        if (transformMode === 'translate') {
          target.position.y = Math.max(0, target.position.y);
        }
      }}
      onMouseUp={() => {
        gizmoDraggingRef.current = false;
        if (orbitRef.current) orbitRef.current.enabled = true;
        const pos = target.position;
        const rot = target.rotation;
        const scl = target.scale;
        updateObject(selectedId, {
          position: { x: pos.x, y: Math.max(0, pos.y), z: pos.z },
          rotation: { x: rot.x * RAD2DEG, y: rot.y * RAD2DEG, z: rot.z * RAD2DEG },
          scale: { x: scl.x, y: scl.y, z: scl.z },
        });
        pushHistory();
      }}
    />
  );
}

export function GizmoController({ orbitRef, gizmoDraggingRef }: Props) {
  const selectedIds = useSceneStore((s) => s.selectedIds);
  return selectedIds.length > 1
    ? <MultiGizmo orbitRef={orbitRef} gizmoDraggingRef={gizmoDraggingRef} />
    : <SingleGizmo orbitRef={orbitRef} gizmoDraggingRef={gizmoDraggingRef} />;
}
