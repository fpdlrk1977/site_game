'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { Float, RoundedBox } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { useRef, useMemo } from 'react';
import * as THREE from 'three';

/**
 * 랜딩 히어로용 인터랙티브 R3F 씬 — 커서를 따라 움직이고 발광(Bloom)하는 오브젝트 클러스터.
 * 우리 3D 엔진으로 마케팅을 렌더("제품으로 만든 마케팅"). reduced-motion이면 정지.
 */
const REDUCE = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function Cluster() {
  const g = useRef<THREE.Group>(null);
  const reduce = useMemo(REDUCE, []);

  useFrame((state) => {
    const grp = g.current;
    if (!grp) return;
    const t = state.clock.elapsedTime;
    if (reduce) return;
    // 커서를 향해 부드럽게 기울고 + 천천히 자전
    const targetY = state.pointer.x * 0.55 + t * 0.06;
    const targetX = -state.pointer.y * 0.3;
    grp.rotation.y = THREE.MathUtils.lerp(grp.rotation.y, targetY, 0.045);
    grp.rotation.x = THREE.MathUtils.lerp(grp.rotation.x, targetX, 0.045);
  });

  return (
    <group ref={g}>
      <Float speed={reduce ? 0 : 1.3} rotationIntensity={0.5} floatIntensity={0.9}>
        <RoundedBox args={[1.6, 1.6, 1.6]} radius={0.24} smoothness={6} position={[0, 0.1, 0]}>
          <meshStandardMaterial color="#7c5cff" metalness={0.5} roughness={0.2} emissive="#5b3fe0" emissiveIntensity={0.35} />
        </RoundedBox>
      </Float>
      <Float speed={reduce ? 0 : 2} rotationIntensity={0.6} floatIntensity={1.2}>
        <mesh position={[2.1, 1, -0.4]}>
          <sphereGeometry args={[0.6, 64, 64]} />
          <meshStandardMaterial color="#39d0ea" metalness={0.6} roughness={0.12} emissive="#0e7f96" emissiveIntensity={0.5} />
        </mesh>
      </Float>
      <Float speed={reduce ? 0 : 1.7} rotationIntensity={1} floatIntensity={1}>
        <mesh position={[-2.1, -0.8, -0.2]} rotation={[0.6, 0.3, 0]}>
          <torusGeometry args={[0.55, 0.2, 32, 96]} />
          <meshStandardMaterial color="#ff7ac0" metalness={0.4} roughness={0.25} emissive="#c0407e" emissiveIntensity={0.55} />
        </mesh>
      </Float>
      <Float speed={reduce ? 0 : 2.4} rotationIntensity={1.2} floatIntensity={1.4}>
        <mesh position={[1.5, -1.2, 0.7]}>
          <icosahedronGeometry args={[0.46, 0]} />
          <meshStandardMaterial color="#6a4dff" emissive="#6a4dff" emissiveIntensity={0.9} roughness={0.35} />
        </mesh>
      </Float>
      <Float speed={reduce ? 0 : 1.9} rotationIntensity={0.8} floatIntensity={1.1}>
        <mesh position={[-1.6, 1.35, 0.4]} rotation={[0.4, 0, 0.5]}>
          <capsuleGeometry args={[0.2, 0.45, 12, 24]} />
          <meshStandardMaterial color="#39d0ea" emissive="#22b8d8" emissiveIntensity={0.7} metalness={0.4} roughness={0.18} />
        </mesh>
      </Float>
      <Float speed={reduce ? 0 : 2.2} rotationIntensity={1} floatIntensity={1.3}>
        <mesh position={[0.2, 1.9, -0.8]}>
          <dodecahedronGeometry args={[0.34, 0]} />
          <meshStandardMaterial color="#ffd36a" emissive="#e0a020" emissiveIntensity={0.6} metalness={0.5} roughness={0.3} />
        </mesh>
      </Float>
    </group>
  );
}

export default function HeroScene() {
  const reduce = useMemo(REDUCE, []);
  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [0, 0, 6.2], fov: 42 }}
      gl={{ antialias: true, alpha: true }}
      style={{ width: '100%', height: '100%' }}
    >
      <ambientLight intensity={0.6} />
      <directionalLight position={[4, 6, 5]} intensity={2.4} color="#ffffff" />
      <directionalLight position={[-6, -2, 2]} intensity={1} color="#8b78ff" />
      <pointLight position={[0, 0, 5]} intensity={1.6} color="#39d0ea" distance={16} />
      <pointLight position={[-4, 3, -2]} intensity={1.2} color="#ff7ac0" distance={14} />
      <Cluster />
      {!reduce && (
        <EffectComposer>
          <Bloom mipmapBlur intensity={0.9} luminanceThreshold={0.35} luminanceSmoothing={0.5} radius={0.75} />
        </EffectComposer>
      )}
    </Canvas>
  );
}
