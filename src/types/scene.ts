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
  boundary?: number;
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
  notes?: string;
  postProcessing?: { preset: PostProcessPreset };
}

export interface EventSchema {
  id: string;
  trigger: 'click' | 'hover_enter' | 'area_enter';
  action: 'open_url' | 'show_popup' | 'emit_event' | 'play_animation' | 'go_to_scene';
  // go_to_scene: 이동할 대상 sceneId. 그 외 액션은 기존 의미(URL/텍스트/이벤트명/클립명).
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
