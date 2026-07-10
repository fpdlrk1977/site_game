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
  // 상호작용 근접 범위(m) 씬 기본값 — interact(E)/approach 트리거·E 프롬프트·하이라이트가 공유.
  //   미설정 = 3. 오브젝트가 자체 interactRange를 가지면 그 값이 우선한다.
  interactRange?: number;
  notes?: string;
  postProcessing?: { preset: PostProcessPreset };
  // 렌더러 노출(밝기) — LinearToneMapping의 toneMappingExposure. 미설정 = 1(기본).
  // 톤매핑은 코드에서 Linear로 고정 — 저장 색을 최대한 그대로 렌더(측정상 none과 동일 정확도).
  toneMappingExposure?: number;
  // 오브젝트 아래 부드러운 접지 그림자(drei ContactShadows). 미설정/false = 꺼짐(opt-in).
  // 바닥에 '붙은 느낌'을 강화하지만 매 프레임 렌더라 비용이 있어 기본은 꺼둔다.
  contactShadows?: boolean;
  // 씬 전역 기본 팝업 스타일 (Phase 2). 개별 이벤트의 popup이 설정한 필드가 우선하고,
  //   비운 필드는 이 기본값 → 하드 기본값 순으로 폴백한다(interactRange 패턴). 스타일 전용(mode/제목은 이벤트별).
  defaultPopup?: Pick<PopupConfig, 'position' | 'width' | 'height' | 'bg' | 'anim'>;
}

export interface EventSchema {
  id: string;
  // interact: 플레이 모드에서 캐릭터가 근접(기본 3m)했을 때 E키(모바일=액션 버튼)로 발동.
  //   NPC 대화·문 열기·아이템 줍기 등 "다가가 상호작용" 문법. 탐색 모드에선 발동 안 함(클릭 이벤트로 대체).
  // approach_enter/exit: 플레이 모드에서 캐릭터가 오브젝트 근접 범위(interact와 동일 반경, 기본 3m)에
  //   들어오거나 벗어날 때 키 없이 자동 발동. 오브젝트는 솔리드 유지 가능(area와 달리 센서 불필요).
  //   "다가가면 NPC가 손 흔들기/사운드" 같은 근접 자동 연출. area(임의 볼륨 진입)와 달리 오브젝트 중심 반경.
  // dialogue_end: 이 오브젝트의 대화(말풍선)가 마지막 문장까지 재생되면 자동 발동(플레이 모드 전용).
  //   "대사 끝나면 팝업/문 열기/씬 이동" 같은 대화→액션 연결. 세션당 1회(대화 세션 리셋 시 재발동 가능).
  trigger: 'click' | 'hover_enter' | 'hover_exit' | 'area_enter' | 'area_exit' | 'interact' | 'approach_enter' | 'approach_exit' | 'dialogue_end';
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
    | 'set_passable'   // value = 대상 objectId (플레이 모드 콜라이더 제거 → 통과 가능, 문 열기)
    | 'set_solid'      // value = 대상 objectId (콜라이더 복구 → 다시 막힘, 문 닫기)
    | 'toggle_collision' // value = 대상 objectId (통과 가능/막힘 토글)
    | 'play_sound';    // value = 오디오 URL (mp3 등)
  // go_to_scene: 이동할 대상 sceneId. show/hide/toggle/focus_object: 대상 objectId.
  // reset_camera: value 없음. animate_object: "objectId|clipName".
  // move_object: "objectId|dx,dy,dz|durationSec" — 오프셋은 누적이 아니라 항상 원래 위치 기준.
  //   (0,0,0) 오프셋 이벤트를 만들면 제자리로 돌아온다. play_sound: 오디오 URL.
  // 그 외: 기존 의미(URL/텍스트/이벤트명/클립명).
  value: string;
  eventPayload?: Record<string, unknown>;
  // show_popup 전용 표시 설정(옵셔널·하위호환). 없으면 기존 RichContent 자동판별 팝업.
  popup?: PopupConfig;
}

// show_popup 팝업의 표시 방식/스타일 (Phase 1).
export interface PopupConfig {
  //  auto  = value를 RichContent가 자동판별(이미지/영상/YouTube/URL링크/텍스트) — 기존 동작
  //  url   = value(웹사이트 URL)를 <iframe src>로 팝업 안에 삽입
  //  html  = value(HTML 문자열)를 <iframe srcdoc sandbox>로 격리 렌더
  mode?: 'auto' | 'url' | 'html';
  width?: string;   // 예: '800px' | '90vw' — iframe 모드 팝업 카드 너비(미설정=기본값)
  height?: string;  // 예: '600px' | '80vh'
  bg?: string;      // 카드 배경색(미설정=흰색)
  title?: string;   // 팝업 제목(미설정=오브젝트 이름)
  // 팝업 위치 프리셋 (Phase 2). center=중앙 모달(기본), left/right=사이드 패널, bottom=바텀시트.
  position?: 'center' | 'left' | 'right' | 'bottom';
  // 등장 애니메이션 (Phase 3). auto=위치에 맞게 자동(기본), none/fade/scale/slide.
  anim?: 'auto' | 'none' | 'fade' | 'scale' | 'slide';
  // 몰입형(chrome=false)이면 제목바·하단 닫기버튼을 숨기고 플로팅 ✕만 + 여백 0(edge-to-edge iframe용). 미설정=true.
  chrome?: boolean;
  // 카드 내부 여백 override. 예: '0' | '24px'. 미설정이면 기본 여백.
  padding?: string;
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

export type PrimitiveShape = 'box' | 'sphere' | 'cylinder' | 'plane' | 'frustum' | 'loft';

// 프리미티브 확장 지오메트리 파라미터(옵셔널=하위호환). 미설정이면 각진 기본 형태.
export interface PrimitiveGeom {
  // box: 모서리 둥글기(0=각짐). 반변(0.5) 기준 0~0.5.
  cornerRadius?: number;
  // box 둥근 모서리 부드러움(세그먼트). 기본 4.
  cornerSegments?: number;
  // frustum: 윗면 크기 배율(아랫면=1 기준). 0=뾰족(각뿔), 1=박스. 0~1.
  topScale?: number;
  // loft: 아래→위 각 단면의 크기 배율(0~1). 2개 이상. 각뿔대(frustum)를 N단면으로 일반화.
  sections?: number[];
}

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
  // 프리미티브 확장 지오메트리 파라미터(둥근 박스 cornerRadius·각뿔대 topScale 등).
  geom?: PrimitiveGeom;
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
  // 기본 애니메이션 클립 — GLB 내장 클립 중 트리거 없이 씬 로드 시 자동 루프 재생할 클립 이름.
  // 이벤트(click/hover/area/animate_object) 트리거 클립이 오면 fadeOut되며 덮인다(복귀 없음 — MVP).
  defaultClip?: string;
  // (레거시) 단문 근접 말풍선 — dialogue 미설정 시 lines:[interactLabel]·approach·auto로 해석.
  interactLabel?: string;
  // 대화(말풍선) — 오브젝트 위에 뜨는 순차 문장. 플레이 모드 전용.
  dialogue?: DialogueConfig;
  // 이 오브젝트의 상호작용 근접 범위(m) 오버라이드 — 미설정이면 씬 기본값(EnvSchema.interactRange ?? 3).
  //   interact(E)/approach 트리거·E 프롬프트·하이라이트에 적용.
  interactRange?: number;

  // ── 프리팹 인스턴스 링크 (전부 옵셔널 = 하위호환) ──
  // 이 오브젝트가 프리팹에서 펼쳐진(bake) 인스턴스 노드면 아래 태그가 붙는다.
  // 뷰어/임베드는 이 태그를 무시하고 평범한 오브젝트로 렌더한다(동기화는 에디터 전용).
  prefabId?: string;           // 어느 프리팹 정의(scene.prefabs[].id)에서 나왔나
  prefabInstanceId?: string;   // 한 번 배치한 인스턴스 묶음의 id — 같은 인스턴스의 노드들을 묶는다
  prefabNodeKey?: string;      // 원본 정의의 어느 노드(PrefabNode.nodeKey)에 대응하나
  prefabOverrides?: PrefabOverrideGroup[]; // 이 노드에서 원본을 안 따르는 필드그룹 목록
}

// 인스턴스 override 추적 단위(필드그룹). 이 그룹에 속한 필드를 인스턴스에서 편집하면
// 동기화 시 그 그룹은 원본을 안 따른다. (transform=자식 노드 트랜스폼. 루트 트랜스폼은 항상 인스턴스 소유라 미추적.)
export type PrefabOverrideGroup =
  | 'transform'
  | 'material'
  | 'events'
  | 'motion'
  | 'physics'
  | 'content'
  | 'light'
  | 'particle'
  | 'name'
  | 'visibility'
  | 'dialogue';

// 프리팹 정의의 노드 하나. id/parentId 절대참조 대신 안정적 nodeKey/parentKey로 트리를 표현.
export type PrefabNodeData = Omit<
  ObjectNodeSchema,
  'id' | 'parentId' | 'prefabId' | 'prefabInstanceId' | 'prefabNodeKey' | 'prefabOverrides'
>;

export interface PrefabNode {
  nodeKey: string;             // 프리팹 내에서 안정적인 노드 식별자
  parentKey: string | null;    // null = 프리팹 루트
  data: PrefabNodeData;        // 오브젝트 필드(절대 id/parentId·프리팹 태그 제외)
}

// 프리팹 원본 정의 — 씬 단위 라이브러리(scene_data.prefabs)에 저장(MVP).
export interface PrefabSchema {
  id: string;
  name: string;
  rootKey: string;             // nodes 중 루트 노드의 nodeKey
  nodes: PrefabNode[];
  thumbnailUrl?: string;
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
  once?: boolean;                           // 1회성 — 한 번 끝까지 본 대화는 이 세션(페이지) 동안 다시 안 뜸
  endButtonLabel?: string;                  // dialogue_end 이벤트가 있을 때 마지막 문장에 뜨는 액션 버튼 라벨(기본 '확인')
}

export interface AssetRefSchema {
  id: string;
  dracoUrl: string; // 파일 URL (오디오는 오디오 파일 URL)
  name: string;
  type?: 'model' | 'character' | 'audio';
  thumbnailUrl?: string;
}

export interface ProjectSceneSchema {
  projectId: string;
  sceneId: string;
  version: number;
  environment: EnvSchema;
  assets: AssetRefSchema[];
  objects: ObjectNodeSchema[];
  // 프리팹 원본 정의 라이브러리(씬 단위·MVP). 미설정 = 프리팹 없음(하위호환).
  prefabs?: PrefabSchema[];
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
  sky: { type: 'color', value: '#FFD2D2' },
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
      prefabs: Array.isArray(raw.prefabs) ? (raw.prefabs as PrefabSchema[]) : [],
    };
  }
  return makeEmptySceneData(projectId, sceneId);
}
