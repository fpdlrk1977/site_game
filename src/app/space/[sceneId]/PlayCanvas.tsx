'use client';

import { useRef } from 'react';
import { Physics, RigidBody, CuboidCollider } from '@react-three/rapier';
import type { RapierRigidBody } from '@react-three/rapier';
import type { ProjectSceneSchema, ObjectNodeSchema, EventSchema } from '@/types/scene';
import { ViewerObject } from './ViewerObject';
import { PhysicsObject } from './PhysicsObject';
import { PlayModeController } from './PlayModeController';

const DEG2RAD = Math.PI / 180;

type ColliderAssets = Parameters<typeof ViewerObject>[0]['assets'];
type ColliderOnEvent = (obj: ObjectNodeSchema, trigger: EventSchema['trigger']) => void;

function getColliderType(object: ObjectNodeSchema) {
  // GLB(산·바위 등 오목한 지형 포함)는 trimesh로 실제 메쉬 형태 그대로 충돌 처리.
  // hull(볼록 껍질)은 오목한 형태를 매끈하게 뭉개버려 절벽/급경사가 실제보다 완만한
  // 경사로 처리되는 원인이 되므로 사용하지 않는다 (fixed 바디는 trimesh 사용 가능).
  return object.primitiveShape === 'box' ? 'cuboid'
    : object.primitiveShape === 'sphere' ? 'ball'
    : 'trimesh';
}

// physics.enabled가 꺼진 오브젝트도 플레이 모드에서 고정 콜라이더를 부여
function AutoCollider({ object, assets, onEvent, allObjects }: {
  object: ObjectNodeSchema;
  assets: ColliderAssets;
  onEvent: ColliderOnEvent;
  allObjects: ObjectNodeSchema[];
}) {
  return (
    <RigidBody
      type="fixed"
      colliders={getColliderType(object)}
      position={[object.position.x, object.position.y, object.position.z]}
      rotation={[object.rotation.x * DEG2RAD, object.rotation.y * DEG2RAD, object.rotation.z * DEG2RAD]}
    >
      <ViewerObject object={object} assets={assets} onEvent={onEvent} allObjects={allObjects} noTransform />
    </RigidBody>
  );
}

// 그룹 오브젝트를 재귀적으로 렌더링하면서 자식 오브젝트 각각에 콜라이더를 부여.
// THREE.js group으로 부모 transform을 적용하고, 그 안의 RigidBody position은 로컬 좌표로
// 해석되어 Rapier가 최종 world position을 올바르게 계산한다.
// 제약: Rapier는 강체에 비균일 스케일을 지원하지 않으므로, 회전된 중첩 그룹에
// 비균일 스케일이 걸리면 콜라이더와 비주얼이 어긋날 수 있다 (균일 스케일은 안전).
function GroupWithCollision({ object, assets, onEvent, allObjects }: {
  object: ObjectNodeSchema;
  assets: ColliderAssets;
  onEvent: ColliderOnEvent;
  allObjects: ObjectNodeSchema[];
}) {
  const children = allObjects.filter((o) => o.parentId === object.id && o.visible);

  return (
    <group
      position={[object.position.x, object.position.y, object.position.z]}
      rotation={[object.rotation.x * DEG2RAD, object.rotation.y * DEG2RAD, object.rotation.z * DEG2RAD]}
      scale={[object.scale.x, object.scale.y, object.scale.z]}
    >
      {children.map((child) => {
        if (child.isGroup) {
          return (
            <GroupWithCollision
              key={child.id}
              object={child}
              assets={assets}
              onEvent={onEvent}
              allObjects={allObjects}
            />
          );
        }
        if (child.physics.enabled) {
          return <PhysicsObject key={child.id} object={child} assets={assets} onEvent={onEvent} />;
        }
        if (child.light) {
          // 라이트는 콜라이더 불필요, 위치만 적용
          return (
            <ViewerObject key={child.id} object={child} assets={assets} onEvent={onEvent} allObjects={allObjects} noTransform />
          );
        }
        // 일반 오브젝트: RigidBody position이 부모 group 기준 로컬 좌표로 처리됨
        return (
          <RigidBody
            key={child.id}
            type="fixed"
            colliders={getColliderType(child)}
            position={[child.position.x, child.position.y, child.position.z]}
            rotation={[child.rotation.x * DEG2RAD, child.rotation.y * DEG2RAD, child.rotation.z * DEG2RAD]}
          >
            <ViewerObject object={child} assets={assets} onEvent={onEvent} allObjects={allObjects} noTransform />
          </RigidBody>
        );
      })}
    </group>
  );
}

interface Props {
  scene: ProjectSceneSchema;
  azimuthRef: React.MutableRefObject<number>;
  onObjectClick: (obj: ObjectNodeSchema, trigger: EventSchema['trigger']) => void;
  mobileInputRef?: React.MutableRefObject<{ fwd: number; strafe: number; jump: boolean }>;
}

export function PlayCanvas({ scene, azimuthRef, onObjectClick, mobileInputRef }: Props) {
  const playerRef = useRef<RapierRigidBody>(null);
  const assets = scene.assets ?? [];

  const allObjects = scene.objects;
  const rootObjects = allObjects.filter((o) => !o.parentId);
  const lightObjects = rootObjects.filter((o) => o.light && o.visible);
  // 그룹은 GroupWithCollision으로 처리: 자식 오브젝트 각각에 콜라이더 적용
  // (그룹에 physics가 켜져 있어도 그룹 자체는 PhysicsObject로 렌더하지 않음 — 이중 렌더 방지)
  const groupObjects = rootObjects.filter((o) => o.isGroup && o.visible);
  const autoObjects = rootObjects.filter((o) => !o.physics.enabled && !o.light && !o.isGroup);
  const physicsObjects = rootObjects.filter((o) => o.physics.enabled && !o.light && !o.isGroup);

  const characterAsset = scene.environment.playerCharacterId
    ? assets.find((a) => a.id === scene.environment.playerCharacterId)
    : undefined;

  return (
    <Physics gravity={[0, -20, 0]} timeStep="vary">
      {/* 씬 라이트 오브젝트 */}
      {lightObjects.map((o) => (
        <group key={o.id} position={[o.position.x, o.position.y, o.position.z]}
          rotation={[o.rotation.x * DEG2RAD, o.rotation.y * DEG2RAD, o.rotation.z * DEG2RAD]}>
          {o.light!.type === 'point' && (
            <pointLight color={o.light!.color} intensity={o.light!.intensity}
              distance={o.light!.distance ?? 20} decay={o.light!.decay ?? 2}
              castShadow={o.light!.castShadow} />
          )}
          {o.light!.type === 'spot' && (
            <spotLight color={o.light!.color} intensity={o.light!.intensity}
              distance={o.light!.distance ?? 20} decay={o.light!.decay ?? 2}
              angle={o.light!.angle ?? Math.PI / 6} penumbra={o.light!.penumbra ?? 0.1}
              castShadow={o.light!.castShadow} />
          )}
          {o.light!.type === 'directional' && (
            <directionalLight color={o.light!.color} intensity={o.light!.intensity}
              castShadow={o.light!.castShadow} />
          )}
        </group>
      ))}

      {/* 바닥 */}
      <RigidBody type="fixed" name="floor">
        <CuboidCollider args={[500, 0.1, 500]} position={[0, -0.1, 0]} />
      </RigidBody>

      {/* 경계 벽 — friction=0 으로 벽에 눌렸을 때 공중에 걸리는 현상 방지 */}
      {(scene.environment.boundary ?? 0) > 0 && (() => {
        const b = scene.environment.boundary!;
        return (
          <>
            <RigidBody type="fixed" friction={0}><CuboidCollider args={[b + 1, 30, 0.5]} position={[0, 15, -(b + 0.5)]} /></RigidBody>
            <RigidBody type="fixed" friction={0}><CuboidCollider args={[b + 1, 30, 0.5]} position={[0, 15,   b + 0.5 ]} /></RigidBody>
            <RigidBody type="fixed" friction={0}><CuboidCollider args={[0.5, 30, b + 1]} position={[  b + 0.5,  15, 0]} /></RigidBody>
            <RigidBody type="fixed" friction={0}><CuboidCollider args={[0.5, 30, b + 1]} position={[-(b + 0.5), 15, 0]} /></RigidBody>
          </>
        );
      })()}

      {/* 그룹 오브젝트 — 자식 각각에 재귀적으로 콜라이더 부여 */}
      {groupObjects.map((obj) => (
        <GroupWithCollision key={obj.id} object={obj} assets={assets} onEvent={onObjectClick} allObjects={allObjects} />
      ))}

      {/* physics 미설정 오브젝트 — 자동 고정 콜라이더 */}
      {autoObjects.map((obj) => (
        <AutoCollider key={obj.id} object={obj} assets={assets} onEvent={onObjectClick} allObjects={allObjects} />
      ))}

      {/* physics 설정 오브젝트 — 기존 설정 그대로 */}
      {physicsObjects.map((obj) => (
        <PhysicsObject key={obj.id} object={obj} assets={assets} onEvent={onObjectClick} />
      ))}

      <PlayModeController
        azimuthRef={azimuthRef}
        playerRef={playerRef}
        spawnPosition={scene.environment.playerStartPosition
          ? [scene.environment.playerStartPosition.x, scene.environment.playerStartPosition.y, scene.environment.playerStartPosition.z]
          : undefined}
        characterUrl={characterAsset?.dracoUrl}
        characterScale={scene.environment.playerCharacterScale ?? 1}
        playerSpeed={scene.environment.playerSpeed}
        playerJumpForce={scene.environment.playerJumpForce}
        mobileInputRef={mobileInputRef}
      />
    </Physics>
  );
}
