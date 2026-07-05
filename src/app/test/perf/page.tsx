'use client';

/**
 * 플레이 모드 성능 측정 페이지 (진단용 — 실제 씬 JSON을 public/__perf_scene.json에서 로드)
 * 쿼리 토글: ?shadows=off | ?post=0 | ?ground=0
 * window.__getPerf() → { fps, avgMs, p95Ms, longFrames }
 */

import { useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Suspense } from 'react';
import { PlayCanvas } from '@/app/space/[sceneId]/PlayCanvas';
import { GroundPlane } from '@/components/three/GroundPlane';
import { PostProcessingEffects } from '@/components/three/PostProcessingEffects';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import type { ProjectSceneSchema } from '@/types/scene';

declare global {
  interface Window { __getPerf?: () => unknown }
}

export default function PerfTestPage() {
  const [scene, setScene] = useState<ProjectSceneSchema | null>(null);
  const [shadows, setShadows] = useState<'percentage' | false>('percentage');
  const [msaa0, setMsaa0] = useState(false);
  const azimuthRef = useRef(0);
  const mobileInputRef = useRef({ fwd: 1, strafe: 0, jump: false });

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    // rotate 모드: 제자리에서 카메라만 회전 (프러스텀 컬링 깜빡임 관찰용)
    if (q.get('mode') === 'rotate') {
      mobileInputRef.current.fwd = 0;
      const iv = setInterval(() => { azimuthRef.current += 0.05; }, 33);
      window.addEventListener('beforeunload', () => clearInterval(iv));
    }
    fetch('/__perf_scene.json')
      .then((r) => r.json())
      .then((d: ProjectSceneSchema) => {
        if (q.get('post') === '0') d.environment.postProcessing = { preset: 'none' };
        if (q.get('ground') === '0' && d.environment.ground) delete d.environment.ground.textureUrl;
        if (q.get('shadows') === 'off') setShadows(false);
        if (q.get('ms') === '0') setMsaa0(true);
        setScene(d);
      });
  }, []);

  // 프레임 타임 수집
  useEffect(() => {
    const frames: number[] = [];
    let last = performance.now();
    let raf = 0;
    const loop = (t: number) => { frames.push(t - last); last = t; raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    window.__getPerf = () => {
      const arr = frames.slice(120); // 워밍업 제외
      if (arr.length === 0) return null;
      const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
      const sorted = [...arr].sort((a, b) => a - b);
      return {
        fps: Math.round(1000 / avg * 10) / 10,
        avgMs: Math.round(avg * 10) / 10,
        p95Ms: Math.round(sorted[Math.floor(sorted.length * 0.95)] * 10) / 10,
        longFrames: arr.filter((x) => x > 50).length,
        n: arr.length,
      };
    };
    return () => cancelAnimationFrame(raf);
  }, []);

  if (!scene) return <div>씬 로딩...</div>;
  const env = scene.environment;

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <Canvas shadows={shadows === 'percentage' ? 'percentage' : false} camera={{ position: [5, 4, 8], fov: 60 }}>
        <color attach="background" args={[env.sky.type === 'color' ? env.sky.value : '#1a1a2e']} />
        <hemisphereLight args={['#b9d5ff', '#4a5568', 0.2]} />
        <ambientLight intensity={env.lights.ambientIntensity} />
        <directionalLight
          position={[env.lights.directionalPosition.x, env.lights.directionalPosition.y, env.lights.directionalPosition.z]}
          intensity={env.lights.directionalIntensity}
          castShadow={shadows === 'percentage'}
          shadow-mapSize={[1024, 1024]}
        />
        {env.ground?.enabled && (
          <GroundPlane
            preset={env.ground.preset ?? 'custom'}
            color={env.ground.color}
            textureUrl={env.ground.textureUrl}
            positionY={0}
          />
        )}
        <Suspense fallback={null}>
          <PlayCanvas
            scene={scene}
            azimuthRef={azimuthRef}
            onObjectClick={(obj, trigger) => console.log('[PERF-TEST] event', trigger, obj.name)}
            mobileInputRef={mobileInputRef}
          />
        </Suspense>
        {msaa0 ? (
          // sharp 프리셋과 동일하되 multisampling=0 (기본 8x MSAA 비용 측정용)
          <EffectComposer multisampling={0}>
            <Bloom luminanceThreshold={0.92} luminanceSmoothing={0.05} intensity={0.25} mipmapBlur />
            <Vignette darkness={0.25} offset={0.45} />
          </EffectComposer>
        ) : (
          <PostProcessingEffects preset={env.postProcessing?.preset ?? 'none'} />
        )}
      </Canvas>
    </div>
  );
}
