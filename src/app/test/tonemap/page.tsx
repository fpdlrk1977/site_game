'use client';

/**
 * 톤매핑 색 정확도 A/B 검증 페이지.
 * ?tm=aces|neutral|none 으로 톤매핑을 바꿔가며, 저장 색(albedo)이 화면에 얼마나
 * 그대로 나오는지 픽셀 샘플링으로 비교한다.
 *
 * 조명은 ambient 1.0만(IBL/그림자/방향광 없음) → 정면 스탠다드 재질의 렌더 색이
 * 대략 albedo에 수렴하므로, 남는 차이는 순수하게 '톤매핑'의 기여분이다.
 */

import { Suspense } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import * as THREE from 'three';
import { DefaultEnvironment } from '@/components/three/DefaultEnvironment';

const SWATCHES = [
  { id: 'green', color: '#226155', x: -2.2 },
  { id: 'red', color: '#8a1f2b', x: 0 },
  { id: 'blue', color: '#1f3d8a', x: 2.2 },
];

function ToneMap({ mode, exposure }: { mode: string; exposure: number }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.toneMapping =
      mode === 'aces' ? THREE.ACESFilmicToneMapping
      : mode === 'none' ? THREE.NoToneMapping
      : mode === 'linear' ? THREE.LinearToneMapping
      : THREE.NeutralToneMapping;
    gl.toneMappingExposure = exposure;
  }, [gl, mode, exposure]);
  return null;
}

export default function ToneMapTestPage() {
  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const mode = params.get('tm') ?? 'neutral';
  // ?lit=real → 실제 에디터/뷰어 조명 리그(IBL+방향광+ambient) 재현. 기본은 flat.
  const real = params.get('lit') === 'real';
  const exposure = parseFloat(params.get('exp') ?? '1') || 1;

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#000' }}>
      <Canvas camera={{ position: [0, 0, 6], fov: 50 }} gl={{ toneMapping: THREE.NeutralToneMapping, preserveDrawingBuffer: true }}>
        <ToneMap mode={mode} exposure={exposure} />
        {real ? (
          // 실제 씬 조명과 동일 계열: IBL + ambient(저장×0.5) + 방향광 정면
          <>
            <Suspense fallback={null}><DefaultEnvironment /></Suspense>
            <ambientLight intensity={0.3} />
            <directionalLight position={[0, 0, 6]} intensity={1.4} />
          </>
        ) : (
          // flat: 톤매핑 자체만 격리 비교
          <ambientLight intensity={3.4} />
        )}
        <Suspense fallback={null}>
          {SWATCHES.map((s) => (
            <mesh key={s.id} position={[s.x, 0, 0]}>
              <planeGeometry args={[1.8, 3]} />
              <meshStandardMaterial color={s.color} roughness={1} metalness={0} />
            </mesh>
          ))}
        </Suspense>
      </Canvas>
    </div>
  );
}
