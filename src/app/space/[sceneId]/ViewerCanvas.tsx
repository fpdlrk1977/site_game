'use client';

import { useRef, Suspense, lazy, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Sky } from '@react-three/drei';
import type { ProjectSceneSchema, ObjectNodeSchema, EventSchema } from '@/types/scene';
import { ViewerObject } from './ViewerObject';
import { InstancedPrimitives, getInstancedIds } from './InstancedPrimitives';
import { ParticleEmitter } from '@/components/three/ParticleEmitter';
import { PostProcessingEffects } from '@/components/three/PostProcessingEffects';

const PlayCanvas = lazy(() => import('./PlayCanvas').then((m) => ({ default: m.PlayCanvas })));

function BoundaryGizmo({ size }: { size: number }) {
  const b = size;
  const positions = useMemo(() => new Float32Array([
    // 바닥 사각형
    -b, 0.02, -b,   b, 0.02, -b,
     b, 0.02, -b,   b, 0.02,  b,
     b, 0.02,  b,  -b, 0.02,  b,
    -b, 0.02,  b,  -b, 0.02, -b,
    // 네 모서리 수직선
    -b, 0, -b,  -b, 8, -b,
     b, 0, -b,   b, 8, -b,
     b, 0,  b,   b, 8,  b,
    -b, 0,  b,  -b, 8,  b,
  ]), [b]);

  return (
    <lineSegments>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <lineBasicMaterial color="#f59e0b" />
    </lineSegments>
  );
}

interface Props {
  scene: ProjectSceneSchema;
  playMode: boolean;
  onObjectClick: (obj: ObjectNodeSchema, trigger: EventSchema['trigger']) => void;
  mobileInputRef?: React.MutableRefObject<{ fwd: number; strafe: number; jump: boolean }>;
}

export function ViewerCanvas({ scene, playMode, onObjectClick, mobileInputRef }: Props) {
  const { environment, objects } = scene;
  const isSkyMode = environment.sky.type === 'sky';
  const skyColor = isSkyMode ? '#87ceeb' : environment.sky.value;
  const azimuthRef = useRef(0);

  const instancedIds = useMemo(() => getInstancedIds(objects), [objects]);
  const particleObjects = useMemo(() => objects.filter((o) => o.visible && o.particle), [objects]);
  // 루트 오브젝트만 렌더 (자식은 ViewerObject 내부에서 처리)
  const rootObjects = useMemo(() => objects.filter((o) => o.parentId === null), [objects]);
  const nonInstancedObjects = useMemo(
    () => rootObjects.filter((o) => !instancedIds.has(o.id) && !o.particle && !o.isGroup),
    [rootObjects, instancedIds],
  );
  const rootGroups = useMemo(() => rootObjects.filter((o) => o.isGroup), [rootObjects]);

  return (
    <Canvas
      shadows="percentage"
      camera={{ position: [5, 4, 8], fov: 60 }}
      style={{ width: '100%', height: '100%' }}
    >
      <color attach="background" args={[skyColor]} />

      {isSkyMode && (
        <Sky
          sunPosition={[
            environment.lights.directionalPosition.x,
            environment.lights.directionalPosition.y,
            environment.lights.directionalPosition.z,
          ]}
          turbidity={8}
          rayleigh={2}
          mieCoefficient={0.005}
          mieDirectionalG={0.85}
        />
      )}

      {playMode && environment.ground?.enabled && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
          <planeGeometry args={[1000, 1000]} />
          <meshStandardMaterial color={environment.ground.color} />
        </mesh>
      )}

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

      {!playMode && (environment.boundary ?? 0) > 0 && (
        <BoundaryGizmo size={environment.boundary!} />
      )}

      {!playMode && (
        <>
          <InstancedPrimitives objects={objects} />
          {nonInstancedObjects.map((obj) => (
            <ViewerObject key={obj.id} object={obj} assets={scene.assets ?? []} onEvent={onObjectClick} allObjects={objects} />
          ))}
          {rootGroups.map((obj) => (
            <ViewerObject key={obj.id} object={obj} assets={scene.assets ?? []} onEvent={onObjectClick} allObjects={objects} />
          ))}
          {particleObjects.filter((o) => o.parentId === null).map((obj) => (
            <ParticleEmitter
              key={obj.id}
              config={obj.particle!}
              position={[obj.position.x, obj.position.y, obj.position.z]}
            />
          ))}
        </>
      )}

      {playMode && (
        <Suspense fallback={null}>
          <PlayCanvas scene={scene} azimuthRef={azimuthRef} onObjectClick={onObjectClick} mobileInputRef={mobileInputRef} />
        </Suspense>
      )}

      {/* 씬 라이트 오브젝트 */}
      {objects.filter((o) => o.light && o.visible).map((o) => (
        <group key={o.id} position={[o.position.x, o.position.y, o.position.z]}
          rotation={[o.rotation.x * Math.PI / 180, o.rotation.y * Math.PI / 180, o.rotation.z * Math.PI / 180]}>
          {o.light!.type === 'point' && (
            <pointLight color={o.light!.color} intensity={o.light!.intensity}
              distance={o.light!.distance ?? 20} decay={o.light!.decay ?? 2}
              castShadow={o.light!.castShadow} />
          )}
          {o.light!.type === 'spot' && (
            <spotLight color={o.light!.color} intensity={o.light!.intensity}
              distance={o.light!.distance ?? 20} decay={o.light!.decay ?? 2}
              angle={o.light!.angle ?? Math.PI / 6} penumbra={o.light!.penumbra ?? 0.1}
              castShadow={o.light!.castShadow} />
          )}
          {o.light!.type === 'directional' && (
            <directionalLight color={o.light!.color} intensity={o.light!.intensity}
              castShadow={o.light!.castShadow} />
          )}
        </group>
      ))}

      <PostProcessingEffects preset={environment.postProcessing?.preset ?? 'none'} />

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
