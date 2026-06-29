# DATA_SCHEMA: JSON 데이터 구조 및 데이터베이스 명세

## 1. TypeScript Interfaces (프론트엔드/JSON 규격)
AI가 코드를 생성할 때 타입 안정성을 지키도록 하기 위한 최상위 명세서이다.

```typescript
export interface Vector3 { x: number; y: number; z: number; }

export interface EnvSchema {
  sky: { type: 'color' | 'hdr'; value: string; };
  fog: { enabled: boolean; color: string; near: number; far: number; };
  lights: { ambientIntensity: number; directionalPosition: Vector3; directionalIntensity: number; };
}

export interface EventSchema {
  id: string;
  trigger: 'click' | 'hover_enter' | 'area_enter';
  // play_animation은 Phase 4 deferred: 저장은 가능하나 Phase 3 뷰어에서는 무시됨
  action: 'open_url' | 'show_popup' | 'emit_event' | 'play_animation';
  value: string;
  // open_url      : value = 이동할 URL
  // show_popup    : value = 표시할 마크다운 문자열
  // emit_event    : value = 이벤트 이름 (park3d:{value} 로 발행)
  // play_animation: value = .glb 내장 AnimationClip 이름 (Phase 4)
  eventPayload?: Record<string, unknown>; // emit_event 시 함께 전달할 추가 데이터
}

export type ColliderType = 'box' | 'sphere' | 'capsule' | 'hull' | 'trimesh';

export interface PhysicsSchema {
  enabled: boolean;
  colliderType: ColliderType;
  isSensor: boolean;   // true: area_enter 감지용 — 플레이어를 막지 않음
  mass: number;        // 0 = 완전 고정(static), 1 이상 = 동적 오브젝트
  friction: number;    // 0.0 ~ 1.0
  restitution: number; // 탄성 0.0 ~ 1.0
}

export type PrimitiveShape = 'box' | 'sphere' | 'cylinder' | 'plane';

export type ContentType = 'text3d' | 'image' | 'video';

export interface ContentConfig {
  type: ContentType;
  url?: string;          // image / video URL
  text?: string;         // text3d 내용
  fontSize?: number;
  color?: string;
}

export interface MaterialOverride {
  color?: string;
  roughness?: number;
  metalness?: number;
  emissive?: string;
}

export interface ParticleConfig {
  count: number;
  size: number;
  color: string;
  speed: number;
  lifetime: number;
  preset?: 'fire' | 'dust' | 'sparkle' | 'snow';
}

export interface ObjectNodeSchema {
  id: string;
  name: string;
  assetId: string | null;           // null이면 primitiveShape 또는 contentType 사용
  primitiveShape?: PrimitiveShape;  // Phase 1: 기본 도형 (.glb 없이 생성)
  contentConfig?: ContentConfig;    // Phase 3: 텍스트/이미지/동영상
  particleConfig?: ParticleConfig;  // Phase 4: 파티클
  prefabId?: string;                // Phase 4: 프리팹 원본 ID
  material?: MaterialOverride;      // Phase 4: 재질 오버라이드
  parentId: string | null;
  layer: string;
  position: Vector3;
  rotation: Vector3; // Euler Degree
  scale: Vector3;
  visible: boolean;
  locked: boolean;
  physics: PhysicsSchema;
  events: EventSchema[];
}

// physics 필드 기본값 (에디터 오브젝트 생성 시 적용)
export const DEFAULT_PHYSICS: PhysicsSchema = {
  enabled: false,
  colliderType: 'hull',
  isSensor: false,
  mass: 0,
  friction: 0.5,
  restitution: 0.0,
};

export interface AssetRefSchema {
  // scene_data 내에 에셋 URL을 직접 포함 — 뷰어가 별도 assets 테이블 조회 없이 로드 가능
  id: string;       // assets 테이블 UUID
  dracoUrl: string; // Draco 압축 파일의 공개 URL (직접 useGLTF에 전달)
  name: string;
}

export interface ProjectSceneSchema {
  projectId: string;
  sceneId: string;
  version: number;
  environment: EnvSchema;
  assets: AssetRefSchema[];   // 씬에서 사용 중인 에셋 목록 (dracoUrl 포함)
  objects: ObjectNodeSchema[];
}

// 새 씬 생성 시 사용하는 기본값
export const DEFAULT_ENVIRONMENT: EnvSchema = {
  sky: { type: 'color', value: '#87CEEB' },
  fog: { enabled: false, color: '#ffffff', near: 10, far: 100 },
  lights: { ambientIntensity: 0.5, directionalPosition: { x: 5, y: 10, z: 5 }, directionalIntensity: 1.0 },
};

export const createEmptyScene = (projectId: string, sceneId: string): ProjectSceneSchema => ({
  projectId,
  sceneId,
  version: 1,
  environment: DEFAULT_ENVIRONMENT,
  assets: [],
  objects: [],
});


