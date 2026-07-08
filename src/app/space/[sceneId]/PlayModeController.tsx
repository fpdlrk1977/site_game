'use client';

import { useRef, useEffect, MutableRefObject, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF, useAnimations } from '@react-three/drei';
import { RigidBody, CapsuleCollider, CoefficientCombineRule, useRapier, type RapierRigidBody } from '@react-three/rapier';
import { QueryFilterFlags } from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { SkeletonUtils } from 'three-stdlib';
import { normalizeGlbMaterials } from '@/lib/glbMaterials';

const DEG2RAD = Math.PI / 180;
// PlayCanvas의 <Physics gravity={[0, -20, 0]}>와 동일한 크기로 유지할 것
// (킨매틱 바디는 물리 월드의 중력을 받지 않아 여기서 수동으로 적분한다)
const GRAVITY = 20;
// 이 각도보다 가파른 경사(산 등)는 오를 수 없고 미끄러져 내려온다
const MAX_SLOPE_CLIMB_DEG = 46;
const MIN_SLOPE_SLIDE_DEG = 46;

// ── 유틸 ────────────────────────────────────────────────────────

function lerpAngle(a: number, b: number, t: number) {
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

// 애니메이션 클립 이름에서 키워드로 찾기 (대소문자 무관)
function findClip(names: string[], keyword: string) {
  return names.find((n) => n.toLowerCase().includes(keyword.toLowerCase())) ?? null;
}

// ── 기본 캡슐 캐릭터 (GLB 미설정 시) ──────────────────────────

function DefaultCharacter() {
  return (
    <>
      <mesh position={[0, 0, 0]} castShadow>
        <capsuleGeometry args={[0.4, 1.0, 8, 16]} />
        <meshStandardMaterial color="#7c3aed" roughness={0.4} metalness={0.2} />
      </mesh>
      <mesh position={[0, 1.0, 0]} castShadow>
        <sphereGeometry args={[0.32, 16, 16]} />
        <meshStandardMaterial color="#8b5cf6" roughness={0.3} metalness={0.1} />
      </mesh>
    </>
  );
}

// ── GLB 캐릭터 컴포넌트 ─────────────────────────────────────────

interface GlbCharacterProps {
  url: string;
  scale: number;
  movingRef: MutableRefObject<boolean>;
  jumpingRef: MutableRefObject<boolean>;
}

function GlbCharacter({ url, scale, movingRef, jumpingRef }: GlbCharacterProps) {
  const groupRef = useRef<THREE.Group>(null);
  const { scene: rawScene, animations } = useGLTF(url);

  // 스킨드 메시는 인스턴스 공유 불가 → 클론
  const scene = useMemo(() => {
    const c = SkeletonUtils.clone(rawScene);
    normalizeGlbMaterials(c);
    return c;
  }, [rawScene]);

  const { actions, names } = useAnimations(animations, groupRef);
  const currentAnim = useRef<string | null>(null);

  // 마운트 시 idle 시작
  useEffect(() => {
    const idleClip = findClip(names, 'idle') ?? names[0] ?? null;
    if (idleClip) {
      actions[idleClip]?.reset().play();
      currentAnim.current = idleClip;
    }
  }, [actions, names]);

  useFrame(() => {
    // 상태에 따른 목표 애니메이션 결정
    const targetKeyword = jumpingRef.current ? 'jump'
      : movingRef.current             ? 'walk'
      :                                  'idle';

    const targetClip = findClip(names, targetKeyword)
      ?? (targetKeyword === 'walk' ? findClip(names, 'run') : null)
      ?? findClip(names, 'idle')
      ?? names[0]
      ?? null;

    if (targetClip && targetClip !== currentAnim.current) {
      const prev = currentAnim.current ? actions[currentAnim.current] : null;
      prev?.fadeOut(0.2);
      actions[targetClip]?.reset().fadeIn(0.2).play();
      currentAnim.current = targetClip;
    }
  });

  // 캡슐 콜라이더 중심 → 바닥 오프셋: -(halfHeight + radius) = -(0.5 + 0.4)
  return (
    <group ref={groupRef} scale={scale} position={[0, -0.9, 0]}>
      <primitive object={scene} />
    </group>
  );
}

// ── 메인 컨트롤러 ───────────────────────────────────────────────

interface Props {
  azimuthRef: MutableRefObject<number>;
  playerRef: MutableRefObject<RapierRigidBody | null>;
  spawnPosition?: [number, number, number];
  characterUrl?: string;
  characterScale?: number;
  playerSpeed?: number;
  playerJumpForce?: number;
  mobileInputRef?: MutableRefObject<{ fwd: number; strafe: number; jump: boolean }>;
  onPositionChange?: (x: number, z: number) => void;
  /** 캐릭터가 솔리드 오브젝트에 새로 접촉했을 때 (RigidBody userData.objectId 기준, 접촉 지속 중 1회) */
  onObstacleEnter?: (objectId: string) => void;
  /** 접촉이 끝났을 때 (grace 시간 이상 떨어짐) — area_exit 트리거용 */
  onObstacleExit?: (objectId: string) => void;
  /** interact 이벤트를 가진 오브젝트들의 월드 위치 (근접 프롬프트/E키 대상 산출용) */
  interactables?: { id: string; x: number; y: number; z: number }[];
  /** 상호작용 가능 범위(m). 기본 3 */
  interactRange?: number;
  /** 근접한 상호작용 대상이 바뀔 때 (없으면 null) — E 프롬프트 표시용 */
  onInteractableChange?: (objectId: string | null) => void;
  /** E키(또는 모바일 액션)로 상호작용 발동 시 */
  onInteract?: (objectId: string) => void;
  /** approach_enter/exit 이벤트를 가진 오브젝트들의 월드 위치 (근접 자동 트리거용) */
  approachables?: { id: string; x: number; y: number; z: number }[];
  /** 캐릭터가 approach 대상 근접 범위에 새로 들어왔을 때 */
  onApproachEnter?: (objectId: string) => void;
  /** 캐릭터가 approach 대상 근접 범위를 벗어났을 때 */
  onApproachExit?: (objectId: string) => void;
}

export function PlayModeController({
  azimuthRef,
  playerRef,
  spawnPosition = [0, 4, 0],
  characterUrl,
  characterScale = 1,
  playerSpeed = 5,
  playerJumpForce = 12,
  mobileInputRef,
  onPositionChange,
  onObstacleEnter,
  onObstacleExit,
  interactables,
  interactRange = 3,
  onInteractableChange,
  onInteract,
  approachables,
  onApproachEnter,
  onApproachExit,
}: Props) {
  const keys = useRef({ w: false, a: false, s: false, d: false, space: false });
  // 현재 근접한 상호작용 대상 id (useFrame이 갱신, keydown이 읽음)
  const activeInteractRef = useRef<string | null>(null);
  // 현재 approach 범위 안에 있는 오브젝트 id 집합 (enter/exit 경계 감지용)
  const approachingRef = useRef<Set<string>>(new Set());
  // keydown 핸들러(1회 등록)가 최신 콜백을 읽도록 ref로 보관
  const onInteractRef = useRef(onInteract);
  onInteractRef.current = onInteract;
  const { camera } = useThree();
  const { world } = useRapier();
  const elevationRef = useRef(0.45);
  const cameraDistanceRef = useRef(8);
  const isDragging = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });
  const lastTouchRef = useRef({ x: 0, y: 0 });
  const _targetPos = useRef(new THREE.Vector3());
  const _camPos = useRef(new THREE.Vector3());
  const camTarget = useRef(new THREE.Vector3());

  // 캐릭터 방향 + 애니메이션 상태 공유
  const characterGroupRef = useRef<THREE.Group>(null);
  const movingRef = useRef(false);
  const jumpingRef = useRef(false);
  // 수동으로 적분하는 수직 속도 (킨매틱 바디는 물리 솔버가 다루지 않음)
  const verticalVelRef = useRef(0);
  // KinematicCharacterController.computedGrounded()의 직전 프레임 결과
  const groundedRef = useRef(false);
  const controllerRef = useRef<ReturnType<typeof world.createCharacterController> | null>(null);
  // 오브젝트별 마지막 접촉 시각(ms) — 벽에 밀착하면 접촉 판정이 프레임 간 깜빡이므로
  // 짧은 끊김은 같은 접촉으로 간주하고, 일정 시간 이상 떨어졌다 다시 닿으면 재발동
  const touchingTimesRef = useRef<Map<string, number>>(new Map());

  // 캐릭터 컨트롤러 생성 — 경사각 제한/지면 스냅을 엔진이 직접 처리
  useEffect(() => {
    const controller = world.createCharacterController(0.02);
    controller.setSlideEnabled(true);
    controller.setMaxSlopeClimbAngle(MAX_SLOPE_CLIMB_DEG * DEG2RAD);
    controller.setMinSlopeSlideAngle(MIN_SLOPE_SLIDE_DEG * DEG2RAD);
    // 오토스텝 비활성화: 저폴리곤 지형(산 등)은 표면이 작은 계단 모양 facet으로
    // 쪼개져 있는 경우가 많아, 오토스텝이 그걸 "계단"으로 오인해 매 점프마다
    // 조금씩 밀어 올려 결국 경사각 제한을 무력화시키고 산을 넘게 만든다.
    controller.disableAutostep();
    controller.enableSnapToGround(0.3);
    controller.setApplyImpulsesToDynamicBodies(true);
    controllerRef.current = controller;
    return () => {
      world.removeCharacterController(controller);
      controllerRef.current = null;
    };
  }, [world]);

  // 키보드
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'KeyW' || e.code === 'ArrowUp') keys.current.w = true;
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') keys.current.a = true;
      if (e.code === 'KeyS' || e.code === 'ArrowDown') keys.current.s = true;
      if (e.code === 'KeyD' || e.code === 'ArrowRight') keys.current.d = true;
      if (e.code === 'Space') { e.preventDefault(); keys.current.space = true; }
      // 상호작용: 근접 대상이 있으면 E키로 발동 (연타 무해 — 이벤트가 다시 실행될 뿐)
      if (e.code === 'KeyE' && !e.repeat) {
        const id = activeInteractRef.current;
        if (id) onInteractRef.current?.(id);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'KeyW' || e.code === 'ArrowUp') keys.current.w = false;
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') keys.current.a = false;
      if (e.code === 'KeyS' || e.code === 'ArrowDown') keys.current.s = false;
      if (e.code === 'KeyD' || e.code === 'ArrowRight') keys.current.d = false;
      if (e.code === 'Space') keys.current.space = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  // 마우스 드래그 카메라 회전
  useEffect(() => {
    const onDown = (e: MouseEvent) => { isDragging.current = true; lastMouseRef.current = { x: e.clientX, y: e.clientY }; };
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const dx = e.clientX - lastMouseRef.current.x;
      const dy = e.clientY - lastMouseRef.current.y;
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
      azimuthRef.current -= dx * 0.006;
      elevationRef.current = Math.max(0.1, Math.min(1.3, elevationRef.current + dy * 0.006));
    };
    const onUp = () => { isDragging.current = false; };
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        const dx = e.touches[0].clientX - lastTouchRef.current.x;
        const dy = e.touches[0].clientY - lastTouchRef.current.y;
        lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        azimuthRef.current -= dx * 0.006;
        elevationRef.current = Math.max(0.1, Math.min(1.3, elevationRef.current + dy * 0.006));
      }
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
    };
  }, [azimuthRef]);

  useFrame((_state, delta) => {
    const rb = playerRef.current;
    const controller = controllerRef.current;
    if (!rb || !controller || rb.numColliders() === 0) return;

    const pos = rb.translation();
    const az = azimuthRef.current;
    const speed = playerSpeed;

    // 카메라는 (sin(az), cos(az)) 방향 오프셋에서 캐릭터를 바라보므로,
    // 카메라가 실제로 바라보는(전진) 방향은 그 반대인 (-sin(az), -cos(az))다.
    let vx = 0, vz = 0;
    if (keys.current.w) { vx -= Math.sin(az); vz -= Math.cos(az); }
    if (keys.current.s) { vx += Math.sin(az); vz += Math.cos(az); }
    if (keys.current.a) { vx -= Math.cos(az); vz += Math.sin(az); }
    if (keys.current.d) { vx += Math.cos(az); vz -= Math.sin(az); }

    const mobile = mobileInputRef?.current;
    if (mobile) {
      vx += -Math.sin(az) * mobile.fwd + Math.cos(az) * mobile.strafe;
      vz += -Math.cos(az) * mobile.fwd - Math.sin(az) * mobile.strafe;
    }

    const len = Math.sqrt(vx * vx + vz * vz);
    if (len > 0) { vx = (vx / len) * speed; vz = (vz / len) * speed; }

    // 중력 수동 적분 — 착지 상태면 누적된 낙하 속도를 리셋
    if (groundedRef.current && verticalVelRef.current < 0) {
      verticalVelRef.current = 0;
    }
    verticalVelRef.current -= GRAVITY * delta;

    // 점프 — 직전 프레임의 지면 판정(computedGrounded)에서만 허용
    if ((keys.current.space || mobile?.jump) && groundedRef.current) {
      verticalVelRef.current = playerJumpForce;
      groundedRef.current = false;
      keys.current.space = false;
      if (mobile) mobile.jump = false;
    }

    // 지형과 충돌·슬라이딩되는 실제 이동량을 캐릭터 컨트롤러가 계산
    // (오토스텝·지면 스냅을 엔진이 처리 — 수동 위치 보정 불필요)
    // EXCLUDE_SENSORS: 센서(Is Sensor) 오브젝트는 벽이 아니라 통과 가능한 트리거 영역 —
    // 제외하지 않으면 캡슐이 센서 표면에서 막혀 겹침이 생기지 않아 area_enter가 절대 발동 못 한다
    const desired = { x: vx * delta, y: verticalVelRef.current * delta, z: vz * delta };
    controller.computeColliderMovement(rb.collider(0), desired, QueryFilterFlags.EXCLUDE_SENSORS);
    const corrected = controller.computedMovement();

    // computedGrounded()는 maxSlopeClimbAngle과 무관하게 "발밑에 뭔가 닿아있으면"
    // true를 반환한다(격리 시뮬레이션으로 확인된 동작) — 46도보다 가파른 절벽 위에
    // 서 있어도 grounded=true로 나와 그 자리에서 또 점프가 가능해지고, 이게 반복되면
    // 절벽을 타고 올라가버린다. 그래서 접촉면 노멀 각도를 직접 검사해, 걸을 수 있는
    // 각도(<=MAX_SLOPE_CLIMB_DEG)의 접촉이 하나라도 있을 때만 진짜 접지로 인정한다.
    const rawGrounded = controller.computedGrounded();
    let touchingAnything = false;
    let hasWalkableContact = false;
    const currentTouchingIds = new Set<string>();
    const numCollisions = controller.numComputedCollisions();
    for (let i = 0; i < numCollisions; i++) {
      const collision = controller.computedCollision(i);
      if (!collision?.normal1) continue;
      touchingAnything = true;
      const angleDeg = Math.acos(Math.min(1, Math.max(-1, collision.normal1.y))) / DEG2RAD;
      if (angleDeg <= MAX_SLOPE_CLIMB_DEG) hasWalkableContact = true;
      // 접촉한 콜라이더의 RigidBody userData에서 씬 오브젝트 ID 수집 (area_enter 발동용)
      const userData = collision.collider?.parent()?.userData as { objectId?: string } | undefined;
      if (userData?.objectId) currentTouchingIds.add(userData.objectId);
    }
    groundedRef.current = rawGrounded && (touchingAnything ? hasWalkableContact : true);

    // 새로 접촉한 솔리드 오브젝트 → onObstacleEnter
    // 0.5초 이내의 접촉 끊김은 같은 접촉으로 간주 (밀착 시 판정 깜빡임으로 인한 중복 발동 방지)
    const TOUCH_GRACE_MS = 500;
    const now = performance.now();
    for (const id of currentTouchingIds) {
      const last = touchingTimesRef.current.get(id);
      if ((last === undefined || now - last > TOUCH_GRACE_MS) && onObstacleEnter) {
        onObstacleEnter(id);
      }
      touchingTimesRef.current.set(id, now);
    }
    // 오래 전에 접촉이 끊긴 항목 정리 — 이 시점이 area_exit 발동 시점
    for (const [id, t] of touchingTimesRef.current) {
      if (!currentTouchingIds.has(id) && now - t > TOUCH_GRACE_MS) {
        touchingTimesRef.current.delete(id);
        onObstacleExit?.(id);
      }
    }

    // 위쪽 이동이 경사각 제한/천장 충돌로 막혔다면 수직 속도를 소모
    if (verticalVelRef.current > 0 && corrected.y < desired.y - 1e-4) {
      verticalVelRef.current = 0;
    }

    const newPos = { x: pos.x + corrected.x, y: pos.y + corrected.y, z: pos.z + corrected.z };

    // 낙사 리스폰 — 스폰 y가 바닥(y=0) 아래로 저장된 구버전 씬 데이터라도
    // 리스폰은 바닥 위에서 시작해 무한 낙사 루프에 빠지지 않게 한다
    if (newPos.y < -10) {
      newPos.x = spawnPosition[0];
      newPos.y = Math.max(spawnPosition[1], 1);
      newPos.z = spawnPosition[2];
      verticalVelRef.current = 0;
    }

    rb.setNextKinematicTranslation(newPos);

    // ── 상호작용 근접 판정 — 범위 내에서 가장 가까운 interact 대상 산출 ──
    // (대상이 바뀔 때만 콜백 → 매 프레임 setState 방지)
    if (interactables && interactables.length > 0) {
      let nearest: string | null = null;
      let nearestDist = interactRange;
      for (const it of interactables) {
        const dx = it.x - newPos.x;
        const dy = it.y - newPos.y;
        const dz = it.z - newPos.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist < nearestDist) { nearestDist = dist; nearest = it.id; }
      }
      if (nearest !== activeInteractRef.current) {
        activeInteractRef.current = nearest;
        onInteractableChange?.(nearest);
      }
    } else if (activeInteractRef.current !== null) {
      activeInteractRef.current = null;
      onInteractableChange?.(null);
    }

    // ── approach 근접 자동 트리거 — 범위 경계를 넘는 순간 enter/exit 발동 ──
    // (interact와 동일 반경. 오브젝트별 in/out 상태를 Set으로 추적해 프레임마다 경계 교차만 콜백)
    if (approachables && approachables.length > 0) {
      const inside = approachingRef.current;
      for (const it of approachables) {
        const dx = it.x - newPos.x;
        const dy = it.y - newPos.y;
        const dz = it.z - newPos.z;
        const within = Math.sqrt(dx * dx + dy * dy + dz * dz) <= interactRange;
        const was = inside.has(it.id);
        if (within && !was) { inside.add(it.id); onApproachEnter?.(it.id); }
        else if (!within && was) { inside.delete(it.id); onApproachExit?.(it.id); }
      }
    } else if (approachingRef.current.size > 0) {
      approachingRef.current.clear();
    }

    // 애니메이션 상태 업데이트
    const horizSpeed = Math.sqrt(vx * vx + vz * vz);
    movingRef.current = horizSpeed > 0.5;
    jumpingRef.current = verticalVelRef.current > 1.5;

    // 이동 방향으로 캐릭터 회전 (lerp)
    if (movingRef.current && characterGroupRef.current) {
      const targetAngle = Math.atan2(vx, vz);
      characterGroupRef.current.rotation.y = lerpAngle(
        characterGroupRef.current.rotation.y,
        targetAngle,
        0.15,
      );
    }

    // 팔로우 카메라
    const d = cameraDistanceRef.current;
    const el = elevationRef.current;
    _targetPos.current.set(newPos.x, newPos.y + 1, newPos.z);
    camTarget.current.lerp(_targetPos.current, 0.12);

    const camX = camTarget.current.x + d * Math.sin(az) * Math.cos(el);
    const camY = camTarget.current.y + d * Math.sin(el);
    const camZ = camTarget.current.z + d * Math.cos(az) * Math.cos(el);

    _camPos.current.set(camX, camY, camZ);
    camera.position.lerp(_camPos.current, 0.1);
    camera.lookAt(camTarget.current);
  });

  return (
    <RigidBody
      ref={playerRef}
      type="kinematicPosition"
      position={spawnPosition}
      colliders={false}
    >
      <CapsuleCollider args={[0.5, 0.4]} friction={0} frictionCombineRule={CoefficientCombineRule.Min} />
      <group ref={characterGroupRef}>
        {characterUrl ? (
          <GlbCharacter
            url={characterUrl}
            scale={characterScale}
            movingRef={movingRef}
            jumpingRef={jumpingRef}
          />
        ) : (
          <DefaultCharacter />
        )}
      </group>
    </RigidBody>
  );
}
