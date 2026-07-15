// 오브젝트 프리셋(STEP 4) — "완성형 재료"를 스탬프로 찍어낸다.
// 새 런타임이 아니라 기존 시스템(motion·physics·events·게임변수)의 조합일 뿐 —
// 일반인이 만드는 법을 몰라도 굴러가는 바퀴·열리는 문·먹는 동전을 즉시 얻는다.
// 찍는 순간 평범한 오브젝트가 되며(프리셋과 링크 없음), 재사용은 기존 Prefab에 맡긴다.

import type { ObjectNodeSchema, EventTrigger, EventAction } from '@/types/scene';

// 이벤트 value가 '자기 자신'을 가리킬 때의 센티넬 — addPreset이 생성된 오브젝트 id로 치환.
export const PRESET_SELF = '@self';

type Vec3 = { x: number; y: number; z: number };
interface PresetEventDef { trigger: EventTrigger; action: EventAction; value: string }

export interface ObjectPreset {
  id: string;
  label: string;
  desc: string;
  // 점수 등에 쓰는 'score' 변수를 없으면 자동 생성할지
  ensureScore?: boolean;
  build: {
    primitiveShape: ObjectNodeSchema['primitiveShape'];
    material: ObjectNodeSchema['material'];
    position: Vec3;
    rotation?: Vec3;
    scale?: Vec3;
    motion?: ObjectNodeSchema['motion'];
    physics?: Partial<ObjectNodeSchema['physics']>;
    events?: PresetEventDef[];
  };
}

export const OBJECT_PRESETS: ObjectPreset[] = [
  {
    id: 'wheel',
    label: '바퀴',
    desc: '눕힌 원기둥이 굴러가는 축으로 자동 회전(motion). 수레·차량 장식에.',
    build: {
      primitiveShape: 'cylinder',
      material: { color: '#2b2b30', roughness: 0.85, metalness: 0.1 },
      position: { x: 0, y: 0.5, z: 0 },
      rotation: { x: 0, y: 0, z: 90 }, // 눕혀 축을 수평으로
      scale: { x: 1, y: 0.4, z: 1 },   // 타이어 비율(얇게)
      motion: { type: 'spin', axis: 'y', speed: 2 }, // 로컬 Y = 눕힌 축 → 구름
    },
  },
  {
    id: 'door',
    label: '문',
    desc: '솔리드 벽. 다가가 E를 누르면 통과 가능(interact → set_passable).',
    build: {
      primitiveShape: 'box',
      material: { color: '#6b4a2f', roughness: 0.7, metalness: 0 },
      position: { x: 0, y: 1.1, z: 0 }, // 밑면이 바닥(높이 2.2의 절반)
      scale: { x: 1.1, y: 2.2, z: 0.15 },
      physics: { enabled: true, colliderType: 'box', isSensor: false },
      events: [{ trigger: 'interact', action: 'set_passable', value: PRESET_SELF }],
    },
  },
  {
    id: 'coin',
    label: '동전',
    desc: '반짝이며 도는 센서. 닿으면 점수 +1 후 사라짐(area_enter → score+1 · 숨김).',
    ensureScore: true,
    build: {
      primitiveShape: 'cylinder',
      material: { color: '#f4c430', roughness: 0.3, metalness: 0.85, emissive: '#4a3a00' },
      position: { x: 0, y: 0.8, z: 0 },
      rotation: { x: 90, y: 0, z: 0 }, // 세워 동전처럼
      scale: { x: 0.55, y: 0.08, z: 0.55 },
      motion: { type: 'spin', axis: 'z', speed: 3 }, // 세운 상태 수직축 회전 → 반짝
      physics: { enabled: true, colliderType: 'hull', isSensor: true }, // 통과 트리거
      events: [
        { trigger: 'area_enter', action: 'set_variable', value: 'score|add|1' },
        { trigger: 'area_enter', action: 'hide_object', value: PRESET_SELF },
      ],
    },
  },
];
