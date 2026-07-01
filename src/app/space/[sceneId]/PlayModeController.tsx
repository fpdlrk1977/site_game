'use client';

import { useRef, useEffect, MutableRefObject, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF, useAnimations } from '@react-three/drei';
import { RigidBody, CapsuleCollider, type RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { SkeletonUtils } from 'three-stdlib';

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
  const scene = useMemo(() => SkeletonUtils.clone(rawScene), [rawScene]);

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

  return (
    <group ref={groupRef} scale={scale}>
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
  mobileInputRef?: MutableRefObject<{ fwd: number; strafe: number; jump: boolean }>;
}

export function PlayModeController({
  azimuthRef,
  playerRef,
  spawnPosition = [0, 4, 0],
  characterUrl,
  characterScale = 1,
  mobileInputRef,
}: Props) {
  const keys = useRef({ w: false, a: false, s: false, d: false, space: false });
  const { camera } = useThree();
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

  // 키보드
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'KeyW' || e.code === 'ArrowUp') keys.current.w = true;
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') keys.current.a = true;
      if (e.code === 'KeyS' || e.code === 'ArrowDown') keys.current.s = true;
      if (e.code === 'KeyD' || e.code === 'ArrowRight') keys.current.d = true;
      if (e.code === 'Space') { e.preventDefault(); keys.current.space = true; }
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

  useFrame(() => {
    const rb = playerRef.current;
    if (!rb) return;

    const vel = rb.linvel();
    const pos = rb.translation();
    const az = azimuthRef.current;
    const speed = 5;

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
    rb.setLinvel({ x: vx, y: vel.y, z: vz }, true);

    // 점프
    const isGrounded = pos.y < 1.5 && vel.y <= 0.3;
    if ((keys.current.space || mobile?.jump) && isGrounded) {
      rb.applyImpulse({ x: 0, y: 12, z: 0 }, true);
      keys.current.space = false;
      if (mobile) mobile.jump = false;
    }

    // 낙사 리스폰
    if (pos.y < -10) {
      rb.setTranslation({ x: spawnPosition[0], y: spawnPosition[1], z: spawnPosition[2] }, true);
      rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
    }

    // 애니메이션 상태 업데이트
    const horizSpeed = Math.sqrt(vx * vx + vz * vz);
    movingRef.current = horizSpeed > 0.5;
    jumpingRef.current = vel.y > 1.5;

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
    _targetPos.current.set(pos.x, pos.y + 1, pos.z);
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
      type="dynamic"
      position={spawnPosition}
      enabledRotations={[false, false, false]}
      linearDamping={4}
      colliders={false}
    >
      <CapsuleCollider args={[0.5, 0.4]} />
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
