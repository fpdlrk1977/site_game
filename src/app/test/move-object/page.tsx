'use client';

/**
 * move_object / play_sound 이벤트 E2E 검증 페이지 (헤드리스 테스트용)
 * 실제 뷰어(ViewerClient)를 그대로 렌더해 런타임 전체 체인을 검증한다.
 *
 * 시나리오:
 *   1) 탐색 모드 — 화면 중앙의 TRIGGER 박스(원점) 클릭
 *      → TARGET-A(x=3.5, 초록)가 위로 +3 이동 + play_sound(/test.mp3) 재생 시도
 *   2) 플레이 모드 — W로 전진, SENSOR(z=2.5) 통과(area_enter)
 *      → TARGET-B(x=-3.5, 빨강, 솔리드 physics)가 위로 +3 이동
 *      (TARGET-B는 RigidBody 내부에서 렌더되므로 비주얼이 움직이면
 *       바디/콜라이더 텔레포트까지 동작한 것)
 *
 * 검증: 헤드리스 Edge 스크린샷 + Audio 패치(window.__soundLog)로 확인.
 */

import { ViewerClient } from '@/app/space/[sceneId]/ViewerClient';
import { DEFAULT_ENVIRONMENT, DEFAULT_PHYSICS, SCENE_VERSION } from '@/types/scene';
import type { ProjectSceneSchema, ObjectNodeSchema, EventSchema } from '@/types/scene';

function makeBox(
  id: string,
  name: string,
  pos: { x: number; y: number; z: number },
  color: string,
  opts: { isSensor?: boolean; physics?: boolean; events?: EventSchema[]; scale?: { x: number; y: number; z: number } } = {},
): ObjectNodeSchema {
  return {
    id,
    name,
    assetId: null,
    primitiveShape: 'box',
    material: { color, roughness: 0.5, metalness: 0.1 },
    parentId: null,
    layer: 'default',
    position: pos,
    rotation: { x: 0, y: 0, z: 0 },
    scale: opts.scale ?? { x: 1.5, y: 1.5, z: 1.5 },
    visible: true,
    locked: false,
    physics: { ...DEFAULT_PHYSICS, enabled: opts.physics ?? false, isSensor: opts.isSensor ?? false },
    events: opts.events ?? [],
  };
}

const scene: ProjectSceneSchema = {
  projectId: 'test',
  sceneId: 'test-move-object',
  version: SCENE_VERSION,
  environment: {
    ...DEFAULT_ENVIRONMENT,
    ground: { enabled: true, color: '#334155' },
    playerStartPosition: { x: 0, y: 1, z: 6 },
  },
  assets: [],
  objects: [
    // 클릭 트리거 — 화면 중앙(원점)에 위치
    makeBox('trigger-box', 'TRIGGER', { x: 0, y: 0.75, z: 0 }, '#3b82f6', {
      events: [
        { id: 'ev-move-a', trigger: 'click', action: 'move_object', value: 'target-a|0,3,0|0.5' },
        { id: 'ev-sound', trigger: 'click', action: 'play_sound', value: '/test-beep.mp3' },
      ],
    }),
    // 탐색 모드 이동 대상 (physics 없음)
    makeBox('target-a', 'TARGET-A', { x: 3.5, y: 0.75, z: 0 }, '#22c55e'),
    // 플레이 모드 area_enter 트리거 — 카메라 방위각 때문에 전진 방향이 대각선이라
    // 넓은 게이트(x 20)로 만들어 어느 각도로 걸어도 통과하게 한다
    // 게이트는 낮게(y 0~1) — 탐색 카메라의 중앙 클릭 광선(이 지점에서 y≈1.25)을 가리지 않으면서
    // 캐릭터 캡슐(바닥부터 시작)과는 겹친다
    makeBox('sensor-box', 'SENSOR', { x: 0, y: 0.5, z: 2.5 }, '#a855f7', {
      isSensor: true,
      physics: true,
      scale: { x: 20, y: 1, z: 1 },
      events: [
        { id: 'ev-move-b', trigger: 'area_enter', action: 'move_object', value: 'target-b|0,3,0|1' },
        // 발동 여부 가시화 — 스크린샷에서 팝업이 보이면 area_enter가 발동한 것
        { id: 'ev-popup', trigger: 'area_enter', action: 'show_popup', value: 'SENSOR HIT' },
      ],
    }),
    // 플레이 모드 이동 대상 — 솔리드 physics: 비주얼이 RigidBody 자식이라
    // 움직이면 콜라이더 텔레포트까지 검증됨
    makeBox('target-b', 'TARGET-B', { x: -3.5, y: 0.75, z: 0 }, '#ef4444', { physics: true }),
  ],
};

export default function MoveObjectTestPage() {
  return (
    <ViewerClient
      scene={scene}
      projectName="move-object-test"
      isOwner={false}
      projectId="test"
      hideBadge
    />
  );
}
