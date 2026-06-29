'use client';

import { useRef } from 'react';
import { Physics, RigidBody, CuboidCollider } from '@react-three/rapier';
import type { RapierRigidBody } from '@react-three/rapier';
import type { ProjectSceneSchema, ObjectNodeSchema, EventSchema } from '@/types/scene';
import { ViewerObject } from './ViewerObject';
import { PhysicsObject } from './PhysicsObject';
import { PlayModeController } from './PlayModeController';

interface Props {
  scene: ProjectSceneSchema;
  azimuthRef: React.MutableRefObject<number>;
  onObjectClick: (obj: ObjectNodeSchema, trigger: EventSchema['trigger']) => void;
}

export function PlayCanvas({ scene, azimuthRef, onObjectClick }: Props) {
  const playerRef = useRef<RapierRigidBody>(null);
  const assets = scene.assets ?? [];

  const staticObjects = scene.objects.filter((o) => !o.physics.enabled);
  const physicsObjects = scene.objects.filter((o) => o.physics.enabled);

  return (
    <>
      {/* 비물리 오브젝트 — Physics 밖, rapier 간섭 없음 */}
      {staticObjects.map((obj) => (
        <ViewerObject key={obj.id} object={obj} assets={assets} onEvent={onObjectClick} />
      ))}

      <Physics gravity={[0, -20, 0]} timeStep="vary">
        {/* 바닥: 명시적 CuboidCollider (lazy load 시 matrixWorld 미계산 문제 방지) */}
        <RigidBody type="fixed" name="floor">
          <CuboidCollider args={[100, 0.1, 100]} position={[0, -0.1, 0]} />
        </RigidBody>

        {physicsObjects.map((obj) => (
          <PhysicsObject key={obj.id} object={obj} assets={assets} onEvent={onObjectClick} />
        ))}

        <PlayModeController azimuthRef={azimuthRef} playerRef={playerRef} />
      </Physics>
    </>
  );
}
