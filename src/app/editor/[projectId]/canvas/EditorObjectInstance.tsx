'use client';

import { useRef, useEffect, useLayoutEffect, useState, Suspense } from 'react';
import * as THREE from 'three';
import { Text3D, Center } from '@react-three/drei';
import { useShallow } from 'zustand/react/shallow';
import { useSceneStore } from '@/store/sceneStore';
import { useObjectRefs } from './ObjectRefsContext';
import { GlbObject } from './GlbObject';
import { ParticleEmitter } from '@/components/three/ParticleEmitter';
import { pointerDownOnObjectRef } from './boxSelectState';
import type { ObjectNodeSchema, LightType } from '@/types/scene';

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

const LIGHT_ICON_COLOR: Record<LightType, string> = {
  point: '#fbbf24',
  spot: '#f97316',
  directional: '#60a5fa',
};

function LightObjectInstance({ object }: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const refsMap = useObjectRefs();
  const selectObject = useSceneStore((s) => s.selectObject);
  const toggleSelectObject = useSceneStore((s) => s.toggleSelectObject);
  const selectedId = useSceneStore((s) => s.selectedId);
  const selectedIds = useSceneStore((s) => s.selectedIds);
  const isSelected = selectedIds.length > 0 ? selectedIds.includes(object.id) : selectedId === object.id;
  const lc = object.light!;
  const iconColor = LIGHT_ICON_COLOR[lc.type];

  useEffect(() => {
    if (groupRef.current) refsMap.current.set(object.id, groupRef.current);
    return () => { refsMap.current.delete(object.id); };
  }, [object.id, refsMap]);

  useLayoutEffect(() => {
    const g = groupRef.current;
    if (!g) return;
    g.position.set(object.position.x, object.position.y, object.position.z);
    g.rotation.set(object.rotation.x * DEG2RAD, object.rotation.y * DEG2RAD, object.rotation.z * DEG2RAD);
    g.scale.set(1, 1, 1);
  }, [object.position.x, object.position.y, object.position.z,
    object.rotation.x, object.rotation.y, object.rotation.z]);

  if (!object.visible) return null;

  const handleClick = (shiftKey: boolean) => {
    if (object.locked) return;
    const targetId = findRootAncestorId(object);
    if (shiftKey) toggleSelectObject(targetId);
    else selectObject(targetId);
  };

  return (
    <group ref={groupRef} onPointerDown={markObjectHit}>
      {/* 실제 라이트 — 에디터에서도 조명 효과 미리보기 */}
      {lc.type === 'point' && (
        <pointLight
          color={lc.color} intensity={lc.intensity}
          distance={lc.distance ?? 20} decay={lc.decay ?? 2}
          castShadow={lc.castShadow}
        />
      )}
      {lc.type === 'spot' && (
        <spotLight
          color={lc.color} intensity={lc.intensity}
          distance={lc.distance ?? 20} decay={lc.decay ?? 2}
          angle={lc.angle ?? Math.PI / 6} penumbra={lc.penumbra ?? 0.1}
          castShadow={lc.castShadow}
        />
      )}
      {lc.type === 'directional' && (
        <directionalLight color={lc.color} intensity={lc.intensity} castShadow={lc.castShadow} />
      )}

      {/* 아이콘 — 클릭 가능한 시각 표시자 */}
      <mesh
        onClick={(e) => { e.stopPropagation(); handleClick(e.nativeEvent.shiftKey); }}
      >
        <octahedronGeometry args={[0.18, 0]} />
        <meshBasicMaterial color={iconColor} />
      </mesh>
      {/* 외곽 glow ring */}
      <mesh>
        <sphereGeometry args={[0.28, 8, 8]} />
        <meshBasicMaterial color={iconColor} transparent opacity={0.12} depthWrite={false} />
      </mesh>
      {/* spot: 방향 콘 와이어프레임 */}
      {lc.type === 'spot' && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[Math.tan(lc.angle ?? Math.PI / 6) * 3, 3, 12, 1, true]} />
          <meshBasicMaterial color={iconColor} wireframe transparent opacity={0.3} />
        </mesh>
      )}
      {/* 선택 하이라이트 */}
      {isSelected && (
        <mesh>
          <sphereGeometry args={[0.4, 8, 8]} />
          <meshBasicMaterial color="#7c3aed" wireframe />
        </mesh>
      )}
    </group>
  );
}

// 중첩 그룹 클릭 시 최상위 조상 그룹 ID를 반환
function findRootAncestorId(object: ObjectNodeSchema): string {
  if (!object.parentId) return object.id;
  const allObjects = useSceneStore.getState().objects;
  let targetId = object.id;
  let parentId: string | null = object.parentId;
  while (parentId) {
    targetId = parentId;
    const parent = allObjects.find((o) => o.id === parentId);
    parentId = parent?.parentId ?? null;
  }
  return targetId;
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

  // useLayoutEffect: 브라우저 페인트 전(R3F 렌더 전) 동기 실행
  // useEffect는 페인트 후 실행되므로 그룹 신규 마운트 시 첫 프레임에 (0,0,0)으로 렌더됨 → 바닥 통과 flash 발생
  useLayoutEffect(() => {
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
    // 중첩 그룹인 경우 최상위 조상 그룹을 선택
    const targetId = findRootAncestorId(object);
    if (shiftKey) toggleSelectObject(targetId);
    else selectObject(targetId);
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

  useLayoutEffect(() => {
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
  if (object.light) return <LightObjectInstance object={object} />;

  if (!object.visible) return null;

  const assetRef = object.assetId ? assets.find((a) => a.id === object.assetId) : null;
  const color = object.material?.color ?? '#a78bfa';
  const roughness = object.material?.roughness ?? 0.5;
  const metalness = object.material?.metalness ?? 0.1;
  const emissive = object.material?.emissive ?? '#000000';
  const handleClick = (shiftKey: boolean) => {
    if (object.locked) return;
    // 그룹 내부 오브젝트면 최상위 조상 그룹을 선택
    const targetId = findRootAncestorId(object);
    if (shiftKey) toggleSelectObject(targetId);
    else selectObject(targetId);
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
            colliderGuide={object.physics.enabled ? (object.physics.isSensor ? 'sensor' : 'solid') : undefined}
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
      {/* 콜라이더 시각화 — 에디터 전용 (GLB는 GlbObject가 실제 바운딩박스 기준으로 그림) */}
      {!assetRef && <ColliderOverlay object={object} />}
    </group>
  );
}
