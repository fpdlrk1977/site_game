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
  isActuator?: boolean;                 // 모터형 액추에이터(부품·경첩=원점). isGroup과 함께 씀
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
// 각 관절은 모터(isActuator·경첩=원점)이며, 시각 마디 메쉬 + 다음 관절 모터를 자식으로 갖는다(모터 체인).
// 기본 구동 = oscillate(마디마다 다른 속도·개별 위상 → 자연스러운 스윕). ▶ 플레이서 스스로 움직인다.
// (마디 base가 각 모터 원점이므로 예전 hinge{y:0}과 동일 거동 — 표현만 모터형으로 통일.)
const ROBOT_ARM: NodePreset = {
  id: 'robot_arm',
  label: '로봇팔',
  desc: '베이스+어깨+팔꿈치+손목 4개 모터가 자동으로 움직이는 다관절 팔(oscillate). ▶ 플레이서 스윕.',
  nodes: [
    { key: 'base', name: '로봇팔', isGroup: true, isActuator: true, position: { x: 0, y: 0, z: 0 },
      actuator: { kind: 'rotate', axis: 'y', min: -70, max: 70, drive: 'oscillate', speed: 0.6, loop: 'pingpong', value: 0 } },
    { key: 'base_mesh', parentKey: 'base', name: '베이스', primitiveShape: 'cylinder', material: { ...BASE_COL },
      position: { x: 0, y: 0.15, z: 0 }, scale: { x: 0.9, y: 0.3, z: 0.9 } },

    { key: 'shoulder', parentKey: 'base', name: '어깨', isGroup: true, isActuator: true, position: { x: 0, y: 0.3, z: 0 },
      actuator: { kind: 'rotate', axis: 'z', min: -25, max: 50, drive: 'oscillate', speed: 0.85, loop: 'pingpong', value: 0 } },
    { key: 'seg1', parentKey: 'shoulder', name: '상완', primitiveShape: 'box', material: { ...ARM_COL },
      position: { x: 0, y: 0.7, z: 0 }, scale: { x: 0.28, y: 1.4, z: 0.28 } },

    { key: 'elbow', parentKey: 'shoulder', name: '팔꿈치', isGroup: true, isActuator: true, position: { x: 0, y: 1.4, z: 0 },
      actuator: { kind: 'rotate', axis: 'z', min: 5, max: 95, drive: 'oscillate', speed: 1.05, loop: 'pingpong', value: 0 } },
    { key: 'seg2', parentKey: 'elbow', name: '전완', primitiveShape: 'box', material: { ...ARM_COL },
      position: { x: 0, y: 0.55, z: 0 }, scale: { x: 0.22, y: 1.1, z: 0.22 } },

    { key: 'wrist', parentKey: 'elbow', name: '손목', isGroup: true, isActuator: true, position: { x: 0, y: 1.1, z: 0 },
      actuator: { kind: 'rotate', axis: 'y', min: -60, max: 60, drive: 'oscillate', speed: 1.4, loop: 'pingpong', value: 0 } },
    { key: 'hand', parentKey: 'wrist', name: '그리퍼', primitiveShape: 'box', material: { ...JOINT_COL },
      position: { x: 0, y: 0.12, z: 0 }, scale: { x: 0.4, y: 0.24, z: 0.3 } },
  ],
};

// ── 모터 프리셋 ───────────────────────────────────────────────────────────
// 전부 모터(isActuator·경첩=원점)로 만든 "완성형 기계". 기본 구동 = oscillate라 ▶ 플레이서 스스로 움직인다.
// 콜라이더는 기본 OFF(장식·통과)이며, 각 모터의 Actuator 섹션에서 '콜라이더 동반'을 켜면 진짜 부딪힌다.
//   (오실레이트 콜라이더는 움직이며 캐릭터를 밀지 못하는 한계가 있어 기본 OFF — doc 알려진 제약 참고.)

const WOOD = { color: '#6b4a2f', roughness: 0.7, metalness: 0 };
const METAL = { color: '#5a5e66', roughness: 0.4, metalness: 0.6 };
const GLASS = { color: '#9fc3d6', roughness: 0.2, metalness: 0.1 };

// 여닫이문 — 왼쪽 모서리를 경첩(모터 원점)으로 Y축 회전. 자동으로 열렸다 닫힘(oscillate).
//   Drive를 '이벤트'로 바꾸면 버튼/E(interact)로 여는 문이 된다.
const HINGED_DOOR: NodePreset = {
  id: 'hinged_door',
  label: '여닫이문',
  desc: '왼쪽 경첩으로 자동 여닫힘(oscillate). Drive를 이벤트로 바꾸면 E로 여는 문. 콜라이더 켜면 막힘.',
  nodes: [
    { key: 'door', name: '여닫이문', isGroup: true, isActuator: true, position: { x: 0, y: 0, z: 0 },
      actuator: { kind: 'rotate', axis: 'y', min: 0, max: 100, drive: 'oscillate', speed: 0.4, loop: 'pingpong', value: 0 } },
    // 문짝: 왼쪽 모서리(x=0=경첩)에서 오른쪽으로 뻗도록 중심을 +x로. 회전축(원점)에서 여닫힘.
    { key: 'panel', parentKey: 'door', name: '문짝', primitiveShape: 'box', material: { ...WOOD },
      position: { x: 0.55, y: 1.1, z: 0 }, scale: { x: 1.1, y: 2.2, z: 0.12 } },
    { key: 'knob', parentKey: 'door', name: '손잡이', primitiveShape: 'sphere', material: { ...METAL, metalness: 0.8 },
      position: { x: 0.98, y: 1.1, z: 0.1 }, scale: { x: 0.12, y: 0.12, z: 0.12 } },
  ],
};

// 엘리베이터 — Y축 직선 왕복(slide). 바닥판 + 3면 벽이 함께 오르내린다.
const ELEVATOR: NodePreset = {
  id: 'elevator',
  label: '엘리베이터',
  desc: 'Y축으로 오르내리는 승강기(slide·oscillate). 바닥판+벽이 함께 이동. 콜라이더 켜면 승강판이 됨.',
  nodes: [
    { key: 'elev', name: '엘리베이터', isGroup: true, isActuator: true, position: { x: 0, y: 0.1, z: 0 },
      actuator: { kind: 'slide', axis: 'y', min: 0, max: 3, drive: 'oscillate', speed: 0.5, loop: 'pingpong', value: 0 } },
    { key: 'floor', parentKey: 'elev', name: '바닥판', primitiveShape: 'box', material: { ...METAL },
      position: { x: 0, y: 0, z: 0 }, scale: { x: 2, y: 0.2, z: 2 } },
    { key: 'back', parentKey: 'elev', name: '뒷벽', primitiveShape: 'box', material: { ...METAL, color: '#4a4e56' },
      position: { x: 0, y: 1.1, z: -0.9 }, scale: { x: 2, y: 2, z: 0.1 } },
    { key: 'left', parentKey: 'elev', name: '왼벽', primitiveShape: 'box', material: { ...METAL, color: '#4a4e56' },
      position: { x: -0.95, y: 1.1, z: 0 }, scale: { x: 0.1, y: 2, z: 2 } },
    { key: 'right', parentKey: 'elev', name: '오른벽', primitiveShape: 'box', material: { ...METAL, color: '#4a4e56' },
      position: { x: 0.95, y: 1.1, z: 0 }, scale: { x: 0.1, y: 2, z: 2 } },
  ],
};

// 회전문 — 한 모터(Y축 연속 회전)에 4개 유리 날개 + 중심 기둥. "한 모터에 여러 부품"의 표본.
const REVOLVING_DOOR: NodePreset = {
  id: 'revolving_door',
  label: '회전문',
  desc: '중심 기둥 + 4개 날개가 한 모터로 계속 회전(oscillate·한 방향). 한 모터에 여러 부품 붙인 예.',
  nodes: [
    { key: 'rev', name: '회전문', isGroup: true, isActuator: true, position: { x: 0, y: 0, z: 0 },
      actuator: { kind: 'rotate', axis: 'y', min: 0, max: 360, drive: 'oscillate', speed: 0.3, loop: 'forward', value: 0 } },
    { key: 'hub', parentKey: 'rev', name: '중심기둥', primitiveShape: 'cylinder', material: { ...METAL },
      position: { x: 0, y: 1.1, z: 0 }, scale: { x: 0.2, y: 2.2, z: 0.2 } },
    { key: 'w1', parentKey: 'rev', name: '날개 앞', primitiveShape: 'box', material: { ...GLASS },
      position: { x: 0, y: 1.1, z: 0.7 }, scale: { x: 0.08, y: 2.1, z: 1.4 } },
    { key: 'w2', parentKey: 'rev', name: '날개 뒤', primitiveShape: 'box', material: { ...GLASS },
      position: { x: 0, y: 1.1, z: -0.7 }, scale: { x: 0.08, y: 2.1, z: 1.4 } },
    { key: 'w3', parentKey: 'rev', name: '날개 오른', primitiveShape: 'box', material: { ...GLASS },
      position: { x: 0.7, y: 1.1, z: 0 }, scale: { x: 1.4, y: 2.1, z: 0.08 } },
    { key: 'w4', parentKey: 'rev', name: '날개 왼', primitiveShape: 'box', material: { ...GLASS },
      position: { x: -0.7, y: 1.1, z: 0 }, scale: { x: 1.4, y: 2.1, z: 0.08 } },
  ],
};

// 기어 한 쌍 — 평범한 그룹(고정 틀) 안에 모터 2개(각 Z축 연속 회전). 한쪽을 180° 뒤집어 맞물려 반대로 돎.
//   ★ 평범한 그룹 안에 모터 여러 개 = GroupWithCollision 라우팅 픽스(2026-07-20)로 동작.
const GEARS: NodePreset = {
  id: 'gears',
  label: '기어 한 쌍',
  desc: '맞물려 반대로 도는 톱니 2개(각각 모터). 평범한 그룹에 모터 여러 개를 넣은 조립품 예.',
  nodes: [
    { key: 'gears', name: '기어 한 쌍', isGroup: true, position: { x: 0, y: 0, z: 0 } },
    // 왼 기어 (시계 방향)
    { key: 'gA', parentKey: 'gears', name: '기어 A', isGroup: true, isActuator: true, position: { x: -0.62, y: 0.62, z: 0 },
      actuator: { kind: 'rotate', axis: 'z', min: 0, max: 360, drive: 'oscillate', speed: 0.5, loop: 'forward', value: 0 } },
    { key: 'dA', parentKey: 'gA', name: '톱니 A', primitiveShape: 'cylinder', material: { ...METAL, metalness: 0.7 },
      position: { x: 0, y: 0, z: 0 }, rotation: { x: 90, y: 0, z: 0 }, scale: { x: 1.2, y: 0.25, z: 1.2 } },
    { key: 'mA', parentKey: 'gA', name: '표식 A', primitiveShape: 'box', material: { color: '#f4c430', roughness: 0.5, metalness: 0.2 },
      position: { x: 0.42, y: 0, z: 0.16 }, scale: { x: 0.16, y: 0.16, z: 0.4 } },
    // 오른 기어 (180° 뒤집어 반대 방향으로 맞물림)
    { key: 'gB', parentKey: 'gears', name: '기어 B', isGroup: true, isActuator: true, position: { x: 0.62, y: 0.62, z: 0 }, rotation: { x: 0, y: 180, z: 0 },
      actuator: { kind: 'rotate', axis: 'z', min: 0, max: 360, drive: 'oscillate', speed: 0.5, loop: 'forward', value: 0 } },
    { key: 'dB', parentKey: 'gB', name: '톱니 B', primitiveShape: 'cylinder', material: { ...METAL, metalness: 0.7 },
      position: { x: 0, y: 0, z: 0 }, rotation: { x: 90, y: 0, z: 0 }, scale: { x: 1.2, y: 0.25, z: 1.2 } },
    { key: 'mB', parentKey: 'gB', name: '표식 B', primitiveShape: 'box', material: { color: '#f4c430', roughness: 0.5, metalness: 0.2 },
      position: { x: 0.42, y: 0, z: 0.16 }, scale: { x: 0.16, y: 0.16, z: 0.4 } },
  ],
};

export const NODE_PRESETS: NodePreset[] = [ROBOT_ARM, HINGED_DOOR, ELEVATOR, REVOLVING_DOOR, GEARS];

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
