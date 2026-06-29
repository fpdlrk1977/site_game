'use client';

import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import type { ProjectSceneSchema, ObjectNodeSchema } from '@/types/scene';
import { ViewerObject } from './ViewerObject';

interface Props {
  scene: ProjectSceneSchema;
  onObjectClick: (obj: ObjectNodeSchema) => void;
}

export function ViewerCanvas({ scene, onObjectClick }: Props) {
  const { environment, objects } = scene;
  const skyColor = environment.sky.type === 'color' ? environment.sky.value : '#1a1a2e';

  return (
    <Canvas
      shadows="soft"
      camera={{ position: [5, 4, 8], fov: 60 }}
      style={{ width: '100%', height: '100%' }}
    >
      <color attach="background" args={[skyColor]} />

      {/* 안개 */}
      {environment.fog.enabled && (
        <fog
          attach="fog"
          args={[environment.fog.color, environment.fog.near, environment.fog.far]}
        />
      )}

      {/* 조명 */}
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

      {/* 그리드 (에디터보다 연하게) */}
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

      {/* 씬 오브젝트 */}
      {objects.map((obj) => (
        <ViewerObject key={obj.id} object={obj} assets={scene.assets ?? []} onEvent={onObjectClick} />
      ))}

      <OrbitControls
        makeDefault
        minPolarAngle={0.1}
        maxPolarAngle={Math.PI / 2 - 0.02}
        minDistance={1}
        maxDistance={200}
      />
    </Canvas>
  );
}
