'use client';

import { useRef, useEffect, Suspense, lazy, useMemo } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid, Sky, Environment, ContactShadows } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import type { ProjectSceneSchema, ObjectNodeSchema, EventSchema, HdrPreset } from '@/types/scene';
import { ViewerObject } from './ViewerObject';
import { InstancedPrimitives, getInstancedIds } from './InstancedPrimitives';
import { ParticleEmitter } from '@/components/three/ParticleEmitter';
import { PostProcessingEffects } from '@/components/three/PostProcessingEffects';
import { GroundPlane } from '@/components/three/GroundPlane';
import { DefaultEnvironment } from '@/components/three/DefaultEnvironment';
import { PlayModeContext } from './PlayModeContext';
import { ClipRequestContext, type ClipReq } from './ClipRequestContext';
import { InteractHighlightContext } from './InteractHighlightContext';
import { DialogueAdvanceContext } from './DialogueAdvanceContext';
import { SceneToneMapping } from '@/components/three/SceneToneMapping';

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

// 오브젝트의 월드 위치 근사(부모 체인 위치 합산) — 카메라 포커스 대상 좌표 계산용.
// 부모 회전/스케일은 무시하지만 포커스 용도로는 충분.
function objWorldPos(objects: ObjectNodeSchema[], id: string): THREE.Vector3 | null {
  let o: ObjectNodeSchema | undefined = objects.find((x) => x.id === id);
  if (!o) return null;
  const v = new THREE.Vector3();
  while (o) {
    v.x += o.position.x; v.y += o.position.y; v.z += o.position.z;
    const pid: string | null = o.parentId;
    o = pid ? objects.find((p) => p.id === pid) : undefined;
  }
  return v;
}

// Canvas 초기 카메라와 동일한 "홈" 시점 (시점 초기화 시 복귀 지점)
const HOME_CAM = new THREE.Vector3(5, 4, 8);
const HOME_TARGET = new THREE.Vector3(0, 0, 0);

// 카메라 요청 처리 — 0.6초 이징으로 부드럽게 이동.
// request.id가 objectId면 그 오브젝트로 포커스(앵글·거리 유지 팬), null이면 홈 시점으로 복귀.
function CameraFocus({ request, objects, orbitRef }: {
  request: { id: string | null; t: number } | null;
  objects: ObjectNodeSchema[];
  orbitRef: React.RefObject<OrbitControlsImpl | null>;
}) {
  const { camera } = useThree();
  const anim = useRef<{ camFrom: THREE.Vector3; camTo: THREE.Vector3; tgtFrom: THREE.Vector3; tgtTo: THREE.Vector3; t: number } | null>(null);
  const lastTick = useRef(0);

  useEffect(() => {
    if (!request || request.t === lastTick.current || !orbitRef.current) return;
    lastTick.current = request.t;
    const orbit = orbitRef.current;
    const tgtFrom = orbit.target.clone();
    const camFrom = camera.position.clone();

    let tgtTo: THREE.Vector3;
    let camTo: THREE.Vector3;
    if (request.id === null) {
      // 홈 시점으로 복귀
      tgtTo = HOME_TARGET.clone();
      camTo = HOME_CAM.clone();
    } else {
      const wp = objWorldPos(objects, request.id);
      if (!wp) return;
      tgtTo = wp;
      camTo = camFrom.clone().add(wp.clone().sub(tgtFrom)); // 타겟 이동량만큼 카메라 팬
    }
    anim.current = { tgtFrom, tgtTo, camFrom, camTo, t: 0 };
  }, [request, objects, orbitRef, camera]);

  useFrame((_, dt) => {
    const a = anim.current;
    if (!a || !orbitRef.current) return;
    a.t = Math.min(1, a.t + dt / 0.6);
    const e = a.t < 0.5 ? 2 * a.t * a.t : 1 - Math.pow(-2 * a.t + 2, 2) / 2; // easeInOutQuad
    orbitRef.current.target.lerpVectors(a.tgtFrom, a.tgtTo, e);
    camera.position.lerpVectors(a.camFrom, a.camTo, e);
    orbitRef.current.update();
    if (a.t >= 1) anim.current = null;
  });
  return null;
}

// 상호작용(클릭/호버) 오브젝트 위에 떠다니는 힌트 링 — "여기 클릭하세요" 어포던스.
// 오브젝트 렌더 경로(재질/GLB)를 전혀 건드리지 않는 별도 레이어. 탐색 모드에서만 렌더한다.
// depthTest=false + 높은 renderOrder로 오브젝트에 가려지지 않고 항상 보인다.
function isInteractive(o: ObjectNodeSchema): boolean {
  return o.events.some(
    (e) => e.trigger === 'click' || e.trigger === 'hover_enter' || e.trigger === 'hover_exit',
  );
}

function InteractionHints({ objects }: { objects: ObjectNodeSchema[] }) {
  const groupRef = useRef<THREE.Group>(null);

  const hints = useMemo(() => {
    const out: { id: string; pos: [number, number, number] }[] = [];
    for (const o of objects) {
      if (!o.visible || o.isGroup || !isInteractive(o)) continue;
      const wp = objWorldPos(objects, o.id);
      if (!wp) continue;
      // 오브젝트 상단 근처에 띄운다(정확한 bbox 없이 스케일 기반 근사).
      const h = Math.max(o.scale.y * 0.5, 0.3) + 0.5;
      out.push({ id: o.id, pos: [wp.x, wp.y + h, wp.z] });
    }
    return out;
  }, [objects]);

  // 카메라를 향하도록 빌보드 + 은은한 펄스(스케일). 개별 위상으로 동시에 뛰지 않게 한다.
  useFrame((state) => {
    const g = groupRef.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    g.children.forEach((child, i) => {
      child.quaternion.copy(state.camera.quaternion);
      const s = 1 + Math.sin(t * 2.6 + i * 0.7) * 0.16;
      child.scale.setScalar(s);
    });
  });

  if (hints.length === 0) return null;

  return (
    <group ref={groupRef}>
      {hints.map((h) => (
        <group key={h.id} position={h.pos} renderOrder={999}>
          <mesh renderOrder={999}>
            <ringGeometry args={[0.11, 0.17, 28]} />
            <meshBasicMaterial color="#22d3ee" transparent opacity={0.9} depthTest={false} depthWrite={false} toneMapped={false} />
          </mesh>
          <mesh renderOrder={999}>
            <circleGeometry args={[0.05, 20]} />
            <meshBasicMaterial color="#22d3ee" transparent opacity={0.7} depthTest={false} depthWrite={false} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

interface Props {
  scene: ProjectSceneSchema;
  playMode: boolean;
  onObjectClick: (obj: ObjectNodeSchema, trigger: EventSchema['trigger']) => void;
  mobileInputRef?: React.MutableRefObject<{ fwd: number; strafe: number; jump: boolean }>;
  focusRequest?: { id: string | null; t: number } | null;
  clipRequests?: Record<string, ClipReq>;
  onInteractPromptChange?: (obj: ObjectNodeSchema | null) => void;
  /** 근접한 interact 대상 id — 3D 트리에 내려 해당 오브젝트를 하이라이트 */
  interactHighlightId?: string | null;
  /** E키 nonce — 대화 열기/다음 문장 */
  dialogueNonce?: number;
}

const EMPTY_CLIPS: Record<string, ClipReq> = {};

export function ViewerCanvas({ scene, playMode, onObjectClick, mobileInputRef, focusRequest, clipRequests, onInteractPromptChange, interactHighlightId, dialogueNonce }: Props) {
  const { environment, objects } = scene;
  const azimuthRef = useRef(0);
  const orbitRef = useRef<OrbitControlsImpl>(null);

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
      gl={{ toneMapping: THREE.LinearToneMapping }}
      style={{ width: '100%', height: '100%' }}
    >
      <PlayModeContext.Provider value={playMode}>
      <ClipRequestContext.Provider value={clipRequests ?? EMPTY_CLIPS}>
      <InteractHighlightContext.Provider value={interactHighlightId ?? null}>
      <DialogueAdvanceContext.Provider value={dialogueNonce ?? 0}>
      {/* 톤매핑 Neutral 고정 + 씬별 노출 — 저장 색을 최대한 그대로 렌더 */}
      <SceneToneMapping exposure={environment.toneMappingExposure ?? 1} />
      {/* 탐색/플레이 전환 시 카메라 수평 방향 캡처 */}
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
      {/* HDR 미설정 시에도 은은한 IBL 제공 → PBR 재질 생기 (에디터와 동일) */}
      {!useHdr && <DefaultEnvironment />}

      {/* ── Fog ── */}
      {environment.fog.enabled && (
        <fog attach="fog" args={[environment.fog.color, environment.fog.near, environment.fog.far]} />
      )}

      {/* ── 조명 ── */}
      {/* fill 광을 낮춰 방향광 그림자를 더 진하게. ambient/hemisphere/IBL이 그림자를 씻어내므로
          fill 기여를 줄인다(ambient 저장값의 0.2배, hemisphere 0.02, IBL 0.25). */}
      <hemisphereLight args={['#b9d5ff', '#4a5568', 0.02]} />
      <ambientLight intensity={environment.lights.ambientIntensity * 0.2} />
      <directionalLight
        position={[
          environment.lights.directionalPosition.x,
          environment.lights.directionalPosition.y,
          environment.lights.directionalPosition.z,
        ]}
        intensity={environment.lights.directionalIntensity}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-camera-near={0.5}
        shadow-camera-far={120}
        shadow-camera-left={-50}
        shadow-camera-right={50}
        shadow-camera-top={50}
        shadow-camera-bottom={-50}
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

      {/* ── 접지 그림자(ContactShadows) — 오브젝트가 바닥에 붙은 느낌 강화. 기본 꺼짐(opt-in) ── */}
      {/* 플레이 모드에선 제외: 캐릭터가 움직이면 접지 그림자가 이동 경로를 따라 검게 칠해지는
          트레일 아티팩트가 생긴다(움직이는 대상에 부적합). 탐색 모드 정적 씬에서만 렌더. */}
      {environment.contactShadows === true && !playMode && (
        <ContactShadows position={[0, 0.005, 0]} scale={60} far={12} blur={2.4} opacity={0.55} resolution={1024} color="#000000" />
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
          <PlayCanvas scene={scene} azimuthRef={azimuthRef} onObjectClick={onObjectClick} mobileInputRef={mobileInputRef} onInteractPromptChange={onInteractPromptChange} />
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
          ref={orbitRef}
          makeDefault
          minPolarAngle={0.1}
          maxPolarAngle={Math.PI / 2 - 0.02}
          minDistance={1}
          maxDistance={200}
        />
      )}

      {/* focus_object 액션 — 탐색 모드에서만 (플레이 모드는 orbitRef 없음 → no-op) */}
      {!playMode && <CameraFocus request={focusRequest ?? null} objects={objects} orbitRef={orbitRef} />}

      {/* 인터랙션 어포던스 — 탐색 모드 + 씬 설정 on(미설정=on)일 때만 상호작용 오브젝트 위에 힌트 링 */}
      {!playMode && environment.showInteractionHints !== false && <InteractionHints objects={objects} />}
      </DialogueAdvanceContext.Provider>
      </InteractHighlightContext.Provider>
      </ClipRequestContext.Provider>
      </PlayModeContext.Provider>
    </Canvas>
  );
}
