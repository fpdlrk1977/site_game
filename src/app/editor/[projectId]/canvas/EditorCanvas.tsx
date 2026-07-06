'use client';

import { useRef, useEffect, useState, useCallback, useMemo, Suspense } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Grid, Sky, Environment } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import { useSceneStore } from '@/store/sceneStore';
import { EditorObjectInstance } from './EditorObjectInstance';
import { GizmoController } from './GizmoController';
import { ObjectRefsContext } from './ObjectRefsContext';
import { pointerDownOnObjectRef } from './boxSelectState';
import { PostProcessingEffects } from '@/components/three/PostProcessingEffects';
import { GroundPlane } from '@/components/three/GroundPlane';
import { DefaultEnvironment } from '@/components/three/DefaultEnvironment';
import { CharacterPreview } from './CharacterPreview';
import type { Vector3 as Vec3, HdrPreset } from '@/types/scene';

function BoundaryGizmo({ size }: { size: number }) {
  const b = size;
  const H = 8;
  const positions = useMemo(() => new Float32Array([
    -b, 0.02, -b,   b, 0.02, -b,
     b, 0.02, -b,   b, 0.02,  b,
     b, 0.02,  b,  -b, 0.02,  b,
    -b, 0.02,  b,  -b, 0.02, -b,
    -b, 0, -b,  -b, H, -b,
     b, 0, -b,   b, H, -b,
     b, 0,  b,   b, H,  b,
    -b, 0,  b,  -b, H,  b,
    -b, H, -b,   b, H, -b,
     b, H, -b,   b, H,  b,
     b, H,  b,  -b, H,  b,
    -b, H,  b,  -b, H, -b,
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

function SpawnMarker({ position }: { position: Vec3 }) {
  return (
    <group position={[position.x, position.y, position.z]}>
      <mesh position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 1, 8]} />
        <meshBasicMaterial color="#10b981" />
      </mesh>
      <mesh position={[0, 1.2, 0]}>
        <coneGeometry args={[0.14, 0.35, 8]} />
        <meshBasicMaterial color="#10b981" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.35, 0.45, 16]} />
        <meshBasicMaterial color="#10b981" transparent opacity={0.6} />
      </mesh>
    </group>
  );
}

function CameraCapture({ cameraRef }: { cameraRef: React.MutableRefObject<THREE.Camera | null> }) {
  const { camera } = useThree();
  cameraRef.current = camera;
  return null;
}

type SelBox = { left: number; top: number; width: number; height: number };

export function EditorCanvas() {
  const orbitRef = useRef<OrbitControlsImpl>(null);
  const objectRefsRef = useRef<Map<string, THREE.Object3D>>(new Map());
  const cameraRef = useRef<THREE.Camera | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const gizmoDraggingRef = useRef(false);

  // Box-select drag state — all in refs to avoid stale closures in event handlers
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef(false);
  const dragRectRef = useRef<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [selBox, setSelBox] = useState<SelBox | null>(null);

  const { environment, assets, focusTarget, focusAllRequest, cameraViewRequest, objects, bookmarkSaveRequest, bookmarkRecallRequest, setCameraBookmark } = useSceneStore();

  useEffect(() => {
    if (!focusTarget || !orbitRef.current) return;
    orbitRef.current.target.set(focusTarget.x, focusTarget.y, focusTarget.z);
    orbitRef.current.update();
  }, [focusTarget]);

  // Focus All — 모든 오브젝트가 화면에 들어오도록 카메라 이동
  useEffect(() => {
    if (!focusAllRequest || !orbitRef.current) return;
    const visible = objects.filter((o) => o.visible && !o.parentId);
    if (visible.length === 0) return;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const o of visible) {
      minX = Math.min(minX, o.position.x); maxX = Math.max(maxX, o.position.x);
      minY = Math.min(minY, o.position.y); maxY = Math.max(maxY, o.position.y);
      minZ = Math.min(minZ, o.position.z); maxZ = Math.max(maxZ, o.position.z);
    }
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2;
    const spread = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 4);
    orbitRef.current.target.set(cx, cy, cz);
    orbitRef.current.object.position.set(cx + spread * 0.8, cy + spread * 0.6, cz + spread * 0.8);
    orbitRef.current.update();
  }, [focusAllRequest, objects]);

  // Camera view preset (Numpad7=Top, Numpad1=Front, Numpad3=Right)
  useEffect(() => {
    if (!cameraViewRequest || !orbitRef.current) return;
    const { view } = cameraViewRequest;
    orbitRef.current.target.set(0, 0, 0);
    if (view === 'top') orbitRef.current.object.position.set(0, 20, 0.001);
    else if (view === 'front') orbitRef.current.object.position.set(0, 3, 20);
    else orbitRef.current.object.position.set(20, 3, 0);
    orbitRef.current.update();
  }, [cameraViewRequest]);

  useEffect(() => {
    if (!bookmarkSaveRequest || !orbitRef.current) return;
    const cam = orbitRef.current.object;
    const tgt = orbitRef.current.target;
    setCameraBookmark(
      bookmarkSaveRequest.slot,
      [cam.position.x, cam.position.y, cam.position.z],
      [tgt.x, tgt.y, tgt.z],
    );
  }, [bookmarkSaveRequest, setCameraBookmark]);

  useEffect(() => {
    if (!bookmarkRecallRequest || !orbitRef.current) return;
    const bm = useSceneStore.getState().cameraBookmarks[bookmarkRecallRequest.slot];
    if (!bm) return;
    orbitRef.current.object.position.set(...bm.position);
    orbitRef.current.target.set(...bm.target);
    orbitRef.current.update();
  }, [bookmarkRecallRequest]);

  const resetDrag = useCallback(() => {
    if (orbitRef.current) orbitRef.current.enabled = true;
    dragStartRef.current = null;
    isDraggingRef.current = false;
    dragRectRef.current = null;
    setSelBox(null);
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    // Ctrl+drag → orbit (let OrbitControls handle it)
    // Object/gizmo hit → orbit/transform (let three.js handle it)
    if (e.ctrlKey || pointerDownOnObjectRef.current || gizmoDraggingRef.current) {
      pointerDownOnObjectRef.current = false;
      return;
    }
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    isDraggingRef.current = false;
    dragRectRef.current = null;
    // Disable orbit immediately so it doesn't jitter before the 6px threshold kicks in
    if (orbitRef.current) orbitRef.current.enabled = false;
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    if (!isDraggingRef.current && Math.sqrt(dx * dx + dy * dy) < 6) return;

    if (!isDraggingRef.current) {
      isDraggingRef.current = true;
    }

    const wr = wrapperRef.current!.getBoundingClientRect();
    const x1 = Math.min(dragStartRef.current.x, e.clientX) - wr.left;
    const y1 = Math.min(dragStartRef.current.y, e.clientY) - wr.top;
    const x2 = Math.max(dragStartRef.current.x, e.clientX) - wr.left;
    const y2 = Math.max(dragStartRef.current.y, e.clientY) - wr.top;
    dragRectRef.current = { x1, y1, x2, y2 };
    setSelBox({ left: x1, top: y1, width: x2 - x1, height: y2 - y1 });
  }, []);

  const handlePointerUp = useCallback(() => {
    if (!isDraggingRef.current || !dragRectRef.current || !cameraRef.current || !wrapperRef.current) {
      resetDrag();
      return;
    }

    const { x1, y1, x2, y2 } = dragRectRef.current;
    const wr = wrapperRef.current.getBoundingClientRect();
    const { objects, selectObjects } = useSceneStore.getState();
    const matchingIds: string[] = [];

    // 최상위 조상 ID 반환 (그룹 내부 오브젝트 → 루트 그룹 선택)
    const getRootId = (obj: (typeof objects)[number]): string => {
      if (!obj.parentId) return obj.id;
      const parent = objects.find((o) => o.id === obj.parentId);
      return parent ? getRootId(parent) : obj.id;
    };

    for (const obj of objects) {
      if (obj.locked || !obj.visible || obj.isGroup) continue;
      const obj3d = objectRefsRef.current.get(obj.id);
      if (!obj3d) continue;
      const wp = new THREE.Vector3();
      obj3d.getWorldPosition(wp);
      wp.project(cameraRef.current);
      // NDC → canvas-local pixel coords
      const sx = (wp.x * 0.5 + 0.5) * wr.width;
      const sy = (-wp.y * 0.5 + 0.5) * wr.height;
      if (sx >= x1 && sx <= x2 && sy >= y1 && sy <= y2) {
        const rootId = getRootId(obj);
        if (!matchingIds.includes(rootId)) matchingIds.push(rootId);
      }
    }

    selectObjects(matchingIds);

    resetDrag();
  }, [resetDrag]);

  const useHdr = (environment.hdrPreset ?? 'none') !== 'none';
  const isSkyMode = !useHdr && environment.sky.type === 'sky';
  const skyColor = environment.sky.type === 'color' ? environment.sky.value : '#1a1a2e';

  return (
    <ObjectRefsContext.Provider value={objectRefsRef}>
      <div
        ref={wrapperRef}
        style={{ position: 'relative', width: '100%', height: '100%' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={resetDrag}
      >
        <Canvas
          id="editor-canvas"
          shadows="percentage"
          camera={{ position: [5, 4, 8], fov: 60 }}
          gl={{ preserveDrawingBuffer: true }}
          onPointerMissed={() => {
            if (!isDraggingRef.current) useSceneStore.getState().selectObject(null);
          }}
          style={{ width: '100%', height: '100%' }}
        >
          <CameraCapture cameraRef={cameraRef} />

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
          {/* HDR 미설정 시에도 은은한 IBL 제공 → PBR 재질 생기 */}
          {!useHdr && <DefaultEnvironment />}

          {/* fill 광을 낮춰 방향광 그림자 대비를 살린다 (환경광이 fill 역할 분담).
              ambient는 그림자를 가장 많이 씻어내므로 저장값의 절반만 적용. */}
          <hemisphereLight args={['#b9d5ff', '#4a5568', 0.08]} />
          <ambientLight intensity={environment.lights.ambientIntensity * 0.5} />
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

          <Grid
            position={[0, -0.001, 0]}
            args={[50, 50]}
            cellSize={1}
            cellThickness={0.4}
            cellColor="#3f3f46"
            sectionSize={5}
            sectionThickness={0.8}
            sectionColor="#52525b"
            fadeDistance={80}
            fadeStrength={1}
            infiniteGrid
          />

          {objects.filter((o) => o.parentId === null).map((obj) => (
            <EditorObjectInstance key={obj.id} object={obj} />
          ))}

          {(environment.boundary ?? 0) > 0 && (
            <BoundaryGizmo size={environment.boundary!} />
          )}

          {environment.ground?.enabled && (
            <GroundPlane
              preset={environment.ground.preset ?? 'custom'}
              color={environment.ground.color}
              textureUrl={environment.ground.textureUrl}
              positionY={-0.002}
            />
          )}

          {/* 둘러보기 전용 씬은 캐릭터 프리뷰·스폰 마커 숨김 */}
          {!environment.disableWalk && (environment.playerCharacterId
            ? (() => {
                const charAsset = assets.find((a) => a.id === environment.playerCharacterId);
                return charAsset
                  ? <CharacterPreview url={charAsset.dracoUrl} scale={environment.playerCharacterScale ?? 1} />
                  : null;
              })()
            : environment.playerStartPosition
              ? <SpawnMarker position={environment.playerStartPosition} />
              : null
          )}

          <GizmoController orbitRef={orbitRef} gizmoDraggingRef={gizmoDraggingRef} />

          <PostProcessingEffects preset={environment.postProcessing?.preset ?? 'none'} />

          <OrbitControls
            ref={orbitRef}
            makeDefault
            minPolarAngle={0.1}
            maxPolarAngle={Math.PI / 2 - 0.02}
            minDistance={1}
            maxDistance={200}
            onChange={() => {
              const ctrl = orbitRef.current;
              if (!ctrl) return;
              // 패닝으로 타겟이 바닥 아래로 내려가면 바닥이 화면 위로 올라가는 현상 방지
              if (ctrl.target.y < 0) ctrl.target.y = 0;
              // 카메라 자체도 바닥 아래로 내려가지 않도록
              if (ctrl.object.position.y < 0.3) ctrl.object.position.y = 0.3;
            }}
          />
        </Canvas>

        {selBox && (
          <div
            style={{
              position: 'absolute',
              left: selBox.left,
              top: selBox.top,
              width: selBox.width,
              height: selBox.height,
              border: '1.5px solid #7c3aed',
              background: 'rgba(124, 58, 237, 0.08)',
              pointerEvents: 'none',
              boxSizing: 'border-box',
            }}
          />
        )}
      </div>
    </ObjectRefsContext.Provider>
  );
}
