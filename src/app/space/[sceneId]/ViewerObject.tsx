'use client';

import { useState, Suspense, useRef, useEffect as useEffectReact } from 'react';
import { useGLTF, Text } from '@react-three/drei';
import * as THREE from 'three';
import { useMemo, useEffect } from 'react';
import { useLoader } from '@react-three/fiber';
import type { ObjectNodeSchema, AssetRefSchema, EventSchema } from '@/types/scene';

const DEG2RAD = Math.PI / 180;

function ImagePlane({ position, rotation, scale, url, onClick, onPointerOver, onPointerOut }: {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  url: string;
  onClick: () => void;
  onPointerOver: () => void;
  onPointerOut: () => void;
}) {
  const texture = useLoader(THREE.TextureLoader, url);
  return (
    <mesh position={position} rotation={rotation} scale={scale}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onPointerOver={(e) => { e.stopPropagation(); onPointerOver(); }}
      onPointerOut={onPointerOut}
    >
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial map={texture} transparent side={THREE.DoubleSide} />
    </mesh>
  );
}

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
  onEvent: (obj: ObjectNodeSchema, trigger: EventSchema['trigger']) => void;
  allObjects?: ObjectNodeSchema[];
  /** RigidBody 내부에서 사용할 때 — position/rotation은 부모 RigidBody가 담당, scale만 적용 */
  noTransform?: boolean;
}

export function ViewerObject({ object, assets, onEvent, allObjects = [], noTransform = false }: Props) {
  const [hovered, setHovered] = useState(false);
  const hasClick = object.events.some((e) => e.trigger === 'click');
  const hasHover = object.events.some((e) => e.trigger === 'hover_enter');
  const isInteractive = hasClick || hasHover;

  if (!object.visible) return null;

  // 그룹 오브젝트: 자식들을 Three.js group 안에 렌더
  if (object.isGroup) {
    const children = allObjects.filter((o) => o.parentId === object.id && o.visible);
    return (
      <group
        position={[object.position.x, object.position.y, object.position.z]}
        rotation={[object.rotation.x * DEG2RAD, object.rotation.y * DEG2RAD, object.rotation.z * DEG2RAD]}
        scale={[object.scale.x, object.scale.y, object.scale.z]}
      >
        {children.map((child) => (
          <ViewerObject key={child.id} object={child} assets={assets} onEvent={onEvent} allObjects={allObjects} />
        ))}
      </group>
    );
  }

  const pos: [number, number, number] = noTransform ? [0, 0, 0] : [object.position.x, object.position.y, object.position.z];
  const rot: [number, number, number] = noTransform ? [0, 0, 0] : [
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
    if (hasHover) onEvent(object, 'hover_enter');
  };
  const handlePointerOut = () => {
    if (!isInteractive) return;
    setHovered(false);
    document.body.style.cursor = 'auto';
  };
  const handleClick = () => {
    if (!hasClick) return;
    onEvent(object, 'click');
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

  // Content 오브젝트 렌더링
  if (object.content) {
    const { type } = object.content;
    if (type === 'text') {
      return (
        <Text
          position={pos}
          rotation={rot}
          scale={scl}
          color={object.content.color ?? '#ffffff'}
          fontSize={object.content.fontSize ?? 0.5}
          anchorX="center"
          anchorY="middle"
          onClick={(e) => { e.stopPropagation(); handleClick(); }}
          onPointerOver={(e) => { e.stopPropagation(); handlePointerOver(); }}
          onPointerOut={handlePointerOut}
        >
          {object.content.text ?? ''}
        </Text>
      );
    }
    if (type === 'image' && object.content.url) {
      return (
        <Suspense fallback={null}>
          <ImagePlane
            position={pos} rotation={rot} scale={scl}
            url={object.content.url}
            onClick={handleClick}
            onPointerOver={handlePointerOver}
            onPointerOut={handlePointerOut}
          />
        </Suspense>
      );
    }
    // video — 빈 플레인으로 폴백 (뷰어에서 완전 구현은 추후)
    return (
      <mesh position={pos} rotation={rot} scale={scl}
        onClick={(e) => { e.stopPropagation(); handleClick(); }}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color="#1a1a2e" />
      </mesh>
    );
  }

  const color = object.material?.color ?? '#a78bfa';
  const roughness = object.material?.roughness ?? 0.5;
  const metalness = object.material?.metalness ?? 0.1;
  const emissive = object.material?.emissive ?? '#000000';

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
        emissive={hovered ? color : emissive}
        emissiveIntensity={hovered ? 0.3 : (emissive !== '#000000' ? 1 : 0)}
      />
    </mesh>
  );
}
