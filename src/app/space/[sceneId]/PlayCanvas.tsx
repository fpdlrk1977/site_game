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
  // GLB(산·바위 등 오목한 지형 포함)는 trimesh로 실제 메쉬 형태 그대로 충돌 처리.
  // hull(볼록 껍질)은 오목한 형태를 매끈하게 뭉개버려 절벽/급경사가 실제보다 완만한
  // 경사로 처리되는 원인이 되므로 사용하지 않는다 (fixed 바디는 trimesh 사용 가능).
  const colliders = object.primitiveShape === 'box' ? 'cuboid'
    : object.primitiveShape === 'sphere' ? 'ball'
    : 'trimesh';

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
  const lightObjects = rootObjects.filter((o) => o.light && o.visible);
  // 그룹은 AutoCollider에서 제외: AutoCollider는 RigidBody로 감싸는데 ViewerObject(그룹)이
  // 자체 transform도 적용해서 2중으로 적용되는 버그가 생김 → 그룹은 별도로 직접 렌더
  const groupObjects = rootObjects.filter((o) => o.isGroup && o.visible);
  const autoObjects = rootObjects.filter((o) => !o.physics.enabled && !o.light && !o.isGroup);
  const physicsObjects = rootObjects.filter((o) => o.physics.enabled && !o.light);

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

      {/* 그룹 오브젝트 — transform을 ViewerObject가 직접 처리 (AutoCollider 금지) */}
      {groupObjects.map((obj) => (
        <ViewerObject key={obj.id} object={obj} assets={assets} onEvent={onObjectClick} allObjects={allObjects} />
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
