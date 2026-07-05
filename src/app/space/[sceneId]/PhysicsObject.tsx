'use client';

import { useState } from 'react';
import { RigidBody } from '@react-three/rapier';
import { ActiveCollisionTypes } from '@dimforge/rapier3d-compat';
import type { ObjectNodeSchema, AssetRefSchema, EventSchema } from '@/types/scene';
import { ViewerObject, type ClipRequest } from './ViewerObject';

// Rapier 기본값(DEFAULT)은 dynamic 바디가 포함된 쌍만 충돌/교차를 계산한다.
// 플레이어는 kinematic, 센서는 대부분 fixed(mass 0)라 기본값으로는
// 교차 이벤트가 아예 발생하지 않으므로 KINEMATIC_FIXED를 명시적으로 켠다.
const SENSOR_COLLISION_TYPES = ActiveCollisionTypes.DEFAULT | ActiveCollisionTypes.KINEMATIC_FIXED;

interface Props {
  object: ObjectNodeSchema;
  assets: AssetRefSchema[];
  onEvent: (obj: ObjectNodeSchema, trigger: EventSchema['trigger']) => void;
}

const DEG2RAD = Math.PI / 180;

const COLLIDER_MAP: Record<string, 'hull' | 'trimesh' | 'cuboid' | 'ball'> = {
  hull: 'hull',
  trimesh: 'trimesh',
  box: 'cuboid',
  sphere: 'ball',
  capsule: 'hull',
};

export function PhysicsObject({ object, assets, onEvent }: Props) {
  const [activeClip, setActiveClip] = useState<ClipRequest | null>(null);

  const colliders = COLLIDER_MAP[
    object.primitiveShape === 'box' ? 'box'
    : object.primitiveShape === 'sphere' ? 'sphere'
    : object.physics.colliderType
  ] ?? 'hull';

  const pos: [number, number, number] = [object.position.x, object.position.y, object.position.z];
  const rot: [number, number, number] = [
    object.rotation.x * DEG2RAD,
    object.rotation.y * DEG2RAD,
    object.rotation.z * DEG2RAD,
  ];

  const handleAreaEnter = () => {
    onEvent(object, 'area_enter');
    const clip = object.events.find((e) => e.trigger === 'area_enter' && e.action === 'play_animation' && e.value);
    // 타임스탬프를 포함해 같은 클립이라도 재진입 시 다시 재생되게 한다
    if (clip) setActiveClip({ name: clip.value, t: Date.now() });
  };


  return (
    <RigidBody
      type={object.physics.mass > 0 ? 'dynamic' : 'fixed'}
      position={pos}
      rotation={rot}
      colliders={colliders}
      friction={object.physics.friction}
      restitution={object.physics.restitution}
      sensor={object.physics.isSensor}
      activeCollisionTypes={object.physics.isSensor ? SENSOR_COLLISION_TYPES : undefined}
      onIntersectionEnter={object.physics.isSensor ? handleAreaEnter : undefined}
      userData={{ objectId: object.id }}
    >
      <ViewerObject object={object} assets={assets} onEvent={onEvent} noTransform activeClip={activeClip} />
    </RigidBody>
  );
}
