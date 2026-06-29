'use client';

import { useRef, useEffect, Suspense } from 'react';
import * as THREE from 'three';
import { Text } from '@react-three/drei';
import { useSceneStore } from '@/store/sceneStore';
import { useObjectRefs } from './ObjectRefsContext';
import { GlbObject } from './GlbObject';
import { ParticleEmitter } from '@/components/three/ParticleEmitter';
import type { ObjectNodeSchema } from '@/types/scene';

const DEG2RAD = Math.PI / 180;

interface Props {
  object: ObjectNodeSchema;
}

function ColliderOverlay({ object }: { object: ObjectNodeSchema }) {
  if (!object.physics.enabled) return null;
  const isSensor = object.physics.isSensor;
  const color = isSensor ? '#3b82f6' : '#22c55e';
  const type = object.physics.colliderType ?? 'box';

  return (
    <mesh>
      {type === 'sphere'
        ? <sphereGeometry args={[0.51, 12, 12]} />
        : <boxGeometry args={[1.02, 1.02, 1.02]} />
      }
      <meshBasicMaterial color={color} wireframe transparent opacity={0.5} />
    </mesh>
  );
}

export function EditorObjectInstance({ object }: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const refsMap = useObjectRefs();
  const selectObject = useSceneStore((s) => s.selectObject);
  const selectedId = useSceneStore((s) => s.selectedId);
  const assets = useSceneStore((s) => s.assets);
  const wireframeMode = useSceneStore((s) => s.wireframeMode);
  const isSelected = selectedId === object.id;

  useEffect(() => {
    if (groupRef.current) refsMap.current.set(object.id, groupRef.current);
    return () => { refsMap.current.delete(object.id); };
  }, [object.id, refsMap]);

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

  const assetRef = object.assetId ? assets.find((a) => a.id === object.assetId) : null;
  const color = object.material?.color ?? '#a78bfa';
  const roughness = object.material?.roughness ?? 0.5;
  const metalness = object.material?.metalness ?? 0.1;
  const emissive = object.material?.emissive ?? '#000000';
  const handleClick = () => { if (!object.locked) selectObject(object.id); };

  // 파티클 이미터 렌더링
  if (object.particle) {
    return (
      <group ref={groupRef}>
        <ParticleEmitter config={object.particle} />
        {/* 선택 표시 — 빌보드 와이어프레임 구체 */}
        {isSelected && (
          <mesh onClick={(e) => { e.stopPropagation(); handleClick(); }}>
            <sphereGeometry args={[0.3, 8, 8]} />
            <meshBasicMaterial color="#7c3aed" wireframe transparent opacity={0.6} />
          </mesh>
        )}
        {!isSelected && (
          <mesh onClick={(e) => { e.stopPropagation(); handleClick(); }}>
            <sphereGeometry args={[0.3, 8, 8]} />
            <meshBasicMaterial transparent opacity={0} />
          </mesh>
        )}
      </group>
    );
  }

  // Content 오브젝트 렌더링
  if (object.content) {
    return (
      <group ref={groupRef} onClick={(e) => { e.stopPropagation(); handleClick(); }}>
        {object.content.type === 'text' ? (
          <Text
            color={object.content.color ?? '#ffffff'}
            fontSize={object.content.fontSize ?? 0.5}
            anchorX="center" anchorY="middle"
          >
            {object.content.text ?? ''}
          </Text>
        ) : (
          <mesh>
            <planeGeometry args={[1, 1]} />
            <meshBasicMaterial color={isSelected ? '#7c3aed' : '#334155'} />
          </mesh>
        )}
        {isSelected && (
          <mesh>
            <planeGeometry args={[1.05, 1.05]} />
            <meshBasicMaterial color="#7c3aed" wireframe />
          </mesh>
        )}
        <ColliderOverlay object={object} />
      </group>
    );
  }

  return (
    <group ref={groupRef}>
      {assetRef ? (
        <Suspense fallback={
          <mesh castShadow receiveShadow onClick={(e) => { e.stopPropagation(); handleClick(); }}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color="#52525b" wireframe />
          </mesh>
        }>
          <GlbObject url={assetRef.dracoUrl} selected={isSelected} onClick={handleClick} wireframe={wireframeMode} />
        </Suspense>
      ) : (
        <mesh
          onClick={(e) => { e.stopPropagation(); handleClick(); }}
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
            wireframe={wireframeMode}
            emissive={isSelected ? '#4338ca' : emissive}
            emissiveIntensity={isSelected ? 0.4 : (emissive !== '#000000' ? 1 : 0)}
          />
        </mesh>
      )}
      {/* 콜라이더 시각화 — 에디터 전용 */}
      <ColliderOverlay object={object} />
    </group>
  );
}
