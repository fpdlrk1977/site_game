'use client';

import { useRef, useEffect, MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { RigidBody, CapsuleCollider, type RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';

interface Props {
  azimuthRef: MutableRefObject<number>;
  playerRef: MutableRefObject<RapierRigidBody | null>;
  spawnPosition?: [number, number, number];
}

export function PlayModeController({ azimuthRef, playerRef, spawnPosition = [0, 4, 0] }: Props) {
  const keys = useRef({ w: false, a: false, s: false, d: false, space: false });
  const { camera } = useThree();
  const elevationRef = useRef(0.45);
  const cameraDistanceRef = useRef(8);
  const isDragging = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });
  const lastTouchRef = useRef({ x: 0, y: 0 });

  // 키보드 입력
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

  // 마우스 드래그로 카메라 회전
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      isDragging.current = true;
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
    };
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const dx = e.clientX - lastMouseRef.current.x;
      const dy = e.clientY - lastMouseRef.current.y;
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
      azimuthRef.current -= dx * 0.006;
      elevationRef.current = Math.max(0.1, Math.min(1.3, elevationRef.current - dy * 0.006));
    };
    const onUp = () => { isDragging.current = false; };

    // 터치 (모바일 우측 = 카메라 회전)
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        const dx = e.touches[0].clientX - lastTouchRef.current.x;
        const dy = e.touches[0].clientY - lastTouchRef.current.y;
        lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        azimuthRef.current -= dx * 0.006;
        elevationRef.current = Math.max(0.1, Math.min(1.3, elevationRef.current - dy * 0.006));
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

  const camTarget = useRef(new THREE.Vector3());

  useFrame(() => {
    const rb = playerRef.current;
    if (!rb) return;

    const vel = rb.linvel();
    const pos = rb.translation();
    const az = azimuthRef.current;
    const speed = 5;

    // 이동 방향 (카메라 방향 기준)
    let vx = 0, vz = 0;
    if (keys.current.w) { vx += Math.sin(az); vz += Math.cos(az); }
    if (keys.current.s) { vx -= Math.sin(az); vz -= Math.cos(az); }
    if (keys.current.a) { vx -= Math.cos(az); vz += Math.sin(az); }
    if (keys.current.d) { vx += Math.cos(az); vz -= Math.sin(az); }

    const len = Math.sqrt(vx * vx + vz * vz);
    if (len > 0) { vx = (vx / len) * speed; vz = (vz / len) * speed; }

    rb.setLinvel({ x: vx, y: vel.y, z: vz }, true);

    // 점프 — capsuleCollider halfHeight=0.5 + radius=0.4 → 바닥에 서면 center ≈ 0.9
    // vel.y 가 아주 작은 양수일 수 있으므로 0.3 이하일 때 grounded 판정
    const isGrounded = pos.y < 1.5 && vel.y <= 0.3;
    if (keys.current.space && isGrounded) {
      rb.applyImpulse({ x: 0, y: 12, z: 0 }, true);
      keys.current.space = false;
    }

    // 낙사 방지 — 너무 아래로 떨어지면 리스폰
    if (pos.y < -10) {
      rb.setTranslation({ x: spawnPosition[0], y: spawnPosition[1], z: spawnPosition[2] }, true);
      rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
    }

    // 팔로우 카메라
    const d = cameraDistanceRef.current;
    const el = elevationRef.current;
    const targetPos = new THREE.Vector3(pos.x, pos.y + 1, pos.z);
    camTarget.current.lerp(targetPos, 0.12);

    const camX = camTarget.current.x + d * Math.sin(az) * Math.cos(el);
    const camY = camTarget.current.y + d * Math.sin(el);
    const camZ = camTarget.current.z + d * Math.cos(az) * Math.cos(el);

    camera.position.lerp(new THREE.Vector3(camX, camY, camZ), 0.1);
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
      {/* 캐릭터 몸통 (보라 캡슐) */}
      <mesh position={[0, 0, 0]} castShadow>
        <capsuleGeometry args={[0.4, 1.0, 8, 16]} />
        <meshStandardMaterial color="#7c3aed" roughness={0.4} metalness={0.2} />
      </mesh>
      {/* 머리 */}
      <mesh position={[0, 1.0, 0]} castShadow>
        <sphereGeometry args={[0.32, 16, 16]} />
        <meshStandardMaterial color="#8b5cf6" roughness={0.3} metalness={0.1} />
      </mesh>
    </RigidBody>
  );
}
