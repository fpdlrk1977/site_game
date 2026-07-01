'use client';

import { useRef } from 'react';
import { Physics, RigidBody, CuboidCollider } from '@react-three/rapier';
import type { RapierRigidBody } from '@react-three/rapier';
import type { ProjectSceneSchema, ObjectNodeSchema, EventSchema } from '@/types/scene';
import { ViewerObject } from './ViewerObject';
import { PhysicsObject } from './PhysicsObject';
import { PlayModeController } from './PlayModeController';

const DEG2RAD = Math.PI / 180;

// physics.enabled가 꺼진 오브젝트도 플레이 모드에서 고정 콜라이더를 부여
function AutoCollider({ object, assets, onEvent, allObjects }: {
  object: ObjectNodeSchema;
  assets: Parameters<typeof ViewerObject>[0]['assets'];
  onEvent: (obj: ObjectNodeSchema, trigger: EventSchema['trigger']) => void;
  allObjects: ObjectNodeSchema[];
}) {
  const colliders = object.primitiveShape === 'box' ? 'cuboid'
    : object.primitiveShape === 'sphere' ? 'ball'
    : 'hull'; // glb, cylinder, plane 등 → convex hull

  return (
    <RigidBody
      type="fixed"
      colliders={colliders}
      position={[object.position.x, object.position.y, object.position.z]}
      rotation={[object.rotation.x * DEG2RAD, object.rotation.y * DEG2RAD, object.rotation.z * DEG2RAD]}
    >
      <ViewerObject object={object} assets={assets} onEvent={onEvent} allObjects={allObjects} noTransform />
    </RigidBody>
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
  const autoObjects = rootObjects.filter((o) => !o.physics.enabled);
  const physicsObjects = rootObjects.filter((o) => o.physics.enabled);

  const characterAsset = scene.environment.playerCharacterId
    ? assets.find((a) => a.id === scene.environment.playerCharacterId)
    : undefined;

  return (
    <Physics gravity={[0, -20, 0]} timeStep="vary">
      {/* 바닥 */}
      <RigidBody type="fixed" name="floor">
        <CuboidCollider args={[100, 0.1, 100]} position={[0, -0.1, 0]} />
      </RigidBody>

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
        characterUrl={characterAsset?.dracoUrl}
        characterScale={scene.environment.playerCharacterScale ?? 1}
        mobileInputRef={mobileInputRef}
      />
    </Physics>
  );
}
