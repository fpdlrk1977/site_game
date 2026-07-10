'use client';

import { useRef } from 'react';
import { Physics, RigidBody, CuboidCollider } from '@react-three/rapier';
import type { RapierRigidBody } from '@react-three/rapier';
import type { ProjectSceneSchema, ObjectNodeSchema, EventSchema } from '@/types/scene';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ViewerObject } from './ViewerObject';
import { PhysicsObject } from './PhysicsObject';
import { PlayModeController } from './PlayModeController';
import { effectiveDialogue } from './useObjectDialogue';
import { computeMotion, makeWanderState } from '@/lib/motion';
import { worldMatrix, localCenter } from '@/lib/objectBBox';

const DEG2RAD = Math.PI / 180;

// 오브젝트별 콜라이더 거동 판정 — 루트/그룹자식 어디서든 동일하게 쓰는 순수 함수.
// 위치가 움직이는 모션(float/spin/orbit/wander) + 콜라이더 동반 → kinematic 이동 장애물.
const isMovingColliderObj = (o: ObjectNodeSchema) =>
  o.motion?.collider === true && o.motion.type !== 'pulse' && !o.isGroup && !o.light;
// 위치가 움직이는 모션인데 콜라이더 미동반 → 시각 전용(콜라이더 없음, 통과). pulse는 제자리라 제외(정적 콜라이더 유지).
const isVisualOnlyMotionObj = (o: ObjectNodeSchema) =>
  !!o.motion && o.motion.type !== 'pulse' && o.motion.collider !== true &&
  !o.isGroup && !o.light && !o.physics.enabled;

type ColliderAssets = Parameters<typeof ViewerObject>[0]['assets'];
type ColliderOnEvent = (obj: ObjectNodeSchema, trigger: EventSchema['trigger']) => void;

// motion.collider가 켜진 오브젝트 — kinematic RigidBody를 모션으로 구동해 "진짜 이동 장애물"로.
// (시각은 ViewerObject noMotion으로 정적 처리 → RigidBody가 움직이면 자식 메시가 함께 이동. pulse 제외)
const _mcOut = { pos: new THREE.Vector3(), rot: new THREE.Euler(), scl: new THREE.Vector3(), quat: new THREE.Quaternion() };
const _mcQuat = new THREE.Quaternion();
const _mcPos = new THREE.Vector3();
const _mcQuatBase = new THREE.Quaternion();
const _mcScl = new THREE.Vector3();
const _mcEuler = new THREE.Euler();
// 단일 오브젝트(또는 정적 그룹의 자식) 이동 콜라이더. kinematic은 월드 좌표로 구동되므로
// 부모 체인을 합성한 '월드 베이스' 기준으로 모션을 적용한다(루트면 로컬=월드).
function MovingCollider({ object, assets, onEvent, allObjects }: {
  object: ObjectNodeSchema;
  assets: Parameters<typeof ViewerObject>[0]['assets'];
  onEvent: (obj: ObjectNodeSchema, trigger: EventSchema['trigger']) => void;
  allObjects: ObjectNodeSchema[];
}) {
  const rbRef = useRef<RapierRigidBody>(null);
  const phase = useRef(Math.random() * 100);
  const wander = useRef(makeWanderState());
  worldMatrix(allObjects, object.id).decompose(_mcPos, _mcQuatBase, _mcScl);
  _mcEuler.setFromQuaternion(_mcQuatBase);
  const basePos: [number, number, number] = [_mcPos.x, _mcPos.y, _mcPos.z];
  const baseRot: [number, number, number] = [_mcEuler.x, _mcEuler.y, _mcEuler.z];
  const worldScl: [number, number, number] = [_mcScl.x, _mcScl.y, _mcScl.z];
  // 형상 중심 피벗(프리미티브=0, GLB 등은 원점이 중심과 달라 spin wobble → 중심 기준 회전)
  const lc = localCenter(allObjects, assets, object.id);
  const pivot: [number, number, number] | null = lc ? [lc.x, lc.y, lc.z] : null;
  useFrame((state, dt) => {
    const rb = rbRef.current;
    if (!rb || !object.motion) return;
    computeMotion(object.motion, basePos, baseRot, worldScl, state.clock.elapsedTime + phase.current, dt, wander.current, _mcOut, pivot);
    rb.setNextKinematicTranslation(_mcOut.pos);
    rb.setNextKinematicRotation(_mcOut.quat);
  });
  return (
    <RigidBody
      ref={rbRef}
      type="kinematicPosition"
      colliders={getColliderType(object)}
      position={basePos}
      rotation={baseRot}
      userData={{ objectId: object.id }}
    >
      <group scale={worldScl}>
        <ViewerObject object={object} assets={assets} onEvent={onEvent} noTransform noMotion />
      </group>
    </RigidBody>
  );
}

// 모션+콜라이더 켠 그룹 — 그룹 전체를 하나의 kinematic 강체로 묶어 자식 콜라이더가 함께 이동.
// 자식 메시들을 convex hull 콜라이더로 자동 생성(캐릭터와 견고하게 충돌). 그룹 스케일은 내부 group에 적용.
// 제약: 자식이 개별 실제형상(trimesh)이 아니라 볼록 껍질로 근사됨(오목 형상은 실제보다 두꺼운 충돌).
function MovingGroupCollider({ object, assets, onEvent, allObjects }: {
  object: ObjectNodeSchema;
  assets: ColliderAssets;
  onEvent: ColliderOnEvent;
  allObjects: ObjectNodeSchema[];
}) {
  const rbRef = useRef<RapierRigidBody>(null);
  const phase = useRef(Math.random() * 100);
  const wander = useRef(makeWanderState());
  const basePos: [number, number, number] = [object.position.x, object.position.y, object.position.z];
  const baseRot: [number, number, number] = [object.rotation.x * DEG2RAD, object.rotation.y * DEG2RAD, object.rotation.z * DEG2RAD];
  const baseScl: [number, number, number] = [object.scale.x, object.scale.y, object.scale.z];
  // 그룹은 원점(자식 위치 평균)이 형상 중심과 어긋날 수 있어, 형상 중심을 회전 피벗으로 넘겨 제자리 회전시킨다.
  const lc = localCenter(allObjects, assets, object.id);
  const pivot: [number, number, number] | null = lc ? [lc.x, lc.y, lc.z] : null;
  useFrame((state, dt) => {
    const rb = rbRef.current;
    if (!rb || !object.motion) return;
    computeMotion(object.motion, basePos, baseRot, baseScl, state.clock.elapsedTime + phase.current, dt, wander.current, _mcOut, pivot);
    rb.setNextKinematicTranslation(_mcOut.pos);
    rb.setNextKinematicRotation(_mcOut.quat);
  });
  return (
    <RigidBody
      ref={rbRef}
      type="kinematicPosition"
      colliders="hull"
      position={basePos}
      rotation={baseRot}
      userData={{ objectId: object.id }}
    >
      <group scale={baseScl}>
        <ViewerObject object={object} assets={assets} onEvent={onEvent} allObjects={allObjects} noTransform noMotion />
      </group>
    </RigidBody>
  );
}

// move_object로 옮겨지는(모션 없는) 그룹 — 그룹 전체를 하나의 kinematic 강체로 묶어 자식 콜라이더가
// 함께 이동한다. 정적 GroupWithCollision은 자식 콜라이더가 부모 group 이동을 따라가지 않아
// '유령 콜라이더'(시각만 미끄러지고 벽은 원래 자리)가 되던 것을 해결. posOverride로 매 프레임 갱신되는
// object.position을 setNextKinematicTranslation으로 반영(회전/스케일은 이동 중 불변). hull 콜라이더 근사.
const _mgPos = new THREE.Vector3();
function MovedGroupCollider({ object, assets, onEvent, allObjects }: {
  object: ObjectNodeSchema;
  assets: ColliderAssets;
  onEvent: ColliderOnEvent;
  allObjects: ObjectNodeSchema[];
}) {
  const rbRef = useRef<RapierRigidBody>(null);
  const baseRot: [number, number, number] = [object.rotation.x * DEG2RAD, object.rotation.y * DEG2RAD, object.rotation.z * DEG2RAD];
  const baseScl: [number, number, number] = [object.scale.x, object.scale.y, object.scale.z];
  const initPos: [number, number, number] = [object.position.x, object.position.y, object.position.z];
  useFrame(() => {
    const rb = rbRef.current;
    if (!rb) return;
    // object.position은 effectiveScene(posOverride)으로 매 프레임 갱신 — 최신 위치로 kinematic 구동.
    _mgPos.set(object.position.x, object.position.y, object.position.z);
    rb.setNextKinematicTranslation(_mgPos);
  });
  return (
    <RigidBody
      ref={rbRef}
      type="kinematicPosition"
      colliders="hull"
      position={initPos}
      rotation={baseRot}
      userData={{ objectId: object.id }}
    >
      <group scale={baseScl}>
        <ViewerObject object={object} assets={assets} onEvent={onEvent} allObjects={allObjects} noTransform noMotion />
      </group>
    </RigidBody>
  );
}

function getColliderType(object: ObjectNodeSchema) {
  // GLB(산·바위 등 오목한 지형 포함)는 trimesh로 실제 메쉬 형태 그대로 충돌 처리.
  // hull(볼록 껍질)은 오목한 형태를 매끈하게 뭉개버려 절벽/급경사가 실제보다 완만한
  // 경사로 처리되는 원인이 되므로 사용하지 않는다 (fixed 바디는 trimesh 사용 가능).
  return object.primitiveShape === 'box' ? 'cuboid'
    : object.primitiveShape === 'sphere' ? 'ball'
    : 'trimesh';
}

// physics.enabled가 꺼진 오브젝트도 플레이 모드에서 고정 콜라이더를 부여
// userData.objectId: 캐릭터 컨트롤러 접촉 감지(area_enter)용 식별자
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
      userData={{ objectId: object.id }}
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
          // 중첩 모션 그룹은 루트 그룹만 kinematic 지원 → 여기선 시각 전용(콜라이더 미동반)으로 애니메이션만.
          if (child.motion) {
            return <ViewerObject key={child.id} object={child} assets={assets} onEvent={onEvent} allObjects={allObjects} />;
          }
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
        // 이동 콜라이더 자식 → 상위(PlayCanvas)에서 월드 kinematic으로 렌더하므로 여기선 스킵(이중 렌더 방지).
        if (isMovingColliderObj(child)) return null;
        // 움직이는 모션·콜라이더 미동반 자식 → 콜라이더 없이 시각만(통과 가능). 부모 group이 로컬 좌표 담당.
        if (isVisualOnlyMotionObj(child)) {
          return <ViewerObject key={child.id} object={child} assets={assets} onEvent={onEvent} allObjects={allObjects} />;
        }
        // 일반(정적/펄스) 오브젝트: RigidBody position이 부모 group 기준 로컬 좌표로 처리됨
        return (
          <RigidBody
            key={child.id}
            type="fixed"
            colliders={getColliderType(child)}
            position={[child.position.x, child.position.y, child.position.z]}
            rotation={[child.rotation.x * DEG2RAD, child.rotation.y * DEG2RAD, child.rotation.z * DEG2RAD]}
            userData={{ objectId: child.id }}
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
  /** 근접한 상호작용(interact) 대상이 바뀔 때 — 뷰어의 E 프롬프트 표시용 */
  onInteractPromptChange?: (obj: ObjectNodeSchema | null) => void;
  /** 런타임 통과 가능(콜라이더 제거) 오브젝트 id 집합 — set_passable/toggle_collision */
  passableIds?: Set<string>;
  /** move_object로 런타임 이동 중인 오브젝트 id 집합 — 그룹을 kinematic 강체로 라우팅(콜라이더 동반 이동) */
  movedIds?: Set<string>;
  /** 플레이 모드 카메라 포커스 지점(월드+반경) — 있으면 팔로우 대신 대상 줌 */
  focusPoint?: { x: number; y: number; z: number; radius: number } | null;
  /** 캐릭터 이동 잠금 — 팝업·포커스 등 상호작용 진행 중 */
  movementLocked?: boolean;
}

export function PlayCanvas({ scene, azimuthRef, onObjectClick, mobileInputRef, onInteractPromptChange, passableIds, movedIds, focusPoint, movementLocked }: Props) {
  const playerRef = useRef<RapierRigidBody>(null);
  const assets = scene.assets ?? [];

  const allObjects = scene.objects;
  // 근접 감지 대상(루트 오브젝트) — E키/프롬프트가 필요한 것들.
  // interact 이벤트가 있거나, 근접이 필요한 대화(항상+자동 앰비언트는 근접 불필요라 제외).
  // (중첩 그룹 자식은 위치가 로컬 좌표라 월드 근접 판정이 어긋나므로 v1은 루트만 지원)
  const needsProximity = (o: ObjectNodeSchema) => {
    if (o.events?.some((e) => e.trigger === 'interact')) return true;
    const dlg = effectiveDialogue(o);
    return !!dlg && (dlg.show === 'approach' || dlg.show === 'interact' || dlg.advance === 'manual');
  };
  // 상호작용 근접 범위 — 오브젝트별 값 우선, 없으면 씬 기본값(EnvSchema.interactRange), 그것도 없으면 3m.
  const sceneRange = scene.environment.interactRange ?? 3;
  const effRange = (o: ObjectNodeSchema) => o.interactRange ?? sceneRange;
  const interactables = allObjects
    .filter((o) => !o.parentId && o.visible && needsProximity(o))
    .map((o) => ({ id: o.id, x: o.position.x, y: o.position.y, z: o.position.z, range: effRange(o) }));
  // approach 근접 자동 트리거 대상 — approach_enter/exit 이벤트를 가진 루트 오브젝트.
  // (interact와 동일 범위 규칙. 오브젝트는 솔리드 유지 가능 — area와 달리 센서 불필요)
  const approachables = allObjects
    .filter((o) => !o.parentId && o.visible && o.events?.some((e) => e.trigger === 'approach_enter' || e.trigger === 'approach_exit'))
    .map((o) => ({ id: o.id, x: o.position.x, y: o.position.y, z: o.position.z, range: effRange(o) }));
  // 런타임 통과(콜라이더 제거) 대상 — set_passable/toggle_collision. 시각은 유지하고 콜라이더만 뺀다(문 열림).
  const isPassable = (o: ObjectNodeSchema) => !!passableIds?.has(o.id);
  const isMoved = (o: ObjectNodeSchema) => !!movedIds?.has(o.id);
  const rootObjects = allObjects.filter((o) => !o.parentId);
  const lightObjects = rootObjects.filter((o) => o.light && o.visible);
  // 그룹은 GroupWithCollision으로 처리: 자식 오브젝트 각각에 콜라이더 적용
  // (그룹에 physics가 켜져 있어도 그룹 자체는 PhysicsObject로 렌더하지 않음 — 이중 렌더 방지)
  const allGroups = rootObjects.filter((o) => o.isGroup && o.visible);
  // 모션+콜라이더 켠 그룹 → 하나의 kinematic 강체로 묶어 이동(진짜 장애물). pulse·통과 대상 제외.
  const isGroupMovingCollider = (o: ObjectNodeSchema) =>
    !!o.motion && o.motion.collider === true && o.motion.type !== 'pulse';
  const movingGroupColliders = allGroups.filter((o) => isGroupMovingCollider(o) && !isPassable(o));
  // move_object로 옮겨지는(모션 없는) 그룹 → 하나의 kinematic 강체로 묶어 콜라이더까지 함께 이동(유령 콜라이더 방지).
  //   모션 그룹은 위 movingGroupColliders/아래 movingGroups가 담당하므로 여기선 !motion만.
  const movedGroups = allGroups.filter((o) => isMoved(o) && !o.motion && !isPassable(o));
  // 모션 없는 그룹 → 기존 정적 GroupWithCollision(자식별 콜라이더). 통과·이동(move_object) 대상 제외.
  const groupObjects = allGroups.filter((o) => !o.motion && !isPassable(o) && !isMoved(o));
  // 나머지 그룹 → 시각 전용(장식). ViewerObject로 렌더해 애니메이션/표시만, 콜라이더 없음.
  //   = 모션+콜라이더 미동반 그룹 + 통과 대상 그룹(모션·콜라이더 유무 무관). 여집합으로 잡아 누락 방지.
  const movingGroups = allGroups.filter((o) => !movingGroupColliders.includes(o) && !groupObjects.includes(o) && !movedGroups.includes(o));
  // 조상 체인 정보 — 자식이 숨은 그룹 아래인지, 움직이는 그룹(하나의 강체로 이동) 아래인지.
  //   움직이는 그룹의 자식은 그 그룹 강체에 실려 함께 이동하므로 개별 콜라이더 라우팅에서 제외한다.
  const ancestorInfo = (o: ObjectNodeSchema) => {
    let pid = o.parentId; let visible = true; let underMovingGroup = false;
    while (pid) {
      const p = allObjects.find((x) => x.id === pid);
      if (!p) break;
      if (!p.visible) visible = false;
      if (p.isGroup && p.motion) underMovingGroup = true;
      pid = p.parentId;
    }
    return { visible, underMovingGroup };
  };
  // 이동 콜라이더 오브젝트 — 루트뿐 아니라 정적 그룹의 자식까지 포함(월드 kinematic으로 처리).
  //   움직이는 그룹 아래(강체에 실림)·숨은 조상 아래·통과 대상은 제외.
  const movingColliderObjects = allObjects.filter((o) => {
    if (!o.visible || !isMovingColliderObj(o) || isPassable(o)) return false;
    const a = ancestorInfo(o);
    return a.visible && !a.underMovingGroup;
  });
  // 위치가 움직이는 모션(float/spin/orbit/wander)인데 콜라이더 미동반 → 시각 전용(콜라이더 없음, 통과 가능).
  //   (정적 콜라이더를 붙이면 시각은 떠다니는데 벽만 원래 자리에 남는 '유령 콜라이더' 버그가 됨)
  //   루트만 여기서 렌더(중첩 자식은 GroupWithCollision이 처리). pulse는 제자리라 autoObjects에 남김.
  const visualMotionObjects = rootObjects.filter((o) => o.visible && isVisualOnlyMotionObj(o) && !isPassable(o));
  // 통과(콜라이더 제거) 대상 루트 오브젝트 — 콜라이더 없이 시각만(모션 있으면 애니메이션도) 렌더. 문 열림.
  const passableVisualObjects = rootObjects.filter((o) => o.visible && !o.light && !o.isGroup && isPassable(o));
  // ⚠ 숨김(hide_object)·통과 오브젝트는 콜라이더에서 제외 — 예전엔 visible 무시로 '보이지 않는 벽'이 남았음.
  const autoObjects = rootObjects.filter((o) => o.visible && !o.physics.enabled && !o.light && !o.isGroup && !isMovingColliderObj(o) && !isVisualOnlyMotionObj(o) && !isPassable(o));
  const physicsObjects = rootObjects.filter((o) => o.visible && o.physics.enabled && !o.light && !o.isGroup && !isMovingColliderObj(o) && !isPassable(o));

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
        const bx = scene.environment.boundary!;
        const bz = scene.environment.boundaryZ ?? bx;
        return (
          <>
            <RigidBody type="fixed" friction={0}><CuboidCollider args={[bx + 1, 30, 0.5]} position={[0, 15, -(bz + 0.5)]} /></RigidBody>
            <RigidBody type="fixed" friction={0}><CuboidCollider args={[bx + 1, 30, 0.5]} position={[0, 15,   bz + 0.5 ]} /></RigidBody>
            <RigidBody type="fixed" friction={0}><CuboidCollider args={[0.5, 30, bz + 1]} position={[  bx + 0.5,  15, 0]} /></RigidBody>
            <RigidBody type="fixed" friction={0}><CuboidCollider args={[0.5, 30, bz + 1]} position={[-(bx + 0.5), 15, 0]} /></RigidBody>
          </>
        );
      })()}

      {/* 그룹 오브젝트 — 자식 각각에 재귀적으로 콜라이더 부여 */}
      {groupObjects.map((obj) => (
        <GroupWithCollision key={obj.id} object={obj} assets={assets} onEvent={onObjectClick} allObjects={allObjects} />
      ))}

      {/* 모션+콜라이더 그룹 — 하나의 kinematic 강체로 묶어 이동(진짜 장애물) */}
      {movingGroupColliders.map((obj) => (
        <MovingGroupCollider key={obj.id} object={obj} assets={assets} onEvent={onObjectClick} allObjects={allObjects} />
      ))}

      {/* move_object로 옮겨지는 그룹 — kinematic 강체로 콜라이더까지 함께 이동 */}
      {movedGroups.map((obj) => (
        <MovedGroupCollider key={obj.id} object={obj} assets={assets} onEvent={onObjectClick} allObjects={allObjects} />
      ))}

      {/* 모션 걸린 그룹(콜라이더 미동반) — 시각 전용, MotionGroup 애니메이션 유지 */}
      {movingGroups.map((obj) => (
        <ViewerObject key={obj.id} object={obj} assets={assets} onEvent={onObjectClick} allObjects={allObjects} />
      ))}

      {/* motion.collider 오브젝트(루트+정적그룹 자식) — 월드 kinematic 이동 장애물 */}
      {movingColliderObjects.map((obj) => (
        <MovingCollider key={obj.id} object={obj} assets={assets} onEvent={onObjectClick} allObjects={allObjects} />
      ))}

      {/* 움직이는 모션·콜라이더 미동반 — 시각 전용(콜라이더 없음, 통과 가능) */}
      {visualMotionObjects.map((obj) => (
        <ViewerObject key={obj.id} object={obj} assets={assets} onEvent={onObjectClick} allObjects={allObjects} />
      ))}

      {/* 통과(set_passable/toggle_collision) 대상 루트 오브젝트 — 콜라이더 없이 시각만(문 열림) */}
      {passableVisualObjects.map((obj) => (
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
        onObstacleEnter={(objectId) => {
          // 캐릭터가 솔리드 오브젝트에 접촉 — area_enter 이벤트가 있으면 발동
          const obj = allObjects.find((o) => o.id === objectId);
          if (obj && obj.events.some((e) => e.trigger === 'area_enter')) {
            onObjectClick(obj, 'area_enter');
          }
        }}
        onObstacleExit={(objectId) => {
          // 접촉이 끝남 — area_exit 이벤트가 있으면 발동
          const obj = allObjects.find((o) => o.id === objectId);
          if (obj && obj.events.some((e) => e.trigger === 'area_exit')) {
            onObjectClick(obj, 'area_exit');
          }
        }}
        spawnPosition={scene.environment.playerStartPosition
          ? [scene.environment.playerStartPosition.x, scene.environment.playerStartPosition.y, scene.environment.playerStartPosition.z]
          : undefined}
        characterUrl={characterAsset?.dracoUrl}
        characterScale={scene.environment.playerCharacterScale ?? 1}
        playerSpeed={scene.environment.playerSpeed}
        playerJumpForce={scene.environment.playerJumpForce}
        mobileInputRef={mobileInputRef}
        interactables={interactables}
        onInteractableChange={(id) =>
          onInteractPromptChange?.(id ? (allObjects.find((o) => o.id === id) ?? null) : null)
        }
        onInteract={(id) => {
          const obj = allObjects.find((o) => o.id === id);
          if (obj) onObjectClick(obj, 'interact');
        }}
        approachables={approachables}
        onApproachEnter={(id) => {
          const obj = allObjects.find((o) => o.id === id);
          if (obj && obj.events.some((e) => e.trigger === 'approach_enter')) onObjectClick(obj, 'approach_enter');
        }}
        onApproachExit={(id) => {
          const obj = allObjects.find((o) => o.id === id);
          if (obj && obj.events.some((e) => e.trigger === 'approach_exit')) onObjectClick(obj, 'approach_exit');
        }}
        focusPoint={focusPoint}
        movementLocked={movementLocked}
      />
    </Physics>
  );
}
