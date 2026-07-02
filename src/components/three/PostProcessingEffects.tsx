'use client';

import { EffectComposer, Bloom, Vignette, ChromaticAberration, Noise } from '@react-three/postprocessing';
import { Vector2 } from 'three';
import type { PostProcessPreset } from '@/types/scene';

interface Props {
  preset: PostProcessPreset;
}

export function PostProcessingEffects({ preset }: Props) {
  if (preset === 'none') return null;

  if (preset === 'cinematic') return (
    <EffectComposer>
      <Bloom luminanceThreshold={0.55} luminanceSmoothing={0.4} intensity={0.9} mipmapBlur />
      <Vignette darkness={0.6} offset={0.3} />
    </EffectComposer>
  );
  if (preset === 'dreamy') return (
    <EffectComposer>
      <Bloom luminanceThreshold={0.15} luminanceSmoothing={0.9} intensity={2.2} mipmapBlur />
      <ChromaticAberration offset={new Vector2(0.0025, 0.0025)} />
      <Vignette darkness={0.4} offset={0.45} />
    </EffectComposer>
  );
  if (preset === 'vintage') return (
    <EffectComposer>
      <Vignette darkness={0.85} offset={0.2} />
      <Noise opacity={0.14} />
    </EffectComposer>
  );
  if (preset === 'sharp') return (
    <EffectComposer>
      <Bloom luminanceThreshold={0.92} luminanceSmoothing={0.05} intensity={0.25} mipmapBlur />
      <Vignette darkness={0.25} offset={0.45} />
    </EffectComposer>
  );
  return null;
}
