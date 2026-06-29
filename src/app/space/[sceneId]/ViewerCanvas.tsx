'use client';

import { useRef, Suspense, lazy } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import type { ProjectSceneSchema, ObjectNodeSchema, EventSchema } from '@/types/scene';
import { ViewerObject } from './ViewerObject';

const PlayCanvas = lazy(() => import('./PlayCanvas').then((m) => ({ default: m.PlayCanvas })));

interface Props {
  scene: ProjectSceneSchema;
  playMode: boolean;
  onObjectClick: (obj: ObjectNodeSchema, trigger: EventSchema['trigger']) => void;
}

export function ViewerCanvas({ scene, playMode, onObjectClick }: Props) {
  const { environment, objects } = scene;
  const skyColor = environment.sky.type === 'color' ? environment.sky.value : '#1a1a2e';
  const azimuthRef = useRef(0);

  return (
    <Canvas
      shadows="soft"
      camera={{ position: [5, 4, 8], fov: 60 }}
      style={{ width: '100%', height: '100%' }}
    >
      <color attach="background" args={[skyColor]} />

      {environment.fog.enabled && (
        <fog attach="fog" args={[environment.fog.color, environment.fog.near, environment.fog.far]} />
      )}

      <ambientLight intensity={environment.lights.ambientIntensity} />
      <directionalLight
        position={[
          environment.lights.directionalPosition.x,
          environment.lights.directionalPosition.y,
          environment.lights.directionalPosition.z,
        ]}
        intensity={environment.lights.directionalIntensity}
        castShadow
        shadow-mapSize={[2048, 2048]}
      />

      <Grid
        position={[0, 0, 0]}
        cellSize={1}
        cellThickness={0.3}
        cellColor="#27272a"
        sectionSize={5}
        sectionThickness={0.6}
        sectionColor="#3f3f46"
        fadeDistance={60}
        fadeStrength={1.5}
        infiniteGrid
      />

      {!playMode && objects.map((obj) => (
        <ViewerObject key={obj.id} object={obj} assets={scene.assets ?? []} onEvent={onObjectClick} />
      ))}

      {playMode && (
        <Suspense fallback={null}>
          <PlayCanvas scene={scene} azimuthRef={azimuthRef} onObjectClick={onObjectClick} />
        </Suspense>
      )}

      {!playMode && (
        <OrbitControls
          makeDefault
          minPolarAngle={0.1}
          maxPolarAngle={Math.PI / 2 - 0.02}
          minDistance={1}
          maxDistance={200}
        />
      )}
    </Canvas>
  );
}
