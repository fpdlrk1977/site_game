'use client';

import { type ReactElement } from 'react';
import { EffectComposer, Bloom, Vignette, ChromaticAberration, Noise, N8AO, DepthOfField, BrightnessContrast, HueSaturation } from '@react-three/postprocessing';
import { Vector2 } from 'three';
import type { PostProcessPreset, EnvSchema } from '@/types/scene';

interface Props {
  preset: PostProcessPreset;
  effects?: EnvSchema['effects'];
}

// 개별 효과 하나라도 활성이면 프리셋 대신 이 조합으로 렌더. SSAO(N8AO)는 여기서만 제공.
function anyEffect(fx?: EnvSchema['effects']): boolean {
  if (!fx) return false;
  return !!(fx.ssao || fx.bloom || fx.vignette || fx.brightness || fx.contrast || fx.saturation || fx.dof);
}

export function PostProcessingEffects({ preset, effects }: Props) {
  const customActive = anyEffect(effects);
  if (!customActive && preset === 'none') return null;

  if (customActive) {
    const fx = effects!;
    // 활성 효과만 배열로 모아 전달(EffectComposer children은 Element만 허용 — null 불가).
    const children = [
      (fx.ssao ?? 0) > 0 ? <N8AO key="ssao" aoRadius={1.2} distanceFalloff={1} intensity={(fx.ssao ?? 0) * 8} /> : null,
      (fx.dof ?? 0) > 0 ? <DepthOfField key="dof" focusDistance={0.02} focalLength={0.04} bokehScale={(fx.dof ?? 0) * 8} /> : null,
      (fx.bloom ?? 0) > 0 ? <Bloom key="bloom" luminanceThreshold={0.5} luminanceSmoothing={0.4} intensity={fx.bloom ?? 0} mipmapBlur /> : null,
      ((fx.brightness ?? 0) !== 0 || (fx.contrast ?? 0) !== 0) ? <BrightnessContrast key="bc" brightness={fx.brightness ?? 0} contrast={fx.contrast ?? 0} /> : null,
      (fx.saturation ?? 0) !== 0 ? <HueSaturation key="hs" saturation={fx.saturation ?? 0} /> : null,
      (fx.vignette ?? 0) > 0 ? <Vignette key="vig" darkness={fx.vignette ?? 0} offset={0.35} /> : null,
    ].filter(Boolean) as ReactElement[];
    return <EffectComposer multisampling={0}>{children}</EffectComposer>;
  }

  // ── 프리셋 (기존 동작) ──
  if (preset === 'cinematic') return (
    <EffectComposer multisampling={0}>
      <Bloom luminanceThreshold={0.55} luminanceSmoothing={0.4} intensity={0.9} mipmapBlur />
      <Vignette darkness={0.6} offset={0.3} />
    </EffectComposer>
  );
  if (preset === 'dreamy') return (
    <EffectComposer multisampling={0}>
      <Bloom luminanceThreshold={0.15} luminanceSmoothing={0.9} intensity={2.2} mipmapBlur />
      <ChromaticAberration offset={new Vector2(0.0025, 0.0025)} />
      <Vignette darkness={0.4} offset={0.45} />
    </EffectComposer>
  );
  if (preset === 'vintage') return (
    <EffectComposer multisampling={0}>
      <Vignette darkness={0.85} offset={0.2} />
      <Noise opacity={0.14} />
    </EffectComposer>
  );
  if (preset === 'sharp') return (
    <EffectComposer multisampling={0}>
      <Bloom luminanceThreshold={0.92} luminanceSmoothing={0.05} intensity={0.25} mipmapBlur />
      <Vignette darkness={0.25} offset={0.45} />
    </EffectComposer>
  );
  return null;
}
