'use client';

// 놓을 면의 격자 가이드 — 기준: doc/BRICK_SYSTEM.md §4.4
//
// ★ 왜 필요한가: 돌기(스터드)는 장식이 아니라 **격자를 눈에 보이게 하는 장치**였다.
//   돌기를 없애면 "다음 브릭이 어디 붙지?"를 알 수 없게 된다(사용자 피드백).
//   → 브릭이 앉을 높이에 격자를 띄워 돌기가 하던 역할을 대신한다.
//
// 커서를 따라다니는 작은 판 하나(삼각형 2개)이고, 선은 픽셀 단계에서만 그린다.
// 선 두께는 화면 미분(fwidth) 기준이라 **확대해도 굵어지지 않고 축소해도 사라지지 않는다.**

import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { CELL_X, CELL_Y, CELL_Z } from '@/lib/brick/grid';
// (파츠 크기는 anchorCenterWorld가 이미 반영한다)
import { anchorCenterWorld, type Anchor } from '@/lib/brick/placement';
import type { PartId } from '@/lib/brick/parts';
import type { Rot } from '@/lib/brick/grid';

/** 격자를 보여줄 반경(m). 너무 넓으면 지저분하고 좁으면 도움이 안 된다 */
const RADIUS = 2.6;

const VERT = /* glsl */ `
  varying vec3 vW;
  varying vec2 vLocal;
  void main() {
    vLocal = position.xy;                       // 판 로컬 좌표(가장자리 페이드용)
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vW = wp.xyz;                                // 월드 좌표 — 격자를 실제 셀에 맞춘다
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const FRAG = /* glsl */ `
  uniform vec2 uCell;
  uniform float uRadius;
  uniform vec3 uColor;
  varying vec3 vW;
  varying vec2 vLocal;
  void main() {
    // 가장 가까운 격자선까지의 월드 거리
    vec2 g = vec2(vW.x / uCell.x, vW.z / uCell.y);
    vec2 fr = fract(g);
    vec2 d2 = min(fr, 1.0 - fr) * uCell;
    float dist = min(d2.x, d2.y);

    // 화면 기준 두께 — 확대/축소에 일정
    float w = fwidth(dist);
    float line = 1.0 - smoothstep(0.0, w * 1.5, dist);

    // 가장자리로 갈수록 사라지게(하드컷 방지) + 너무 멀면 격자 자체를 지움(모아레 방지)
    float edgeFade = 1.0 - smoothstep(uRadius * 0.45, uRadius, length(vLocal));
    float farFade = 1.0 - smoothstep(0.10, 0.25, w);

    float a = line * edgeFade * farFade * 0.5;
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor, a);
  }
`;

interface Props {
  anchor: Anchor | null;
  part: PartId;
  rot: Rot;
}

export function PlacementGrid({ anchor, part, rot }: Props) {
  const ref = useRef<THREE.Mesh>(null);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: {
          uCell: { value: new THREE.Vector2(CELL_X, CELL_Z) },
          uRadius: { value: RADIUS },
          uColor: { value: new THREE.Color('#9ecbff') },
        },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    [],
  );

  // 커서를 매끄럽게 따라다니게(리렌더 없이 위치만 갱신).
  // 높이는 브릭이 앉을 **밑면**(anchor.y) — 그 면에 격자가 깔려야 어디 붙는지 보인다.
  useFrame(() => {
    const m = ref.current;
    if (!m || !anchor) return;
    const [cx, , cz] = anchorCenterWorld(anchor, part, rot);
    m.position.set(cx, anchor.y * CELL_Y + 0.004, cz);
  });

  if (!anchor) return null;

  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} material={material} raycast={() => null} renderOrder={2}>
      <planeGeometry args={[RADIUS * 2, RADIUS * 2]} />
    </mesh>
  );
}
