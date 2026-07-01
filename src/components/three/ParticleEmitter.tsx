'use client';

import { useRef, useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { ParticleConfig } from '@/types/scene';

interface Particle {
  life: number;
  maxLife: number;
  vx: number;
  vy: number;
  vz: number;
}

const PRESETS: Record<string, Partial<ParticleConfig>> = {
  fire:  { count: 120, color: '#ff6b35', speed: 1.8, spread: 0.4, size: 0.12 },
  dust:  { count: 80,  color: '#a0a0a0', speed: 0.4, spread: 1.2, size: 0.06 },
  light: { count: 60,  color: '#ffffc0', speed: 0.8, spread: 0.8, size: 0.08 },
  snow:  { count: 100, color: '#ddeeff', speed: 0.5, spread: 1.6, size: 0.05 },
};

interface Props {
  config: ParticleConfig;
  position?: [number, number, number];
}

export function ParticleEmitter({ config, position = [0, 0, 0] }: Props) {
  const pointsRef = useRef<THREE.Points>(null);
  const preset = PRESETS[config.preset] ?? PRESETS.dust;

  const count  = config.count  ?? preset.count  ?? 80;
  const speed  = config.speed  ?? preset.speed  ?? 0.8;
  const spread = config.spread ?? preset.spread ?? 1.0;
  const size   = config.size   ?? preset.size   ?? 0.08;
  const color  = config.color  ?? preset.color  ?? '#ffffff';

  const particles = useMemo<Particle[]>(() => {
    return Array.from({ length: count }, () => ({
      life: Math.random(),
      maxLife: 0.6 + Math.random() * 0.8,
      vx: (Math.random() - 0.5) * spread * speed,
      vy: (0.3 + Math.random() * 0.7) * speed,
      vz: (Math.random() - 0.5) * spread * speed,
    }));
  }, [count, speed, spread]);

  const positions = useMemo(() => new Float32Array(count * 3), [count]);
  const alphas    = useMemo(() => new Float32Array(count), [count]);

  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('alpha',    new THREE.BufferAttribute(alphas, 1));
    return g;
  }, [positions, alphas]);

  const mat = useMemo(() => new THREE.PointsMaterial({
    color,
    size,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), [color, size]);

  useEffect(() => {
    return () => { geo.dispose(); mat.dispose(); };
  }, [geo, mat]);

  useFrame((_state, delta) => {
    const dt = Math.min(delta, 0.05);
    for (let i = 0; i < count; i++) {
      const p = particles[i];
      p.life += dt / p.maxLife;
      if (p.life >= 1) {
        p.life = 0;
        p.vx = (Math.random() - 0.5) * spread * speed;
        p.vy = (0.3 + Math.random() * 0.7) * speed;
        p.vz = (Math.random() - 0.5) * spread * speed;
        positions[i * 3]     = (Math.random() - 0.5) * 0.2;
        positions[i * 3 + 1] = 0;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 0.2;
      } else {
        positions[i * 3]     += p.vx * dt;
        positions[i * 3 + 1] += p.vy * dt;
        positions[i * 3 + 2] += p.vz * dt;
      }
      // fade out near end of life
      alphas[i] = p.life < 0.8 ? 1 : (1 - p.life) / 0.2;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.alpha.needsUpdate = true;
  });

  return <points ref={pointsRef} geometry={geo} material={mat} position={position} />;
}
