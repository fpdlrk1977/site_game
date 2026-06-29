'use client';

import { useRef } from 'react';
import { TransformControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useSceneStore } from '@/store/sceneStore';
import { useObjectRefs } from './ObjectRefsContext';

const RAD2DEG = 180 / Math.PI;

interface Props {
  orbitRef: React.RefObject<OrbitControlsImpl | null>;
}

export function GizmoController({ orbitRef }: Props) {
  const { selectedId, transformMode, transformSpace, snapEnabled, snapTranslate, snapRotate,
    objects, updateObject, pushHistory } = useSceneStore();
  const refsMap = useObjectRefs();
  const isDragging = useRef(false);

  const selectedObject = objects.find((o) => o.id === selectedId);
  if (!selectedId || !selectedObject || selectedObject.locked || !selectedObject.visible) return null;

  const target = refsMap.current.get(selectedId);
  if (!target) return null;

  const DEG2RAD = Math.PI / 180;

  return (
    <TransformControls
      object={target}
      mode={transformMode}
      space={transformSpace}
      translationSnap={snapEnabled ? snapTranslate : null}
      rotationSnap={snapEnabled ? snapRotate * DEG2RAD : null}
      scaleSnap={snapEnabled ? 0.1 : null}
      onMouseDown={() => {
        isDragging.current = true;
        if (orbitRef.current) orbitRef.current.enabled = false;
      }}
      onMouseUp={() => {
        isDragging.current = false;
        if (orbitRef.current) orbitRef.current.enabled = true;
        const pos = target.position;
        const rot = target.rotation;
        const scl = target.scale;
        updateObject(selectedId, {
          position: { x: pos.x, y: pos.y, z: pos.z },
          rotation: { x: rot.x * RAD2DEG, y: rot.y * RAD2DEG, z: rot.z * RAD2DEG },
          scale: { x: scl.x, y: scl.y, z: scl.z },
        });
        pushHistory();
      }}
    />
  );
}
