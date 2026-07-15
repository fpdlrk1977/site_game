'use client';

import { Suspense, useMemo } from 'react';
import { MeshReflectorMaterial, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { getGroundTexture } from '@/lib/groundTextures';
import type { GroundPreset } from '@/types/scene';

// ── 물 (실시간 반사) ──────────────────────────────────────────────────────────
function WaterPlane({ positionY }: { positionY: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, positionY, 0]}>
      <planeGeometry args={[1000, 1000]} />
      <MeshReflectorMaterial
        blur={[256, 64]}
        resolution={512}
        mixBlur={0.9}
        mixStrength={45}
        roughness={0.25}
        depthScale={1.2}
        minDepthThreshold={0.4}
        maxDepthThreshold={1.4}
        color="#1565a8"
        metalness={0.6}
      />
    </mesh>
  );
}

// ── 텍스처 바닥 ───────────────────────────────────────────────────────────────
function TexturedGround({ preset, positionY }: { preset: Exclude<GroundPreset, 'custom' | 'color' | 'texture' | 'water'>; positionY: number }) {
  const { map, normalMap, roughness, metalness } = useMemo(
    () => getGroundTexture(preset),
    [preset],
  );

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, positionY, 0]} receiveShadow>
      <planeGeometry args={[1000, 1000]} />
      <meshStandardMaterial
        map={map}
        normalMap={normalMap}
        normalScale={new THREE.Vector2(1, 1)}
        roughness={roughness}
        metalness={metalness}
      />
    </mesh>
  );
}

// ── 유저 업로드 텍스처 바닥 ───────────────────────────────────────────────────
function UrlTextureGround({ url, positionY }: { url: string; positionY: number }) {
  const texture = useTexture(url);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(200, 200);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, positionY, 0]} receiveShadow>
      <planeGeometry args={[1000, 1000]} />
      <meshStandardMaterial map={texture} roughness={0.85} metalness={0} />
    </mesh>
  );
}

// ── Public component ──────────────────────────────────────────────────────────
interface Props {
  preset?: GroundPreset;
  color: string;
  textureUrl?: string;
  positionY?: number;
}

export function GroundPlane({ preset = 'custom', color, textureUrl, positionY = 0 }: Props) {
  if (preset === 'water') return <WaterPlane positionY={positionY} />;

  // color=단색 / texture=이미지 / custom(레거시)=textureUrl 있으면 이미지, 없으면 단색.
  if (preset === 'custom' || preset === 'color' || preset === 'texture') {
    const useTexture = preset !== 'color' && !!textureUrl;
    if (useTexture) {
      return (
        <Suspense fallback={
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, positionY, 0]} receiveShadow>
            <planeGeometry args={[1000, 1000]} />
            <meshStandardMaterial color={color} roughness={0.9} metalness={0} />
          </mesh>
        }>
          <UrlTextureGround url={textureUrl} positionY={positionY} />
        </Suspense>
      );
    }
    return (
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, positionY, 0]} receiveShadow>
        <planeGeometry args={[1000, 1000]} />
        <meshStandardMaterial color={color} roughness={0.9} metalness={0} />
      </mesh>
    );
  }

  return <TexturedGround preset={preset} positionY={positionY} />;
}
