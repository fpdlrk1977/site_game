'use client';

/**
 * ContactShadows On/Off 시각 검증. ?cs=off 로 끄고 비교.
 * 방향광 그림자를 끄고 ContactShadows만 남겨, 접지 그림자 자체가 렌더되는지 확인한다.
 */

import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, ContactShadows } from '@react-three/drei';

export default function ContactTestPage() {
  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const on = params.get('cs') !== 'off';
  const showGround = params.get('ground') !== 'off';
  return (
    <div style={{ width: '100vw', height: '100vh', background: '#0b1020' }}>
      <Canvas camera={{ position: [3, 2.5, 5], fov: 50 }} gl={{ toneMapping: THREE.LinearToneMapping, preserveDrawingBuffer: true }}>
        <ambientLight intensity={0.9} />
        <directionalLight position={[3, 6, 4]} intensity={0.8} />
        {showGround && (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
            <planeGeometry args={[20, 20]} />
            <meshStandardMaterial color="#64748b" />
          </mesh>
        )}
        {[-1.5, 0, 1.5].map((x, i) => (
          <mesh key={i} position={[x, 0.6, 0]}>
            <boxGeometry args={[0.8, 1, 0.8]} />
            <meshStandardMaterial color="#22c55e" />
          </mesh>
        ))}
        {on && (
          <ContactShadows position={[0, 0.02, 0]} scale={20} far={6} blur={2.4} opacity={1} resolution={1024} color="#000000" />
        )}
        <OrbitControls />
      </Canvas>
    </div>
  );
}
