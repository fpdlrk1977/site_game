'use client';

import { Suspense, useMemo, useEffect } from 'react';
import { MeshReflectorMaterial, useTexture } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { getGroundTexture } from '@/lib/groundTextures';
import type { GroundPreset } from '@/types/scene';

// 바닥의 환경광 반사 세기 — 낮춰 평평한 바닥에 뜨는 넓은 radial 하이라이트("스포트라이트 같은 흰 빛")를 완화.
//   오브젝트는 그대로(각 재질 기본 1) 두고 바닥만 억제. (scene.environmentIntensity와 곱해짐)
const GROUND_ENV = 0.3;

// 무한 바닥 크기 — 아주 큰 정적 평면(가장자리가 far plane 밖이라 절대 안 보임 = 사실상 무한).
const INFINITE_SIZE = 20000;
const NORMAL_SIZE = 1000;
const INFINITE_FAR = 8000; // 무한 모드 시야 거리(먼 오브젝트까지 렌더)

// 무한 모드에서 카메라 far plane을 넓혀 먼 오브젝트/바닥 끝이 안 잘리게. 끄면 원복.
function FarPlane() {
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    const prev = (camera as THREE.PerspectiveCamera).far;
    if (prev < INFINITE_FAR) {
      (camera as THREE.PerspectiveCamera).far = INFINITE_FAR;
      camera.updateProjectionMatrix();
    }
    return () => {
      (camera as THREE.PerspectiveCamera).far = prev;
      camera.updateProjectionMatrix();
    };
  }, [camera]);
  return null;
}

// 캐시된 프리셋 텍스처를 크기에 맞춰 클론+반복 스케일(캐시 오염 방지). scale=1이면 원본 그대로.
function useScaledTex(map: THREE.Texture, normalMap: THREE.Texture, scale: number) {
  const cloned = useMemo(() => {
    if (scale === 1) return null;
    const m = map.clone(); m.needsUpdate = true; m.repeat.multiplyScalar(scale);
    const n = normalMap.clone(); n.needsUpdate = true; n.repeat.multiplyScalar(scale);
    return { m, n };
  }, [map, normalMap, scale]);
  useEffect(() => () => { cloned?.m.dispose(); cloned?.n.dispose(); }, [cloned]);
  return cloned ? { map: cloned.m, normalMap: cloned.n } : { map, normalMap };
}

// ── 물 (실시간 반사) ──────────────────────────────────────────────────────────
function WaterPlane({ positionY, size }: { positionY: number; size: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, positionY, 0]}>
      <planeGeometry args={[size, size]} />
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
function TexturedGround({ preset, positionY, size, repeatScale }: { preset: Exclude<GroundPreset, 'custom' | 'color' | 'texture' | 'water'>; positionY: number; size: number; repeatScale: number }) {
  const base = useMemo(() => getGroundTexture(preset), [preset]);
  const { map, normalMap } = useScaledTex(base.map, base.normalMap, repeatScale);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, positionY, 0]} receiveShadow>
      <planeGeometry args={[size, size]} />
      <meshStandardMaterial
        map={map}
        normalMap={normalMap}
        normalScale={new THREE.Vector2(1, 1)}
        roughness={base.roughness}
        metalness={base.metalness}
        envMapIntensity={GROUND_ENV}
      />
    </mesh>
  );
}

// ── 유저 업로드 텍스처 바닥 ───────────────────────────────────────────────────
function UrlTextureGround({ url, positionY, size, repeatScale }: { url: string; positionY: number; size: number; repeatScale: number }) {
  const texture = useTexture(url);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(200 * repeatScale, 200 * repeatScale);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, positionY, 0]} receiveShadow>
      <planeGeometry args={[size, size]} />
      <meshStandardMaterial map={texture} roughness={0.85} metalness={0} envMapIntensity={GROUND_ENV} />
    </mesh>
  );
}

// ── Public component ──────────────────────────────────────────────────────────
interface Props {
  preset?: GroundPreset;
  color: string;
  textureUrl?: string;
  positionY?: number;
  infinite?: boolean;
}

export function GroundPlane({ preset = 'custom', color, textureUrl, positionY = 0, infinite = false }: Props) {
  const size = infinite ? INFINITE_SIZE : NORMAL_SIZE;
  const repeatScale = infinite ? INFINITE_SIZE / NORMAL_SIZE : 1; // 타일 밀도 유지

  const content = (() => {
    if (preset === 'water') return <WaterPlane positionY={positionY} size={size} />;

    // color=단색 / texture=이미지 / custom(레거시)=textureUrl 있으면 이미지, 없으면 단색.
    if (preset === 'custom' || preset === 'color' || preset === 'texture') {
      const useTex = preset !== 'color' && !!textureUrl;
      if (useTex) {
        return (
          <Suspense fallback={
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, positionY, 0]} receiveShadow>
              <planeGeometry args={[size, size]} />
              <meshStandardMaterial color={color} roughness={0.9} metalness={0} envMapIntensity={GROUND_ENV} />
            </mesh>
          }>
            <UrlTextureGround url={textureUrl} positionY={positionY} size={size} repeatScale={repeatScale} />
          </Suspense>
        );
      }
      return (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, positionY, 0]} receiveShadow>
          <planeGeometry args={[size, size]} />
          <meshStandardMaterial color={color} roughness={0.9} metalness={0} envMapIntensity={GROUND_ENV} />
        </mesh>
      );
    }

    return <TexturedGround preset={preset} positionY={positionY} size={size} repeatScale={repeatScale} />;
  })();

  return (
    <>
      {content}
      {infinite && <FarPlane />}
    </>
  );
}
