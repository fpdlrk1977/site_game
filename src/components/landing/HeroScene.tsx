'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { Float, RoundedBox } from '@react-three/drei';
import { useRef, useMemo } from 'react';
import * as THREE from 'three';

/**
 * 랜딩 히어로용 경량 R3F 씬 — 우리 3D 엔진으로 마케팅을 렌더("제품으로 만든 마케팅").
 * 후처리·물리 없음. 부드럽게 자유부유 + 천천히 자전. reduced-motion이면 정지.
 */
function Shapes() {
  const group = useRef<THREE.Group>(null);
  const reduce = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  useFrame((_, dt) => {
    if (group.current && !reduce) group.current.rotation.y += dt * 0.18;
  });

  return (
    <group ref={group}>
      {/* 중앙 라운드 박스 — 바이올렛, 살짝 메탈 */}
      <Float speed={reduce ? 0 : 1.4} rotationIntensity={0.5} floatIntensity={0.9}>
        <RoundedBox args={[1.5, 1.5, 1.5]} radius={0.22} smoothness={6} position={[0, 0.1, 0]}>
          <meshStandardMaterial color="#7c5cff" metalness={0.35} roughness={0.25} />
        </RoundedBox>
      </Float>

      {/* 시안 구 */}
      <Float speed={reduce ? 0 : 2.1} rotationIntensity={0.6} floatIntensity={1.2}>
        <mesh position={[1.9, 0.9, -0.4]}>
          <sphereGeometry args={[0.55, 48, 48]} />
          <meshStandardMaterial color="#39d0ea" metalness={0.5} roughness={0.15} />
        </mesh>
      </Float>

      {/* 핑크 토러스 */}
      <Float speed={reduce ? 0 : 1.7} rotationIntensity={1} floatIntensity={1}>
        <mesh position={[-1.9, -0.7, -0.2]} rotation={[0.6, 0.3, 0]}>
          <torusGeometry args={[0.5, 0.19, 24, 80]} />
          <meshStandardMaterial color="#ff7ac0" metalness={0.3} roughness={0.3} />
        </mesh>
      </Float>

      {/* 발광 아이코사 */}
      <Float speed={reduce ? 0 : 2.4} rotationIntensity={1.2} floatIntensity={1.4}>
        <mesh position={[1.4, -1.1, 0.6]}>
          <icosahedronGeometry args={[0.42, 0]} />
          <meshStandardMaterial color="#6a4dff" emissive="#6a4dff" emissiveIntensity={0.5} roughness={0.4} />
        </mesh>
      </Float>

      {/* 작은 시안 캡슐 */}
      <Float speed={reduce ? 0 : 1.9} rotationIntensity={0.8} floatIntensity={1.1}>
        <mesh position={[-1.5, 1.2, 0.4]} rotation={[0.4, 0, 0.5]}>
          <capsuleGeometry args={[0.18, 0.4, 8, 20]} />
          <meshStandardMaterial color="#39d0ea" emissive="#0a6f88" emissiveIntensity={0.3} metalness={0.4} roughness={0.2} />
        </mesh>
      </Float>
    </group>
  );
}

export default function HeroScene() {
  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [0, 0, 6], fov: 38 }}
      gl={{ antialias: true, alpha: true }}
      style={{ width: '100%', height: '100%' }}
    >
      <ambientLight intensity={0.7} />
      <directionalLight position={[4, 6, 5]} intensity={2.2} color="#ffffff" />
      <directionalLight position={[-5, -2, 2]} intensity={0.8} color="#8b78ff" />
      <pointLight position={[0, 0, 4]} intensity={1.2} color="#39d0ea" distance={12} />
      <Shapes />
    </Canvas>
  );
}
