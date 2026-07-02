'use client';

import { useRef, Suspense, lazy, useMemo } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid, Sky, Environment } from '@react-three/drei';
import type { ProjectSceneSchema, ObjectNodeSchema, EventSchema, HdrPreset } from '@/types/scene';
import { ViewerObject } from './ViewerObject';
import { InstancedPrimitives, getInstancedIds } from './InstancedPrimitives';
import { ParticleEmitter } from '@/components/three/ParticleEmitter';
import { PostProcessingEffects } from '@/components/three/PostProcessingEffects';
import { GroundPlane } from '@/components/three/GroundPlane';

const PlayCanvas = lazy(() => import('./PlayCanvas').then((m) => ({ default: m.PlayCanvas })));

function BoundaryGizmo({ size, playMode }: { size: number; playMode: boolean }) {
  const b = size;
  const H = 8; // 기즈모 높이
  const positions = useMemo(() => new Float32Array([
    // 바닥 사각형
    -b, 0.02, -b,   b, 0.02, -b,
     b, 0.02, -b,   b, 0.02,  b,
     b, 0.02,  b,  -b, 0.02,  b,
    -b, 0.02,  b,  -b, 0.02, -b,
    // 모서리 기둥
    -b, 0, -b,  -b, H, -b,
     b, 0, -b,   b, H, -b,
     b, 0,  b,   b, H,  b,
    -b, 0,  b,  -b, H,  b,
    // 상단 사각형
    -b, H, -b,   b, H, -b,
     b, H, -b,   b, H,  b,
     b, H,  b,  -b, H,  b,
    -b, H,  b,  -b, H, -b,
  ]), [b]);

  return (
    <>
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color="#f59e0b" />
      </lineSegments>
      {/* 플레이 모드에서 반투명 벽면 표시 — 실제 충돌 위치와 일치 */}
      {playMode && (
        <>
          <mesh position={[0, H / 2, -b]} rotation={[0, 0, 0]}>
            <planeGeometry args={[b * 2, H]} />
            <meshBasicMaterial color="#f59e0b" transparent opacity={0.08} side={2} />
          </mesh>
          <mesh position={[0, H / 2, b]} rotation={[0, Math.PI, 0]}>
            <planeGeometry args={[b * 2, H]} />
            <meshBasicMaterial color="#f59e0b" transparent opacity={0.08} side={2} />
          </mesh>
          <mesh position={[b, H / 2, 0]} rotation={[0, -Math.PI / 2, 0]}>
            <planeGeometry args={[b * 2, H]} />
            <meshBasicMaterial color="#f59e0b" transparent opacity={0.08} side={2} />
          </mesh>
          <mesh position={[-b, H / 2, 0]} rotation={[0, Math.PI / 2, 0]}>
            <planeGeometry args={[b * 2, H]} />
            <meshBasicMaterial color="#f59e0b" transparent opacity={0.08} side={2} />
          </mesh>
        </>
      )}
    </>
  );
}

// 탐색 모드 → 플레이 모드 전환 시 현재 카메라 방향을 azimuthRef에 캡처
// 플레이 카메라가 같은 수평 방향에서 시작되어 씬이 동일하게 보임
function CameraAzimuthCapture({
  playMode,
  azimuthRef,
}: {
  playMode: boolean;
  azimuthRef: React.MutableRefObject<number>;
}) {
  const { camera } = useThree();
  const prevRef = useRef(false);

  useFrame(() => {
    if (playMode && !prevRef.current) {
      azimuthRef.current = Math.atan2(camera.position.x, camera.position.z);
    }
    prevRef.current = playMode;
  });

  return null;
}

interface Props {
  scene: ProjectSceneSchema;
  playMode: boolean;
  onObjectClick: (obj: ObjectNodeSchema, trigger: EventSchema['trigger']) => void;
  mobileInputRef?: React.MutableRefObject<{ fwd: number; strafe: number; jump: boolean }>;
}

export function ViewerCanvas({ scene, playMode, onObjectClick, mobileInputRef }: Props) {
  const { environment, objects } = scene;
  const azimuthRef = useRef(0);

  const useHdr = (environment.hdrPreset ?? 'none') !== 'none';
  const isSkyMode = !useHdr && environment.sky.type === 'sky';
  // 단색 배경 — HDR/Sky 모두 아닐 때만 사용
  const skyColor = environment.sky.type === 'color' ? environment.sky.value : '#1a1a2e';

  const instancedIds = useMemo(() => getInstancedIds(objects), [objects]);
  const particleObjects = useMemo(() => objects.filter((o) => o.visible && o.particle), [objects]);
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
      {/* 탐색→플레이 전환 시 카메라 수평 방향을 캡처해 플레이 카메라 초기값으로 사용 */}
      <CameraAzimuthCapture playMode={playMode} azimuthRef={azimuthRef} />

      {/* ── 배경 (HDR / Sky / 단색 — 상호 배타) ── */}
      {!useHdr && !isSkyMode && <color attach="background" args={[skyColor]} />}
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
      {useHdr && (
        <Suspense fallback={null}>
          <Environment preset={environment.hdrPreset as Exclude<HdrPreset, 'none'>} background />
        </Suspense>
      )}

      {/* ── Fog ── */}
      {environment.fog.enabled && (
        <fog attach="fog" args={[environment.fog.color, environment.fog.near, environment.fog.far]} />
      )}

      {/* ── 조명 ── */}
      <hemisphereLight args={['#b9d5ff', '#4a5568', 0.2]} />
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

      {/* ── 에디터 전용: 그리드 ── */}
      {!playMode && (
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
      )}
      {/* 경계 기즈모 — 플레이 중에도 표시해 충돌 영역 확인 가능 */}
      {(environment.boundary ?? 0) > 0 && (
        <BoundaryGizmo size={environment.boundary!} playMode={playMode} />
      )}

      {/* ── 바닥 ── */}
      {environment.ground?.enabled && (
        <GroundPlane
          preset={environment.ground.preset ?? 'custom'}
          color={environment.ground.color}
          textureUrl={environment.ground?.textureUrl}
          positionY={playMode ? 0 : -0.002}
        />
      )}

      {/* ── 씬 오브젝트 (에디터 뷰) ── */}
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

      {/* ── 플레이 모드 ── */}
      {playMode && (
        <Suspense fallback={null}>
          <PlayCanvas scene={scene} azimuthRef={azimuthRef} onObjectClick={onObjectClick} mobileInputRef={mobileInputRef} />
        </Suspense>
      )}

      {/* ── 씬 라이트 오브젝트 ── */}
      {objects.filter((o) => o.light && o.visible).map((o) => (
        <group key={o.id}
          position={[o.position.x, o.position.y, o.position.z]}
          rotation={[o.rotation.x * Math.PI / 180, o.rotation.y * Math.PI / 180, o.rotation.z * Math.PI / 180]}
        >
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
