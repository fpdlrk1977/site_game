'use client';

import { useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { ObjectNodeSchema } from '@/types/scene';
import { createPrimitiveGeometry } from '@/lib/primitiveGeometry';

const DEG2RAD = Math.PI / 180;

function InstancedGroup({
  sample, color, roughness, metalness, emissive, objects,
}: {
  sample: ObjectNodeSchema; // 그룹 대표(형태·geom 동일) — 지오메트리 생성용
  color: string;
  roughness: number;
  metalness: number;
  emissive: string;
  objects: ObjectNodeSchema[];
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  const geometry = useMemo(
    () => createPrimitiveGeometry(sample.primitiveShape, sample.geom),
    [sample.primitiveShape, sample.geom?.cornerRadius, sample.geom?.cornerSegments, sample.geom?.topScale, (sample.geom?.sections ?? []).join(','), sample.geom?.extrudeDepth, sample.geom?.profile?.length],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);

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
  // geom 파라미터(둥근 박스·각뿔대·로프트)까지 키에 포함 — 다른 파라미터는 다른 인스턴스 그룹으로 분리.
  const g = `${obj.geom?.cornerRadius ?? 0}:${obj.geom?.cornerSegments ?? 4}:${obj.geom?.topScale ?? 0.5}:${obj.geom?.tubeRatio ?? 0.28}:${obj.geom?.subdivisions ?? 0}`;
  return `${obj.primitiveShape}|${color}|${roughness}|${metalness}|${emissive}|${g}`;
}

/** Returns the set of object IDs that are batched into InstancedMesh (3+ identical static primitives). */
export function getInstancedIds(objects: ObjectNodeSchema[]): Set<string> {
  const map = new Map<string, ObjectNodeSchema[]>();
  for (const obj of objects) {
    if (!obj.visible || obj.content || obj.assetId || !obj.primitiveShape) continue;
    if (obj.primitiveShape === 'voxel') continue; // 복셀은 정점색·고유 지오메트리 → 인스턴싱 제외
    if (obj.primitiveShape === 'box' && (obj.geom?.cornerRadius ?? 0) > 0) continue; // 둥근 박스는 scale별 고유 지오메트리 → 제외
    if (obj.material?.textureUrl) continue; // 텍스처는 오브젝트별 map이라 인스턴싱 제외(단일 재질 배칭 불가)
    if (obj.events.length > 0) continue;
    if (obj.particle) continue;
    if (obj.parentId !== null) continue; // 그룹 자식은 상대 좌표 — instancing 제외
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
    if (obj.primitiveShape === 'voxel') continue; // 복셀은 정점색·고유 지오메트리 → 인스턴싱 제외
    if (obj.primitiveShape === 'box' && (obj.geom?.cornerRadius ?? 0) > 0) continue; // 둥근 박스는 scale별 고유 지오메트리 → 제외
      if (obj.material?.textureUrl) continue; // 텍스처는 인스턴싱 제외(getInstancedIds와 동일 규칙)
      if (obj.events.length > 0) continue;
      if (obj.particle) continue;
      if (obj.parentId !== null) continue;
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
        const [, color, roughnessStr, metalnessStr, emissive] = parts;
        return (
          <InstancedGroup
            key={key}
            sample={objs[0]}
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
