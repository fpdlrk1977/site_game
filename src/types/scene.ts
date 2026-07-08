export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export type HdrPreset = 'none' | 'sunset' | 'dawn' | 'night' | 'warehouse' | 'forest' | 'apartment' | 'studio' | 'city' | 'park' | 'lobby';
export type GroundPreset = 'custom' | 'grass' | 'dirt' | 'sand' | 'stone' | 'water';

export interface EnvSchema {
  sky: { type: 'color' | 'hdr' | 'sky'; value: string };
  hdrPreset?: HdrPreset;
  ground?: { enabled: boolean; color: string; preset?: GroundPreset; textureUrl?: string };
  boundary?: number;  // 경계 X 반경(중심→벽). >0이면 이동 제한(콜라이더) 항상 존재
  boundaryZ?: number; // 경계 Z 반경. 미설정 시 boundary와 같음(정사각) — 직사각 지원
  // 경계 벽 시각 — 미설정/none = 안 보임(투명, 영역만). color=단색 벽, texture=이미지 매핑 벽.
  boundaryWall?: {
    style?: 'none' | 'color' | 'texture';
    color?: string;
    textureUrl?: string;
    height?: number;   // 벽 높이 (기본 8)
    opacity?: number;  // 0~1 (기본 1)
    ceiling?: boolean; // 천장 포함(완전한 방)
  };
  fog: { enabled: boolean; color: string; near: number; far: number };
  lights: {
    ambientIntensity: number;
    directionalPosition: Vector3;
    directionalIntensity: number;
  };
  playerCharacterId?: string;
  playerCharacterScale?: number;
  playerSpeed?: number;
  playerJumpForce?: number;
  playerStartPosition?: Vector3;
  // 뷰어 진입 시 기본 모드. 미설정 = 'explore'(기존 동작). 'play'면 접속하자마자 플레이 모드로 시작.
  defaultMode?: 'explore' | 'play';
  // true면 이 씬은 '둘러보기 전용' — 걷기(플레이) 모드·캐릭터 없음, 뷰어에서 플레이 토글 숨김. (포트폴리오/제품 뷰어)
  disableWalk?: boolean;
  // 상호작용(클릭/호버 이벤트) 오브젝트 위에 떠다니는 힌트 링 표시. 미설정 = 켜짐(true).
  // 탐색 모드 뷰어/임베드에서만 렌더(플레이 모드·에디터는 미표시). 포트폴리오 등 깔끔한 씬은 끌 수 있음.
  showInteractionHints?: boolean;
  notes?: string;
  postProcessing?: { preset: PostProcessPreset };
  // 렌더러 노출(밝기) — LinearToneMapping의 toneMappingExposure. 미설정 = 1(기본).
  // 톤매핑은 코드에서 Linear로 고정 — 저장 색을 최대한 그대로 렌더(측정상 none과 동일 정확도).
  toneMappingExposure?: number;
  // 오브젝트 아래 부드러운 접지 그림자(drei ContactShadows). 미설정/false = 꺼짐(opt-in).
  // 바닥에 '붙은 느낌'을 강화하지만 매 프레임 렌더라 비용이 있어 기본은 꺼둔다.
  contactShadows?: boolean;
}

export interface EventSchema {
  id: string;
  // interact: 플레이 모드에서 캐릭터가 근접(기본 3m)했을 때 E키(모바일=액션 버튼)로 발동.
  //   NPC 대화·문 열기·아이템 줍기 등 "다가가 상호작용" 문법. 탐색 모드에선 발동 안 함(클릭 이벤트로 대체).
  trigger: 'click' | 'hover_enter' | 'hover_exit' | 'area_enter' | 'area_exit' | 'interact';
  action:
    | 'open_url'
    | 'show_popup'
    | 'emit_event'
    | 'play_animation'
    | 'go_to_scene'
    | 'show_object'    // value = 대상 objectId (표시)
    | 'hide_object'    // value = 대상 objectId (숨김)
    | 'toggle_object'  // value = 대상 objectId (표시/숨김 토글)
    | 'focus_object'   // value = 대상 objectId (카메라를 그 오브젝트로 이동/포커스, 탐색 모드)
    | 'reset_camera'   // value 불필요 (카메라를 초기 시점으로 복귀, 탐색 모드)
    | 'animate_object' // value = "대상objectId|클립이름" (대상 GLB의 애니메이션 재생)
    | 'move_object'    // value = "대상objectId|dx,dy,dz|초" (원래 저장 위치 기준 오프셋으로 부드럽게 이동)
    | 'play_sound';    // value = 오디오 URL (mp3 등)
  // go_to_scene: 이동할 대상 sceneId. show/hide/toggle/focus_object: 대상 objectId.
  // reset_camera: value 없음. animate_object: "objectId|clipName".
  // move_object: "objectId|dx,dy,dz|durationSec" — 오프셋은 누적이 아니라 항상 원래 위치 기준.
  //   (0,0,0) 오프셋 이벤트를 만들면 제자리로 돌아온다. play_sound: 오디오 URL.
  // 그 외: 기존 의미(URL/텍스트/이벤트명/클립명).
  value: string;
  eventPayload?: Record<string, unknown>;
}

export type ColliderType = 'box' | 'sphere' | 'capsule' | 'hull' | 'trimesh';

export interface PhysicsSchema {
  enabled: boolean;
  colliderType: ColliderType;
  isSensor: boolean;
  mass: number;
  friction: number;
  restitution: number;
}

export type PrimitiveShape = 'box' | 'sphere' | 'cylinder' | 'plane';

export type ContentType = 'text' | 'image' | 'video';

export interface ContentConfig {
  type: ContentType;
  text?: string;
  fontSize?: number;
  color?: string;
  depth?: number;
  url?: string;
}

export type ParticlePreset = 'fire' | 'dust' | 'light' | 'snow';

export type PostProcessPreset = 'none' | 'cinematic' | 'dreamy' | 'vintage' | 'sharp';

export type LightType = 'point' | 'spot' | 'directional';
export interface LightConfig {
  type: LightType;
  color: string;
  intensity: number;
  distance?: number;
  decay?: number;
  angle?: number;
  penumbra?: number;
  castShadow?: boolean;
}

export interface ParticleConfig {
  preset: ParticlePreset;
  count?: number;
  color?: string;
  speed?: number;
  spread?: number;
  size?: number;
}

export interface MaterialOverride {
  color?: string;
  roughness?: number;
  metalness?: number;
  emissive?: string;
}

export interface ObjectNodeSchema {
  id: string;
  name: string;
  assetId: string | null;
  primitiveShape?: PrimitiveShape;
  material?: MaterialOverride;
  parentId: string | null;
  layer: string;
  position: Vector3;
  rotation: Vector3; // Euler degrees
  scale: Vector3;
  visible: boolean;
  locked: boolean;
  physics: PhysicsSchema;
  events: EventSchema[];
  content?: ContentConfig;
  particle?: ParticleConfig;
  light?: LightConfig;
  isGroup?: boolean;
  // 앰비언트 애니메이션 — 뷰어에서 항상 실행되는 트랜스폼 애니(GLB 자체 클립과 별개). 현재 GLB·프리미티브만.
  motion?: MotionConfig;
  // (레거시) 단문 근접 말풍선 — dialogue 미설정 시 lines:[interactLabel]·approach·auto로 해석.
  interactLabel?: string;
  // 대화(말풍선) — 오브젝트 위에 뜨는 순차 문장. 플레이 모드 전용.
  dialogue?: DialogueConfig;
}

export interface MotionConfig {
  // float=둥실(위아래) / spin=제자리 회전(Y축) / pulse=커졌다작아짐 / orbit=원 궤도 / wander=영역 내 유동(열기구식)
  type: 'float' | 'spin' | 'pulse' | 'orbit' | 'wander';
  speed?: number;     // 속도 배수 (기본 1)
  amplitude?: number; // float=y 진폭 / pulse=스케일 진폭 (기본 float 0.5 · pulse 0.2)
  radius?: number;    // orbit=궤도 반경 / wander=이동 반경 (기본 orbit 2 · wander 3)
  axis?: 'x' | 'y' | 'z'; // spin 회전축 (기본 y)
  collider?: boolean; // 플레이 모드에서 콜라이더도 함께 이동(진짜 이동 장애물). 기본 false=시각 전용
}

export interface DialogueConfig {
  lines: string[];                          // 순차로 표시할 문장들 (빈 줄은 무시)
  show: 'always' | 'approach' | 'interact'; // 항상 / 근접(기본 3m) / E키로 열기
  advance: 'auto' | 'manual';               // auto=타이머 자동 넘김, manual=E키로 넘김
  autoSec?: number;                         // auto일 때 문장 간 간격(초). 기본 2.5
  speaker?: string;                         // 화자 이름(말풍선 상단). 선택
  typing?: boolean;                         // 타이핑(타자기) 효과. 기본 true
}

export interface AssetRefSchema {
  id: string;
  dracoUrl: string;
  name: string;
  type?: 'model' | 'character';
  thumbnailUrl?: string;
}

export interface ProjectSceneSchema {
  projectId: string;
  sceneId: string;
  version: number;
  environment: EnvSchema;
  assets: AssetRefSchema[];
  objects: ObjectNodeSchema[];
}

export const DEFAULT_PHYSICS: PhysicsSchema = {
  enabled: false,
  colliderType: 'hull',
  isSensor: false,
  mass: 0,
  friction: 0.5,
  restitution: 0.0,
};

export const DEFAULT_ENVIRONMENT: EnvSchema = {
  sky: { type: 'color', value: '#1a1a2e' },
  fog: { enabled: false, color: '#ffffff', near: 10, far: 100 },
  lights: {
    ambientIntensity: 0.6,
    directionalPosition: { x: 5, y: 10, z: 5 },
    directionalIntensity: 1.2,
  },
};

export const SCENE_VERSION = 1;

export function makeEmptySceneData(projectId: string, sceneId: string): ProjectSceneSchema {
  return {
    projectId,
    sceneId,
    version: SCENE_VERSION,
    environment: DEFAULT_ENVIRONMENT,
    assets: [],
    objects: [],
  };
}

/** Coerce any stored scene_data shape into ProjectSceneSchema */
export function normalizeSceneData(
  raw: Record<string, unknown>,
  projectId: string,
  sceneId: string,
): ProjectSceneSchema {
  if (
    typeof raw.projectId === 'string' &&
    typeof raw.sceneId === 'string' &&
    Array.isArray(raw.objects)
  ) {
    return {
      projectId: raw.projectId,
      sceneId: raw.sceneId,
      version: typeof raw.version === 'number' ? raw.version : SCENE_VERSION,
      environment: (raw.environment as EnvSchema | undefined) ?? DEFAULT_ENVIRONMENT,
      assets: Array.isArray(raw.assets) ? (raw.assets as AssetRefSchema[]) : [],
      objects: raw.objects as ObjectNodeSchema[],
    };
  }
  return makeEmptySceneData(projectId, sceneId);
}
