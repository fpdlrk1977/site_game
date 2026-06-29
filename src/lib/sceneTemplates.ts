import { MathUtils } from 'three';
import type { ProjectSceneSchema, ObjectNodeSchema } from '@/types/scene';
import { DEFAULT_PHYSICS, DEFAULT_ENVIRONMENT } from '@/types/scene';

export interface SceneTemplate {
  id: string;
  name: string;
  description: string;
  emoji: string;
  build: (projectId: string, sceneId: string) => ProjectSceneSchema;
}

function obj(
  shape: ObjectNodeSchema['primitiveShape'],
  name: string,
  pos: [number, number, number],
  scale: [number, number, number],
  color: string,
  rot: [number, number, number] = [0, 0, 0],
): ObjectNodeSchema {
  return {
    id: MathUtils.generateUUID(),
    name,
    assetId: null,
    primitiveShape: shape,
    material: { color, roughness: 0.6, metalness: 0.1 },
    parentId: null,
    layer: 'default',
    position: { x: pos[0], y: pos[1], z: pos[2] },
    rotation: { x: rot[0], y: rot[1], z: rot[2] },
    scale: { x: scale[0], y: scale[1], z: scale[2] },
    visible: true,
    locked: false,
    physics: { ...DEFAULT_PHYSICS, enabled: true, colliderType: 'box' },
    events: [],
  };
}

const base = (): Omit<ProjectSceneSchema, 'projectId' | 'sceneId' | 'objects'> => ({
  version: 1,
  assets: [],
  environment: { ...DEFAULT_ENVIRONMENT },
});

export const SCENE_TEMPLATES: SceneTemplate[] = [
  {
    id: 'empty',
    name: '빈 씬',
    description: '바닥만 있는 빈 공간',
    emoji: '□',
    build: (projectId, sceneId) => ({
      ...base(), projectId, sceneId, objects: [],
    }),
  },
  {
    id: 'showroom',
    name: '쇼룸',
    description: '제품 전시용 화이트 룸',
    emoji: '🏛',
    build: (projectId, sceneId) => ({
      ...base(),
      projectId,
      sceneId,
      environment: {
        ...DEFAULT_ENVIRONMENT,
        sky: { type: 'color', value: '#f8f8f8' },
        lights: { ambientIntensity: 1.2, directionalIntensity: 1.5, directionalPosition: { x: 5, y: 10, z: 5 } },
      },
      objects: [
        obj('plane', '바닥', [0, 0, 0], [20, 1, 20], '#e5e7eb'),
        obj('box', '뒷벽', [0, 3, -8], [20, 6, 0.2], '#f3f4f6'),
        obj('box', '좌벽', [-8, 3, 0], [0.2, 6, 20], '#f3f4f6'),
        obj('box', '우벽', [8, 3, 0], [0.2, 6, 20], '#f3f4f6'),
        obj('box', '전시대 1', [-3, 0.5, -3], [1.5, 1, 1.5], '#d1d5db'),
        obj('box', '전시대 2', [0, 0.5, -3], [1.5, 1, 1.5], '#d1d5db'),
        obj('box', '전시대 3', [3, 0.5, -3], [1.5, 1, 1.5], '#d1d5db'),
      ],
    }),
  },
  {
    id: 'gallery',
    name: '갤러리',
    description: '그림/사진을 걸 수 있는 전시 공간',
    emoji: '🖼',
    build: (projectId, sceneId) => ({
      ...base(),
      projectId,
      sceneId,
      environment: {
        ...DEFAULT_ENVIRONMENT,
        sky: { type: 'color', value: '#1c1c1c' },
        lights: { ambientIntensity: 0.6, directionalIntensity: 2.0, directionalPosition: { x: 0, y: 10, z: 0 } },
      },
      objects: [
        obj('plane', '바닥', [0, 0, 0], [24, 1, 16], '#292929'),
        obj('box', '천장', [0, 6, 0], [24, 0.2, 16], '#1a1a1a'),
        obj('box', '앞벽', [0, 3, 7], [24, 6, 0.2], '#2a2a2a'),
        obj('box', '뒷벽', [0, 3, -7], [24, 6, 0.2], '#2a2a2a'),
        obj('box', '좌벽', [-11, 3, 0], [0.2, 6, 16], '#2a2a2a'),
        obj('box', '우벽', [11, 3, 0], [0.2, 6, 16], '#2a2a2a'),
        obj('box', '파티션 1', [-4, 3, 0], [0.2, 6, 12], '#222222'),
        obj('box', '파티션 2', [4, 3, 0], [0.2, 6, 12], '#222222'),
      ],
    }),
  },
  {
    id: 'plaza',
    name: '광장',
    description: '야외 광장 느낌의 오픈 스페이스',
    emoji: '🌆',
    build: (projectId, sceneId) => ({
      ...base(),
      projectId,
      sceneId,
      environment: {
        ...DEFAULT_ENVIRONMENT,
        sky: { type: 'color', value: '#87ceeb' },
        lights: { ambientIntensity: 1.0, directionalIntensity: 2.0, directionalPosition: { x: 10, y: 20, z: 10 } },
      },
      objects: [
        obj('plane', '광장 바닥', [0, 0, 0], [30, 1, 30], '#94a3b8'),
        obj('box', '건물 1', [-10, 4, -10], [5, 8, 5], '#64748b'),
        obj('box', '건물 2', [10, 6, -10], [5, 12, 5], '#475569'),
        obj('box', '건물 3', [-10, 3, 10], [5, 6, 5], '#64748b'),
        obj('cylinder', '분수대', [0, 0.5, 0], [2, 1, 2], '#cbd5e1'),
        obj('box', '벤치 1', [-4, 0.25, 2], [2, 0.5, 0.6], '#92400e'),
        obj('box', '벤치 2', [4, 0.25, 2], [2, 0.5, 0.6], '#92400e'),
        obj('cylinder', '가로등 1', [-6, 2, 0], [0.1, 4, 0.1], '#334155'),
        obj('cylinder', '가로등 2', [6, 2, 0], [0.1, 4, 0.1], '#334155'),
      ],
    }),
  },
  {
    id: 'cafe',
    name: '카페',
    description: '아늑한 카페 인테리어',
    emoji: '☕',
    build: (projectId, sceneId) => ({
      ...base(),
      projectId,
      sceneId,
      environment: {
        ...DEFAULT_ENVIRONMENT,
        sky: { type: 'color', value: '#2d1b0e' },
        lights: { ambientIntensity: 0.5, directionalIntensity: 1.0, directionalPosition: { x: 3, y: 8, z: 3 } },
      },
      objects: [
        obj('plane', '바닥', [0, 0, 0], [12, 1, 10], '#78350f'),
        obj('box', '천장', [0, 4, 0], [12, 0.2, 10], '#1c0f00'),
        obj('box', '앞벽', [0, 2, 4.5], [12, 4, 0.2], '#451a03'),
        obj('box', '뒷벽', [0, 2, -4.5], [12, 4, 0.2], '#451a03'),
        obj('box', '좌벽', [-5.5, 2, 0], [0.2, 4, 10], '#451a03'),
        obj('box', '우벽', [5.5, 2, 0], [0.2, 4, 10], '#451a03'),
        obj('box', '테이블 1', [-3, 0.4, -1], [1.2, 0.08, 0.8], '#92400e'),
        obj('box', '테이블 2', [0, 0.4, -1], [1.2, 0.08, 0.8], '#92400e'),
        obj('box', '테이블 3', [3, 0.4, -1], [1.2, 0.08, 0.8], '#92400e'),
        obj('box', '카운터', [0, 0.6, 3], [4, 1.2, 1], '#7c2d12'),
        obj('box', '선반', [0, 2.5, 3.8], [3.5, 0.1, 0.3], '#7c2d12'),
      ],
    }),
  },
];
