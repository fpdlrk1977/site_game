'use client';

import { useRef, useState } from 'react';
import type { ObjectNodeSchema } from '@/types/scene';

const DEG2RAD = Math.PI / 180;

interface Props {
  object: ObjectNodeSchema;
  onEvent: (obj: ObjectNodeSchema) => void;
}

export function ViewerObject({ object, onEvent }: Props) {
  const [hovered, setHovered] = useState(false);
  const hasClick = object.events.some((e) => e.trigger === 'click');
  const hasHover = object.events.some((e) => e.trigger === 'hover_enter');
  const isInteractive = hasClick || hasHover;

  if (!object.visible) return null;

  const pos: [number, number, number] = [object.position.x, object.position.y, object.position.z];
  const rot: [number, number, number] = [
    object.rotation.x * DEG2RAD,
    object.rotation.y * DEG2RAD,
    object.rotation.z * DEG2RAD,
  ];
  const scl: [number, number, number] = [object.scale.x, object.scale.y, object.scale.z];

  const color = object.material?.color ?? '#a78bfa';
  const roughness = object.material?.roughness ?? 0.5;
  const metalness = object.material?.metalness ?? 0.1;

  return (
    <mesh
      position={pos}
      rotation={rot}
      scale={scl}
      castShadow
      receiveShadow
      onPointerOver={(e) => {
        if (!isInteractive) return;
        e.stopPropagation();
        setHovered(true);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        if (!isInteractive) return;
        setHovered(false);
        document.body.style.cursor = 'auto';
      }}
      onClick={(e) => {
        if (!hasClick) return;
        e.stopPropagation();
        onEvent(object);
      }}
    >
      {object.primitiveShape === 'box' && <boxGeometry args={[1, 1, 1]} />}
      {object.primitiveShape === 'sphere' && <sphereGeometry args={[0.5, 32, 32]} />}
      {object.primitiveShape === 'cylinder' && <cylinderGeometry args={[0.5, 0.5, 1, 32]} />}
      {object.primitiveShape === 'plane' && <planeGeometry args={[1, 1]} />}
      <meshStandardMaterial
        color={color}
        roughness={roughness}
        metalness={metalness}
        emissive={hovered ? color : '#000000'}
        emissiveIntensity={hovered ? 0.3 : 0}
      />
    </mesh>
  );
}
