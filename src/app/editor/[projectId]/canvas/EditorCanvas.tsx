'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import { useSceneStore } from '@/store/sceneStore';
import { EditorObjectInstance } from './EditorObjectInstance';
import { GizmoController } from './GizmoController';
import { ObjectRefsContext } from './ObjectRefsContext';
import { pointerDownOnObjectRef } from './boxSelectState';

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

  const { environment, focusTarget, objects } = useSceneStore();

  useEffect(() => {
    if (!focusTarget || !orbitRef.current) return;
    orbitRef.current.target.set(focusTarget.x, focusTarget.y, focusTarget.z);
    orbitRef.current.update();
  }, [focusTarget]);

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
        matchingIds.push(obj.id);
      }
    }

    if (matchingIds.length > 0) selectObjects(matchingIds);

    resetDrag();
  }, [resetDrag]);

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
          shadows="percentage"
          camera={{ position: [5, 4, 8], fov: 60 }}
          gl={{ preserveDrawingBuffer: true }}
          onPointerMissed={() => {
            if (!isDraggingRef.current) useSceneStore.getState().selectObject(null);
          }}
          style={{ width: '100%', height: '100%', background: skyColor }}
        >
          <CameraCapture cameraRef={cameraRef} />
          <color attach="background" args={[skyColor]} />

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

          <GizmoController orbitRef={orbitRef} gizmoDraggingRef={gizmoDraggingRef} />

          <OrbitControls
            ref={orbitRef}
            makeDefault
            minPolarAngle={0.1}
            maxPolarAngle={Math.PI / 2 - 0.02}
            minDistance={1}
            maxDistance={200}
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
