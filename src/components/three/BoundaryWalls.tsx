'use client';

import * as THREE from 'three';
import { Suspense, useMemo } from 'react';
import { useTexture } from '@react-three/drei';
import type { EnvSchema } from '@/types/scene';

type WallCfg = NonNullable<EnvSchema['boundaryWall']>;

const TILE = 4; // 텍스처 1타일 = 월드 4유닛

// 벽 4면 — 각 면의 위치/회전/폭(가로). front/back은 폭 2·bx, left/right는 폭 2·bz. 높이 h, 중심 y=h/2
function wallTransforms(bx: number, bz: number, h: number) {
  return [
    { pos: [0, h / 2, -bz] as [number, number, number], rot: [0, 0, 0] as [number, number, number], w: bx * 2 },
    { pos: [0, h / 2, bz] as [number, number, number], rot: [0, Math.PI, 0] as [number, number, number], w: bx * 2 },
    { pos: [bx, h / 2, 0] as [number, number, number], rot: [0, -Math.PI / 2, 0] as [number, number, number], w: bz * 2 },
    { pos: [-bx, h / 2, 0] as [number, number, number], rot: [0, Math.PI / 2, 0] as [number, number, number], w: bz * 2 },
  ];
}

function ColorWalls({ bx, bz, h, color, opacity, ceiling }: {
  bx: number; bz: number; h: number; color: string; opacity: number; ceiling: boolean;
}) {
  const transparent = opacity < 1;
  return (
    <>
      {wallTransforms(bx, bz, h).map((w, i) => (
        <mesh key={i} position={w.pos} rotation={w.rot}>
          <planeGeometry args={[w.w, h]} />
          <meshStandardMaterial color={color} side={THREE.DoubleSide} transparent={transparent} opacity={opacity} roughness={0.92} metalness={0} />
        </mesh>
      ))}
      {ceiling && (
        <mesh position={[0, h, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <planeGeometry args={[bx * 2, bz * 2]} />
          <meshStandardMaterial color={color} side={THREE.DoubleSide} transparent={transparent} opacity={opacity} roughness={0.92} metalness={0} />
        </mesh>
      )}
    </>
  );
}

// 폭별 반복이 다르므로 텍스처를 복제해 repeat를 따로 설정
function useRepeatTexture(base: THREE.Texture, rx: number, ry: number) {
  return useMemo(() => {
    const t = base.clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    t.needsUpdate = true;
    return t;
  }, [base, rx, ry]);
}

function TexturedWalls({ bx, bz, h, url, opacity, ceiling }: {
  bx: number; bz: number; h: number; url: string; opacity: number; ceiling: boolean;
}) {
  const tex = useTexture(url);
  const transparent = opacity < 1;
  const texX = useRepeatTexture(tex, (bx * 2) / TILE, h / TILE);   // front/back 벽
  const texZ = useRepeatTexture(tex, (bz * 2) / TILE, h / TILE);   // left/right 벽
  const texCeil = useRepeatTexture(tex, (bx * 2) / TILE, (bz * 2) / TILE);

  const walls = wallTransforms(bx, bz, h);
  return (
    <>
      {walls.map((w, i) => (
        <mesh key={i} position={w.pos} rotation={w.rot}>
          <planeGeometry args={[w.w, h]} />
          <meshStandardMaterial map={i < 2 ? texX : texZ} side={THREE.DoubleSide} transparent={transparent} opacity={opacity} roughness={0.92} metalness={0} />
        </mesh>
      ))}
      {ceiling && (
        <mesh position={[0, h, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <planeGeometry args={[bx * 2, bz * 2]} />
          <meshStandardMaterial map={texCeil} side={THREE.DoubleSide} transparent={transparent} opacity={opacity} roughness={0.92} metalness={0} />
        </mesh>
      )}
    </>
  );
}

/**
 * 경계 벽 시각(직사각 지원) — 에디터·뷰어 공유. 스타일 none이면 안 그림(충돌만).
 * editor=true면 편집을 가리지 않게 불투명도를 낮춰 미리보기.
 */
export function BoundaryWalls({ sizeX, sizeZ, config, editor = false }: {
  sizeX: number;
  sizeZ: number;
  config: WallCfg;
  editor?: boolean;
}) {
  const style = config.style ?? 'none';
  if (style === 'none' || sizeX <= 0 || sizeZ <= 0) return null;
  const h = Math.max(0.5, config.height ?? 8);
  const opacity = Math.max(0.05, Math.min(1, (config.opacity ?? 1) * (editor ? 0.5 : 1)));
  const ceiling = config.ceiling === true;

  if (style === 'texture' && config.textureUrl) {
    return (
      <Suspense fallback={null}>
        <TexturedWalls bx={sizeX} bz={sizeZ} h={h} url={config.textureUrl} opacity={opacity} ceiling={ceiling} />
      </Suspense>
    );
  }
  return <ColorWalls bx={sizeX} bz={sizeZ} h={h} color={config.color ?? '#8899aa'} opacity={opacity} ceiling={ceiling} />;
}
