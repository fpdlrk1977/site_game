'use client';

import { useRef } from 'react';
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
  const { objects, environment, selectObject } = useSceneStore();

  const skyColor = environment.sky.type === 'color' ? environment.sky.value : '#1a1a2e';

  return (
    <ObjectRefsContext.Provider value={objectRefsRef}>
      <Canvas
        shadows
        camera={{ position: [5, 4, 8], fov: 60 }}
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

        {/* 씬 오브젝트 */}
        {objects.map((obj) => (
          <EditorObjectInstance key={obj.id} object={obj} />
        ))}

        {/* Transform 기즈모 */}
        <GizmoController orbitRef={orbitRef} />

        {/* 카메라 컨트롤 */}
        <OrbitControls ref={orbitRef} makeDefault />
      </Canvas>
    </ObjectRefsContext.Provider>
  );
}
