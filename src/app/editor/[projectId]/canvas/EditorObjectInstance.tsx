'use client';

import { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useSceneStore } from '@/store/sceneStore';
import { useObjectRefs } from './ObjectRefsContext';
import type { ObjectNodeSchema } from '@/types/scene';

const DEG2RAD = Math.PI / 180;

interface Props {
  object: ObjectNodeSchema;
}

export function EditorObjectInstance({ object }: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const refsMap = useObjectRefs();
  const selectObject = useSceneStore((s) => s.selectObject);
  const selectedId = useSceneStore((s) => s.selectedId);
  const isSelected = selectedId === object.id;

  useEffect(() => {
    if (groupRef.current) refsMap.current.set(object.id, groupRef.current);
    return () => { refsMap.current.delete(object.id); };
  }, [object.id, refsMap]);

  // Sync position from store to Three.js imperatively (so TransformControls won't fight React)
  useEffect(() => {
    const g = groupRef.current;
    if (!g) return;
    g.position.set(object.position.x, object.position.y, object.position.z);
    g.rotation.set(
      object.rotation.x * DEG2RAD,
      object.rotation.y * DEG2RAD,
      object.rotation.z * DEG2RAD,
    );
    g.scale.set(object.scale.x, object.scale.y, object.scale.z);
  }, [
    object.position.x, object.position.y, object.position.z,
    object.rotation.x, object.rotation.y, object.rotation.z,
    object.scale.x, object.scale.y, object.scale.z,
  ]);

  if (!object.visible) return null;

  const color = object.material?.color ?? '#a78bfa';
  const roughness = object.material?.roughness ?? 0.5;
  const metalness = object.material?.metalness ?? 0.1;

  return (
    <group ref={groupRef}>
      <mesh
        onClick={(e) => {
          e.stopPropagation();
          if (!object.locked) selectObject(object.id);
        }}
        castShadow
        receiveShadow
      >
        {object.primitiveShape === 'box' && <boxGeometry args={[1, 1, 1]} />}
        {object.primitiveShape === 'sphere' && <sphereGeometry args={[0.5, 32, 32]} />}
        {object.primitiveShape === 'cylinder' && <cylinderGeometry args={[0.5, 0.5, 1, 32]} />}
        {object.primitiveShape === 'plane' && <planeGeometry args={[1, 1]} />}
        <meshStandardMaterial
          color={color}
          roughness={roughness}
          metalness={metalness}
          emissive={isSelected ? '#4338ca' : '#000000'}
          emissiveIntensity={isSelected ? 0.4 : 0}
        />
      </mesh>
    </group>
  );
}
