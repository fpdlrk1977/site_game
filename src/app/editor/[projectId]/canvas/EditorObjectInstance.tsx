'use client';

import { useRef, useEffect, useState, Suspense } from 'react';
import * as THREE from 'three';
import { Text3D, Center } from '@react-three/drei';
import { useShallow } from 'zustand/react/shallow';
import { useSceneStore } from '@/store/sceneStore';
import { useObjectRefs } from './ObjectRefsContext';
import { GlbObject } from './GlbObject';
import { ParticleEmitter } from '@/components/three/ParticleEmitter';
import { pointerDownOnObjectRef } from './boxSelectState';
import type { ObjectNodeSchema } from '@/types/scene';

const markObjectHit = (e: { stopPropagation: () => void }) => {
  e.stopPropagation();
  pointerDownOnObjectRef.current = true;
};

const DEG2RAD = Math.PI / 180;

interface Props {
  object: ObjectNodeSchema;
}

function ColliderOverlay({ object }: { object: ObjectNodeSchema }) {
  if (!object.physics.enabled) return null;
  const isSensor = object.physics.isSensor;
  const type = object.physics.colliderType ?? 'box';
  const isSphere = type === 'sphere';

  if (!isSensor) {
    return (
      <mesh>
        {isSphere ? <sphereGeometry args={[0.51, 12, 12]} /> : <boxGeometry args={[1.02, 1.02, 1.02]} />}
        <meshBasicMaterial color="#22c55e" wireframe transparent opacity={0.5} />
      </mesh>
    );
  }

  return (
    <>
      <mesh>
        {isSphere ? <sphereGeometry args={[0.51, 12, 12]} /> : <boxGeometry args={[1.02, 1.02, 1.02]} />}
        <meshBasicMaterial color="#3b82f6" wireframe transparent opacity={0.8} />
      </mesh>
      <mesh>
        {isSphere ? <sphereGeometry args={[0.5, 12, 12]} /> : <boxGeometry args={[1.0, 1.0, 1.0]} />}
        <meshBasicMaterial color="#3b82f6" transparent opacity={0.1} depthWrite={false} />
      </mesh>
    </>
  );
}

function GroupObjectInstance({ object }: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const refsMap = useObjectRefs();
  const selectObject = useSceneStore((s) => s.selectObject);
  const toggleSelectObject = useSceneStore((s) => s.toggleSelectObject);
  const selectedIds = useSceneStore((s) => s.selectedIds);
  const selectedId = useSceneStore((s) => s.selectedId);
  const children = useSceneStore(useShallow((s) => s.objects.filter((o) => o.parentId === object.id)));
  const isSelected = selectedIds.length > 0 ? selectedIds.includes(object.id) : selectedId === object.id;

  useEffect(() => {
    if (groupRef.current) refsMap.current.set(object.id, groupRef.current);
    return () => { refsMap.current.delete(object.id); };
  }, [object.id, refsMap]);

  useEffect(() => {
    const g = groupRef.current;
    if (!g) return;
    g.position.set(object.position.x, object.position.y, object.position.z);
    g.rotation.set(object.rotation.x * DEG2RAD, object.rotation.y * DEG2RAD, object.rotation.z * DEG2RAD);
    g.scale.set(object.scale.x, object.scale.y, object.scale.z);
  }, [object.position.x, object.position.y, object.position.z,
      object.rotation.x, object.rotation.y, object.rotation.z,
      object.scale.x, object.scale.y, object.scale.z]);

  if (!object.visible) return null;

  const handleClick = (shiftKey: boolean) => {
    if (object.locked) return;
    if (shiftKey) toggleSelectObject(object.id);
    else selectObject(object.id);
  };

  return (
    <group
      ref={groupRef}
      onClick={(e) => { e.stopPropagation(); handleClick(e.nativeEvent.shiftKey); }}
      onPointerDown={markObjectHit}
    >
      {/* 선택 표시 — 그룹 중심에 작은 마커 */}
      {isSelected && (
        <mesh>
          <octahedronGeometry args={[0.15, 0]} />
          <meshBasicMaterial color="#7c3aed" wireframe />
        </mesh>
      )}
      {children.map((child) => (
        <EditorObjectInstance key={child.id} object={child} />
      ))}
    </group>
  );
}

export function EditorObjectInstance({ object }: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const refsMap = useObjectRefs();
  const selectObject = useSceneStore((s) => s.selectObject);
  const toggleSelectObject = useSceneStore((s) => s.toggleSelectObject);
  const selectedId = useSceneStore((s) => s.selectedId);
  const selectedIds = useSceneStore((s) => s.selectedIds);
  const assets = useSceneStore((s) => s.assets);
  const wireframeMode = useSceneStore((s) => s.wireframeMode);
  const isSelected = selectedIds.length > 0 ? selectedIds.includes(object.id) : selectedId === object.id;
  const [hovered, setHovered] = useState(false);
  const handlePointerOver = (e: { stopPropagation: () => void }) => { e.stopPropagation(); setHovered(true); };
  const handlePointerOut = (e: { stopPropagation: () => void }) => { e.stopPropagation(); setHovered(false); };

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

  // 그룹 오브젝트는 별도 컴포넌트로 렌더 (hooks 이후에 early return)
  if (object.isGroup) return <GroupObjectInstance object={object} />;

  if (!object.visible) return null;

  const assetRef = object.assetId ? assets.find((a) => a.id === object.assetId) : null;
  const color = object.material?.color ?? '#a78bfa';
  const roughness = object.material?.roughness ?? 0.5;
  const metalness = object.material?.metalness ?? 0.1;
  const emissive = object.material?.emissive ?? '#000000';
  const handleClick = (shiftKey: boolean) => {
    if (object.locked) return;
    if (shiftKey) toggleSelectObject(object.id);
    else selectObject(object.id);
  };

  // 파티클 이미터 렌더링
  if (object.particle) {
    return (
      <group ref={groupRef} onPointerDown={markObjectHit}>
        <ParticleEmitter config={object.particle} />
        {/* 선택 표시 — 빌보드 와이어프레임 구체 */}
        {isSelected && (
          <mesh onClick={(e) => { e.stopPropagation(); handleClick(e.nativeEvent.shiftKey); }}>
            <sphereGeometry args={[0.3, 8, 8]} />
            <meshBasicMaterial color="#7c3aed" wireframe transparent opacity={0.6} />
          </mesh>
        )}
        {!isSelected && (
          <mesh onClick={(e) => { e.stopPropagation(); handleClick(e.nativeEvent.shiftKey); }}>
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
      <group
        ref={groupRef}
        onClick={(e) => { e.stopPropagation(); handleClick(e.nativeEvent.shiftKey); }}
        onPointerDown={markObjectHit}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
      >
        {object.content.type === 'text' ? (
          <Suspense fallback={null}>
            <Center>
              <Text3D
                font="/fonts/helvetiker_regular.typeface.json"
                size={object.content.fontSize ?? 0.5}
                height={object.content.depth ?? 0.1}
                curveSegments={12}
                bevelEnabled
                bevelThickness={0.01}
                bevelSize={0.008}
                bevelSegments={4}
              >
                {object.content.text ?? ''}
                <meshStandardMaterial
                  color={color}
                  roughness={roughness}
                  metalness={metalness}
                  emissive={isSelected ? '#4338ca' : hovered ? '#4338ca' : emissive}
                  emissiveIntensity={isSelected ? 0.4 : hovered ? 0.2 : (emissive !== '#000000' ? 1 : 0)}
                  wireframe={wireframeMode}
                />
              </Text3D>
            </Center>
          </Suspense>
        ) : (
          <mesh>
            <planeGeometry args={[1, 1]} />
            <meshBasicMaterial color={isSelected ? '#7c3aed' : hovered ? '#4338ca' : '#334155'} />
          </mesh>
        )}
        {(isSelected || hovered) && (
          <mesh>
            <planeGeometry args={[1.05, 1.05]} />
            <meshBasicMaterial color={isSelected ? '#7c3aed' : '#a78bfa'} wireframe />
          </mesh>
        )}
        <ColliderOverlay object={object} />
      </group>
    );
  }

  return (
    <group ref={groupRef} onPointerDown={markObjectHit}>
      {assetRef ? (
        <Suspense fallback={
          <mesh castShadow receiveShadow onClick={(e) => { e.stopPropagation(); handleClick(e.nativeEvent.shiftKey); }}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color="#52525b" wireframe />
          </mesh>
        }>
          <GlbObject
            url={assetRef.dracoUrl}
            selected={isSelected}
            hovered={hovered}
            onClick={(shiftKey) => handleClick(shiftKey)}
            onHoverChange={setHovered}
            wireframe={wireframeMode}
          />
        </Suspense>
      ) : (
        <mesh
          onClick={(e) => { e.stopPropagation(); handleClick(e.nativeEvent.shiftKey); }}
          onPointerOver={handlePointerOver}
          onPointerOut={handlePointerOut}
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
            emissive={isSelected ? '#4338ca' : hovered ? '#4338ca' : emissive}
            emissiveIntensity={isSelected ? 0.4 : hovered ? 0.2 : (emissive !== '#000000' ? 1 : 0)}
          />
        </mesh>
      )}
      {!assetRef && (isSelected || hovered) && (
        <mesh>
          <boxGeometry args={[1.05, 1.05, 1.05]} />
          <meshBasicMaterial color={isSelected ? '#7c3aed' : '#a78bfa'} wireframe />
        </mesh>
      )}
      {/* 콜라이더 시각화 — 에디터 전용 */}
      <ColliderOverlay object={object} />
    </group>
  );
}
