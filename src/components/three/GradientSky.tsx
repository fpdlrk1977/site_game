'use client';

// 그라데이션 하늘 — 천정 색에서 수평선 색으로 부드럽게 이어지는 배경 구(球).
//
// 왜 만들었나(2026-07-20): 배경을 HDRI 파노라마 사진(`<Environment background />`)으로 깔고 있었는데
//   ①실사 사진이라 "따다 붙인 느낌"이고 ②사진에 구워진 지평선이 우리 바닥판(y=0)과 안 맞아 하드컷이 생기고
//   ③납작한 스타일라이즈드 바닥과 톤이 충돌했다. 요즘 3D 툴(Spline 등)은 HDRI를 조명/반사로만 쓰고
//   배경은 그라데이션으로 그린다 → 이 컴포넌트가 그 배경 담당.
//
// 구현 노트: 셰이더 대신 **1D CanvasTexture 램프**를 구에 입힌다(PrimitiveMaterial 그라데이션과 같은 패턴).
//   ShaderMaterial로 직접 그리면 색공간(colorspace_fragment) 처리를 손으로 해야 해 색이 틀어지기 쉬운데,
//   텍스처는 three가 SRGBColorSpace로 알아서 변환해준다.
import { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const RADIUS = 400;

export function GradientSky({ top, horizon }: { top: string; horizon: string }) {
  const ref = useRef<THREE.Mesh>(null);

  const texture = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 256;
    const ctx = c.getContext('2d')!;
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    // 캔버스 위(y=0)가 텍스처 v=1(구의 천정)에 대응한다(three 기본 flipY).
    g.addColorStop(0, top);
    g.addColorStop(1, horizon);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  }, [top, horizon]);

  useEffect(() => () => texture.dispose(), [texture]);

  // 카메라를 따라다녀 어디로 이동하든 항상 배경으로 남는다(구 밖으로 빠져나가는 것 방지).
  useFrame(({ camera }) => {
    ref.current?.position.copy(camera.position);
  });

  return (
    <mesh ref={ref} renderOrder={-1000} frustumCulled={false} raycast={() => null}>
      <sphereGeometry args={[RADIUS, 32, 16]} />
      {/* fog=false — 하늘은 fog가 수렴하는 '목적지'라 fog에 물들면 안 된다.
          toneMapped=false — 단색 배경(<color attach="background">)과 톤을 맞춘다. */}
      <meshBasicMaterial map={texture} side={THREE.BackSide} depthWrite={false} toneMapped={false} fog={false} />
    </mesh>
  );
}
