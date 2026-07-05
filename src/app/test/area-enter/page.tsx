'use client';

/**
 * area_enter 이벤트 E2E 검증 페이지 (헤드리스 테스트용)
 * 플레이어가 자동 전진(mobileInputRef.fwd=1)하며 순서대로:
 *   1) 센서 박스(z=0, Is Sensor ON) 통과 → area_enter
 *   2) 솔리드 박스(z=-6, Is Sensor OFF) 접촉 → area_enter
 * 발동 시 콘솔 로그 + window.__areaEnterLog 배열에 기록.
 */

import { useRef, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { PlayCanvas } from '@/app/space/[sceneId]/PlayCanvas';
import { DEFAULT_ENVIRONMENT, DEFAULT_PHYSICS, SCENE_VERSION } from '@/types/scene';
import type { ProjectSceneSchema, ObjectNodeSchema, EventSchema } from '@/types/scene';

declare global {
  interface Window { __areaEnterLog?: string[] }
}

function makeBox(id: string, name: string, z: number, isSensor: boolean): ObjectNodeSchema {
  return {
    id,
    name,
    assetId: null,
    primitiveShape: 'box',
    material: { color: isSensor ? '#3b82f6' : '#22c55e', roughness: 0.5, metalness: 0.1 },
    parentId: null,
    layer: 'default',
    position: { x: 0, y: 1, z },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 2, y: 2, z: 2 },
    visible: true,
    locked: false,
    physics: { ...DEFAULT_PHYSICS, enabled: true, isSensor },
    events: [{ id: `ev-${id}`, trigger: 'area_enter', action: 'show_popup', value: `${name} 팝업` }],
  };
}

const scene: ProjectSceneSchema = {
  projectId: 'test',
  sceneId: 'test-area-enter',
  version: SCENE_VERSION,
  environment: { ...DEFAULT_ENVIRONMENT, playerStartPosition: { x: 0, y: 1, z: 6 } },
  assets: [],
  objects: [
    makeBox('sensor-box', 'SENSOR', 0, true),
    makeBox('solid-box', 'SOLID', -6, false),
  ],
};

export default function AreaEnterTestPage() {
  const azimuthRef = useRef(0);
  const mobileInputRef = useRef({ fwd: 1, strafe: 0, jump: false }); // 자동 전진

  const onEvent = (obj: ObjectNodeSchema, trigger: EventSchema['trigger']) => {
    const entry = `${trigger}:${obj.name}`;
    console.log('[AREA-ENTER-TEST]', entry);
    if (typeof window !== 'undefined') {
      window.__areaEnterLog = [...(window.__areaEnterLog ?? []), entry];
    }
  };

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <Canvas camera={{ position: [5, 4, 12], fov: 60 }}>
        <ambientLight intensity={0.8} />
        <Suspense fallback={null}>
          <PlayCanvas
            scene={scene}
            azimuthRef={azimuthRef}
            onObjectClick={onEvent}
            mobileInputRef={mobileInputRef}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}
