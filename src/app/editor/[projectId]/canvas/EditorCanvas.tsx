'use client';

import { useRef, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import { useSceneStore } from '@/store/sceneStore';
import { EditorObjectInstance } from './EditorObjectInstance';
import { GizmoController } from './GizmoController';
import { ObjectRefsContext } from './ObjectRefsContext';

export function EditorCanvas() {
  const orbitRef = useRef<OrbitControlsImpl>(null);
  const objectRefsRef = useRef<Map<string, THREE.Object3D>>(new Map());
  const { objects, environment, focusTarget, selectObject } = useSceneStore();

  // F키 포커스: 선택 오브젝트 위치로 OrbitControls target 이동
  useEffect(() => {
    if (!focusTarget || !orbitRef.current) return;
    orbitRef.current.target.set(focusTarget.x, focusTarget.y, focusTarget.z);
    orbitRef.current.update();
  }, [focusTarget]);

  const skyColor = environment.sky.type === 'color' ? environment.sky.value : '#1a1a2e';

  return (
    <ObjectRefsContext.Provider value={objectRefsRef}>
      <Canvas
        shadows="soft"
        camera={{ position: [5, 4, 8], fov: 60 }}
        gl={{ preserveDrawingBuffer: true }}
        onPointerMissed={() => selectObject(null)}
        style={{ width: '100%', height: '100%', background: skyColor }}
      >
        <color attach="background" args={[skyColor]} />

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

        {/* 그리드 */}
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

        {/* 루트 오브젝트만 렌더 — 자식은 GroupObjectInstance 내부에서 렌더 */}
        {objects.filter((o) => o.parentId === null).map((obj) => (
          <EditorObjectInstance key={obj.id} object={obj} />
        ))}

        {/* Transform 기즈모 */}
        <GizmoController orbitRef={orbitRef} />

        {/* 카메라 컨트롤 */}
        <OrbitControls
          ref={orbitRef}
          makeDefault
          minPolarAngle={0.1}
          maxPolarAngle={Math.PI / 2 - 0.02}
          minDistance={1}
          maxDistance={200}
        />
      </Canvas>
    </ObjectRefsContext.Provider>
  );
}
