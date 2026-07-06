'use client';

/**
 * 그림자 심도 시각 확인 — 실제 ViewerClient/ViewerCanvas 조명으로 렌더.
 * 밝은 바닥 위에 큰 박스를 놓아 방향광 그림자가 또렷이 보이게 한다.
 */

import { ViewerClient } from '@/app/space/[sceneId]/ViewerClient';
import { DEFAULT_ENVIRONMENT, DEFAULT_PHYSICS, SCENE_VERSION } from '@/types/scene';
import type { ProjectSceneSchema, ObjectNodeSchema } from '@/types/scene';

function box(id: string, x: number, sy: number, color: string): ObjectNodeSchema {
  return {
    id, name: id, assetId: null, primitiveShape: 'box',
    material: { color, roughness: 0.7, metalness: 0.05 },
    parentId: null, layer: 'default',
    position: { x, y: sy / 2, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1.2, y: sy, z: 1.2 },
    visible: true, locked: false, physics: { ...DEFAULT_PHYSICS }, events: [],
  };
}

const scene: ProjectSceneSchema = {
  projectId: 'test', sceneId: 'test-shadow', version: SCENE_VERSION,
  environment: {
    ...DEFAULT_ENVIRONMENT,
    ground: { enabled: true, color: '#c8ccd2' }, // 밝은 바닥 → 그림자 대비 잘 보임
    // 태양을 낮추고 왼쪽에 둬 그림자가 카메라 쪽(오른쪽)으로 길게 지도록 — 심도 확인용
    lights: { ...DEFAULT_ENVIRONMENT.lights, directionalPosition: { x: -7, y: 5, z: 3 } },
    disableWalk: true,
  },
  assets: [],
  objects: [box('tall', -1.5, 3, '#e0e0e0'), box('mid', 1.6, 1.6, '#e0e0e0')],
};

export default function ShadowTestPage() {
  return <ViewerClient scene={scene} projectName="shadow-test" isOwner={false} projectId="test" hideBadge />;
}
