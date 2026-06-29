'use client';

import { useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { ObjectNodeSchema } from '@/types/scene';

const DEG2RAD = Math.PI / 180;

const GEOMETRIES: Record<string, () => THREE.BufferGeometry> = {
  box: () => new THREE.BoxGeometry(1, 1, 1),
  sphere: () => new THREE.SphereGeometry(0.5, 32, 32),
  cylinder: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 32),
  plane: () => new THREE.PlaneGeometry(1, 1),
};

function InstancedGroup({
  shape, color, roughness, metalness, emissive, objects,
}: {
  shape: string;
  color: string;
  roughness: number;
  metalness: number;
  emissive: string;
  objects: ObjectNodeSchema[];
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  const geometry = useMemo(() => (GEOMETRIES[shape] ?? GEOMETRIES.box)(), [shape]);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    objects.forEach((obj, i) => {
      dummy.position.set(obj.position.x, obj.position.y, obj.position.z);
      dummy.rotation.set(
        obj.rotation.x * DEG2RAD,
        obj.rotation.y * DEG2RAD,
        obj.rotation.z * DEG2RAD,
      );
      dummy.scale.set(obj.scale.x, obj.scale.y, obj.scale.z);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [objects]);

  return (
    <instancedMesh ref={meshRef} args={[geometry, undefined, objects.length]} castShadow receiveShadow>
      <meshStandardMaterial
        color={color}
        roughness={roughness}
        metalness={metalness}
        emissive={emissive}
        emissiveIntensity={emissive !== '#000000' ? 1 : 0}
      />
    </instancedMesh>
  );
}

interface Props {
  objects: ObjectNodeSchema[];
}

function makeKey(obj: ObjectNodeSchema): string {
  const color = obj.material?.color ?? '#a78bfa';
  const roughness = obj.material?.roughness ?? 0.5;
  const metalness = obj.material?.metalness ?? 0.1;
  const emissive = obj.material?.emissive ?? '#000000';
  return `${obj.primitiveShape}|${color}|${roughness}|${metalness}|${emissive}`;
}

/** Returns the set of object IDs that are batched into InstancedMesh (3+ identical static primitives). */
export function getInstancedIds(objects: ObjectNodeSchema[]): Set<string> {
  const map = new Map<string, ObjectNodeSchema[]>();
  for (const obj of objects) {
    if (!obj.visible || obj.content || obj.assetId || !obj.primitiveShape) continue;
    if (obj.events.length > 0) continue;
    if (obj.particle) continue;
    const key = makeKey(obj);
    const list = map.get(key) ?? [];
    list.push(obj);
    map.set(key, list);
  }
  const ids = new Set<string>();
  map.forEach((list) => {
    if (list.length >= 3) list.forEach((o) => ids.add(o.id));
  });
  return ids;
}

export function InstancedPrimitives({ objects }: Props) {
  const groups = useMemo(() => {
    const map = new Map<string, ObjectNodeSchema[]>();
    for (const obj of objects) {
      if (!obj.visible || obj.content || obj.assetId || !obj.primitiveShape) continue;
      if (obj.events.length > 0) continue;
      if (obj.particle) continue;
      const key = makeKey(obj);
      const list = map.get(key) ?? [];
      list.push(obj);
      map.set(key, list);
    }
    return map;
  }, [objects]);

  return (
    <>
      {Array.from(groups.entries()).map(([key, objs]) => {
        if (objs.length < 3) return null;
        const parts = key.split('|');
        const [shape, color, roughnessStr, metalnessStr, emissive] = parts;
        return (
          <InstancedGroup
            key={key}
            shape={shape}
            color={color}
            roughness={parseFloat(roughnessStr)}
            metalness={parseFloat(metalnessStr)}
            emissive={emissive ?? '#000000'}
            objects={objs}
          />
        );
      })}
    </>
  );
}
