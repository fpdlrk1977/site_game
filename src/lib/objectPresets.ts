// 오브젝트 프리셋(STEP 4) — "완성형 재료"를 스탬프로 찍어낸다.
// 새 런타임이 아니라 기존 시스템(motion·physics·events·게임변수)의 조합일 뿐 —
// 일반인이 만드는 법을 몰라도 굴러가는 바퀴·열리는 문·먹는 동전을 즉시 얻는다.
// 찍는 순간 평범한 오브젝트가 되며(프리셋과 링크 없음), 재사용은 기존 Prefab에 맡긴다.

import type { ObjectNodeSchema, EventTrigger, EventAction, ActuatorConfig } from '@/types/scene';

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

// ── 다관절(중첩) 프리셋 ───────────────────────────────────────────────────
// 단일 오브젝트가 아니라 부모-자식 계층 트리를 한 번에 스탬프. 각 관절 그룹에 actuator를 얹으면
// 런타임이 "부모 actuator가 서브트리 이동 + 자식 actuator가 로컬 회전"으로 다관절을 굴린다(doc §6).
// 자식을 담으려면 반드시 그룹(isGroup)이어야 렌더 트리가 자식을 순회한다.
export interface PresetNode {
  key: string;                          // 트리 내 임시 키(parentKey 참조용)
  parentKey?: string;                   // 부모 노드 key. 없으면 루트
  name: string;
  isGroup?: boolean;                    // 자식을 담는 관절 그룹은 true
  primitiveShape?: ObjectNodeSchema['primitiveShape'];
  material?: ObjectNodeSchema['material'];
  position: Vec3;                       // 부모 로컬 좌표
  rotation?: Vec3;
  scale?: Vec3;
  actuator?: ActuatorConfig;
}
export interface NodePreset {
  id: string;
  label: string;
  desc: string;
  nodes: PresetNode[];                  // parentKey 없는 노드 = 루트(1개)
}

const ARM_COL = { color: '#c04a2b', roughness: 0.5, metalness: 0.2 };   // 팔 마디(주황)
const JOINT_COL = { color: '#2f3238', roughness: 0.4, metalness: 0.65 }; // 관절/그리퍼(짙은 금속)
const BASE_COL = { color: '#3a3d44', roughness: 0.4, metalness: 0.7 };   // 베이스

// 로봇팔 — 베이스(Y회전 턴테이블) → 어깨(Z경첩) → 팔꿈치(Z경첩) → 손목(Y회전).
// 각 관절 그룹은 경첩을 자기 밑면(hinge y:0)에 두고, 시각 마디 메쉬 + 다음 관절 그룹을 자식으로 갖는다.
// 기본 구동 = oscillate(마디마다 다른 속도·개별 위상 → 자연스러운 스윕). ▶ 플레이서 스스로 움직인다.
const ROBOT_ARM: NodePreset = {
  id: 'robot_arm',
  label: '로봇팔',
  desc: '베이스+어깨+팔꿈치+손목 4관절이 자동으로 움직이는 다관절 팔(oscillate). ▶ 플레이서 스윕.',
  nodes: [
    { key: 'base', name: '로봇팔', isGroup: true, position: { x: 0, y: 0, z: 0 },
      actuator: { kind: 'rotate', axis: 'y', hinge: { x: 0.5, y: 0, z: 0.5 }, min: -70, max: 70, drive: 'oscillate', speed: 0.6, loop: 'pingpong', value: 0 } },
    { key: 'base_mesh', parentKey: 'base', name: '베이스', primitiveShape: 'cylinder', material: { ...BASE_COL },
      position: { x: 0, y: 0.15, z: 0 }, scale: { x: 0.9, y: 0.3, z: 0.9 } },

    { key: 'shoulder', parentKey: 'base', name: '어깨', isGroup: true, position: { x: 0, y: 0.3, z: 0 },
      actuator: { kind: 'rotate', axis: 'z', hinge: { x: 0.5, y: 0, z: 0.5 }, min: -25, max: 50, drive: 'oscillate', speed: 0.85, loop: 'pingpong', value: 0 } },
    { key: 'seg1', parentKey: 'shoulder', name: '상완', primitiveShape: 'box', material: { ...ARM_COL },
      position: { x: 0, y: 0.7, z: 0 }, scale: { x: 0.28, y: 1.4, z: 0.28 } },

    { key: 'elbow', parentKey: 'shoulder', name: '팔꿈치', isGroup: true, position: { x: 0, y: 1.4, z: 0 },
      actuator: { kind: 'rotate', axis: 'z', hinge: { x: 0.5, y: 0, z: 0.5 }, min: 5, max: 95, drive: 'oscillate', speed: 1.05, loop: 'pingpong', value: 0 } },
    { key: 'seg2', parentKey: 'elbow', name: '전완', primitiveShape: 'box', material: { ...ARM_COL },
      position: { x: 0, y: 0.55, z: 0 }, scale: { x: 0.22, y: 1.1, z: 0.22 } },

    { key: 'wrist', parentKey: 'elbow', name: '손목', isGroup: true, position: { x: 0, y: 1.1, z: 0 },
      actuator: { kind: 'rotate', axis: 'y', hinge: { x: 0.5, y: 0, z: 0.5 }, min: -60, max: 60, drive: 'oscillate', speed: 1.4, loop: 'pingpong', value: 0 } },
    { key: 'hand', parentKey: 'wrist', name: '그리퍼', primitiveShape: 'box', material: { ...JOINT_COL },
      position: { x: 0, y: 0.12, z: 0 }, scale: { x: 0.4, y: 0.24, z: 0.3 } },
  ],
};

export const NODE_PRESETS: NodePreset[] = [ROBOT_ARM];

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
