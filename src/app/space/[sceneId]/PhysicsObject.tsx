'use client';

import { RigidBody } from '@react-three/rapier';
import type { ObjectNodeSchema, AssetRefSchema, EventSchema } from '@/types/scene';
import { ViewerObject } from './ViewerObject';

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

  return (
    <RigidBody
      type={object.physics.mass > 0 ? 'dynamic' : 'fixed'}
      position={pos}
      rotation={rot}
      colliders={colliders}
      friction={object.physics.friction}
      restitution={object.physics.restitution}
      sensor={object.physics.isSensor}
      onIntersectionEnter={object.physics.isSensor ? () => onEvent(object, 'area_enter') : undefined}
    >
      <ViewerObject object={object} assets={assets} onEvent={onEvent} noTransform />
    </RigidBody>
  );
}
