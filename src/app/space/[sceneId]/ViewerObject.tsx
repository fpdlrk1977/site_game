'use client';

import { useState, Suspense } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useMemo, useEffect } from 'react';
import type { ObjectNodeSchema, AssetRefSchema } from '@/types/scene';

const DEG2RAD = Math.PI / 180;

function GlbViewer({ url, hovered, onClick, onPointerOver, onPointerOut }: {
  url: string;
  hovered: boolean;
  onClick: () => void;
  onPointerOver: () => void;
  onPointerOut: () => void;
}) {
  const { scene } = useGLTF(url);
  const clone = useMemo(() => scene.clone(true), [scene]);

  useEffect(() => {
    clone.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((mat) => {
        const m = mat as THREE.MeshStandardMaterial;
        if (m.emissive !== undefined) {
          m.emissive.set(hovered ? '#ffffff' : '#000000');
          m.emissiveIntensity = hovered ? 0.2 : 0;
        }
      });
    });
  }, [clone, hovered]);

  return (
    <primitive
      object={clone}
      onClick={(e: { stopPropagation: () => void }) => { e.stopPropagation(); onClick(); }}
      onPointerOver={(e: { stopPropagation: () => void }) => { e.stopPropagation(); onPointerOver(); }}
      onPointerOut={() => onPointerOut()}
    />
  );
}

interface Props {
  object: ObjectNodeSchema;
  assets: AssetRefSchema[];
  onEvent: (obj: ObjectNodeSchema) => void;
}

export function ViewerObject({ object, assets, onEvent }: Props) {
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

  const assetRef = object.assetId ? assets.find((a) => a.id === object.assetId) : null;

  const handlePointerOver = () => {
    if (!isInteractive) return;
    setHovered(true);
    document.body.style.cursor = 'pointer';
  };
  const handlePointerOut = () => {
    if (!isInteractive) return;
    setHovered(false);
    document.body.style.cursor = 'auto';
  };
  const handleClick = () => {
    if (!hasClick) return;
    onEvent(object);
  };

  if (assetRef) {
    return (
      <group position={pos} rotation={rot} scale={scl}>
        <Suspense fallback={null}>
          <GlbViewer
            url={assetRef.dracoUrl}
            hovered={hovered}
            onClick={handleClick}
            onPointerOver={handlePointerOver}
            onPointerOut={handlePointerOut}
          />
        </Suspense>
      </group>
    );
  }

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
      onPointerOver={(e) => { e.stopPropagation(); handlePointerOver(); }}
      onPointerOut={handlePointerOut}
      onClick={(e) => { e.stopPropagation(); handleClick(); }}
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
