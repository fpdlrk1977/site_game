'use client';

/**
 * 둥근 박스 직사각형 모서리 균일화 디버그 페이지.
 * 직사각형 스케일(3,1,1)에 cornerRadius를 준 박스를 3가지 방식으로 렌더해 비교한다.
 *  - 좌(빨강 라벨): 기존 방식 = 단위 둥근박스 geom + group scale (3,1,1) → 모서리 타원 왜곡(원 문제)
 *  - 중(초록): 실치수 geom(3,1,1) + 메쉬 역스케일[1/3,1,1] + group scale 프롭(3,1,1) [선언형]
 *  - 우(파랑): 실치수 geom + 메쉬 역스케일 + group scale 명령형(useLayoutEffect ref) [EditorObjectInstance와 동일]
 * 중/우가 균일 모서리로 같은 크기(3,1,1)면 접근법 정상. 우만 얇은 판이면 명령형 타이밍이 원인.
 */

import { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const CR = 0.4;
// 여러 스케일 케이스 — 새 방식(명령형)이 어떤 비율에서도 얇아지지 않는지 검증
const CASES: { s: [number, number, number]; label: string }[] = [
  { s: [1, 1, 1], label: 'cube' },
  { s: [3, 1, 1], label: '3x1x1' },
  { s: [3, 0.15, 3], label: 'flat plate' },
  { s: [0.3, 1.5, 3], label: '0.3x1.5x3' },
];

// 실치수 둥근박스 — 짧은 변 기준 절대 반경
function dimsGeom(s: [number, number, number]) {
  const [w, h, d] = s;
  const rMax = Math.min(w, h, d) / 2;
  const r = Math.min(CR * Math.min(w, h, d), rMax * 0.999);
  return new RoundedBoxGeometry(w, h, d, 4, r);
}

function Mat({ color }: { color: string }) {
  return <meshStandardMaterial color={color} roughness={0.5} metalness={0.1} />;
}

// 명령형: group scale을 useLayoutEffect로 (EditorObjectInstance와 동일 구조) + 메쉬 역스케일
function NewImpBox({ x, s, color }: { x: number; s: [number, number, number]; color: string }) {
  const ref = useRef<THREE.Group>(null);
  const sx = Math.max(0.001, s[0]), sy = Math.max(0.001, s[1]), sz = Math.max(0.001, s[2]);
  useLayoutEffect(() => {
    const g = ref.current;
    if (!g) return;
    g.position.set(x, 1, 0);
    g.scale.set(s[0], s[1], s[2]);
  }, [x, s]);
  return (
    <group ref={ref}>
      <mesh geometry={dimsGeom(s)} scale={[1 / sx, 1 / sy, 1 / sz]}><Mat color={color} /></mesh>
    </group>
  );
}

export default function RoundedBoxTestPage() {
  const colors = ['#22c55e', '#3b82f6', '#eab308', '#ec4899'];
  return (
    <div style={{ width: '100vw', height: '100vh', background: '#0b0b12' }}>
      <div style={{ position: 'absolute', zIndex: 1, color: '#fff', font: '13px monospace', padding: 10 }}>
        새 방식(명령형) 여러 스케일: cube · 3x1x1 · flat plate(3,0.15,3) · 0.3x1.5x3. 어떤 것도 얇은 판으로 붕괴 안 되어야 함.
      </div>
      <Canvas camera={{ position: [0, 7, 12], fov: 45 }} gl={{ preserveDrawingBuffer: true }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 10, 7]} intensity={1.2} />
        <Grid args={[40, 40]} cellColor="#334155" sectionColor="#475569" infiniteGrid fadeDistance={50} />
        {CASES.map((c, i) => (
          <NewImpBox key={c.label} x={(i - 1.5) * 4.5} s={c.s} color={colors[i]} />
        ))}
        <OrbitControls />
      </Canvas>
    </div>
  );
}
