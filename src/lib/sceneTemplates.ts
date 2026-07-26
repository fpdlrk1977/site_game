// three를 안 쓴다 — 이 모듈이 서버(createProject 액션)에서도 임포트되므로 three 번들을 끌고 오면 안 된다.
// crypto.randomUUID()는 Node 19+와 브라우저(보안 컨텍스트) 양쪽에 있다.
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
    id: crypto.randomUUID(),
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

// ── 고급 템플릿용 헬퍼 ────────────────────────────────────────
// 위 obj()는 "회색 박스 나열"용이라 그림자·재질·형상 파라미터를 못 준다.
// 제대로 꾸민 씬은 아래 두 헬퍼를 쓴다 — **그림자 기본 on**이 핵심(오브젝트 render 기본값은 false라
// 그냥 두면 아무것도 그림자를 안 만들어 입체감이 사라진다).
interface MeshOpts {
  rot?: [number, number, number];
  roughness?: number;
  metalness?: number;
  emissive?: string;
  geom?: ObjectNodeSchema['geom'];
  /** 그림자 생성(기본 true). 벽/천장처럼 받기만 할 면은 false. */
  cast?: boolean;
  /** 그림자 수신(기본 true) */
  receive?: boolean;
  /** 충돌(기본 true). 장식용 작은 오브젝트는 false로 두면 걷기 모드가 답답하지 않다. */
  solid?: boolean;
  doubleSided?: boolean;
}
function mesh(
  shape: ObjectNodeSchema['primitiveShape'],
  name: string,
  pos: [number, number, number],
  scale: [number, number, number],
  color: string,
  o: MeshOpts = {},
): ObjectNodeSchema {
  const rot = o.rot ?? [0, 0, 0];
  return {
    id: crypto.randomUUID(),
    name,
    assetId: null,
    primitiveShape: shape,
    geom: o.geom,
    material: {
      color,
      roughness: o.roughness ?? 0.6,
      metalness: o.metalness ?? 0,
      ...(o.emissive ? { emissive: o.emissive } : {}),
    },
    render: {
      castShadow: o.cast ?? true,
      receiveShadow: o.receive ?? true,
      ...(o.doubleSided ? { doubleSided: true } : {}),
    },
    parentId: null,
    layer: 'default',
    position: { x: pos[0], y: pos[1], z: pos[2] },
    rotation: { x: rot[0], y: rot[1], z: rot[2] },
    scale: { x: scale[0], y: scale[1], z: scale[2] },
    visible: true,
    locked: false,
    physics: { ...DEFAULT_PHYSICS, enabled: o.solid ?? true, colliderType: 'box' },
    events: [],
  };
}

/** 포인트 라이트 — 펜던트 조명·촛불처럼 사방으로 퍼지는 광원. */
function point(
  name: string,
  pos: [number, number, number],
  opts: { color?: string; intensity?: number; distance?: number; castShadow?: boolean } = {},
): ObjectNodeSchema {
  return {
    id: crypto.randomUUID(),
    name,
    assetId: null,
    light: {
      type: 'point',
      color: opts.color ?? '#ffd9a0',
      intensity: opts.intensity ?? 12,
      distance: opts.distance ?? 8,
      decay: 2,
      castShadow: opts.castShadow ?? false,
    },
    parentId: null,
    layer: 'default',
    position: { x: pos[0], y: pos[1], z: pos[2] },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    visible: true,
    locked: false,
    physics: { ...DEFAULT_PHYSICS },
    events: [],
  };
}

/** 스포트 라이트 — 로컬 -Y가 빔 방향이라 rotation으로 조준한다(기본: 바로 아래). */
//   ⚠ 성능: castShadow는 **광원마다 그림자맵을 매 프레임 렌더**한다. 기본을 false로 두고
//     각 씬에서 키 라이트 1개에만 켠다(4개 켜면 눈에 띄게 버벅인다).
function spot(
  name: string,
  pos: [number, number, number],
  opts: { color?: string; intensity?: number; angle?: number; penumbra?: number; distance?: number; rot?: [number, number, number]; shadow?: boolean } = {},
): ObjectNodeSchema {
  const rot = opts.rot ?? [0, 0, 0];
  return {
    id: crypto.randomUUID(),
    name,
    assetId: null,
    light: {
      type: 'spot',
      color: opts.color ?? '#fff4e6',
      intensity: opts.intensity ?? 40,
      distance: opts.distance ?? 14,
      decay: 2,
      angle: opts.angle ?? 0.5,
      penumbra: opts.penumbra ?? 0.7,
      castShadow: opts.shadow ?? false,
    },
    parentId: null,
    layer: 'default',
    position: { x: pos[0], y: pos[1], z: pos[2] },
    rotation: { x: rot[0], y: rot[1], z: rot[2] },
    scale: { x: 1, y: 1, z: 1 },
    visible: true,
    locked: false,
    physics: { ...DEFAULT_PHYSICS },
    events: [],
  };
}

// ⚠ 템플릿은 `effects`(후처리)를 켜지 않는다 — 성능 때문.
//   `PostProcessingEffects`는 effects가 하나도 없고 preset이 'none'이면 **EffectComposer를 아예 안 만든다**.
//   하나라도 켜는 순간 에디터·뷰어 양쪽에 전체 화면 패스가 붙고, 에디터 캔버스는 `preserveDrawingBuffer: true`와
//   겹쳐 더 나빠진다(특히 Bloom의 mipmapBlur는 다단계 다운/업샘플). 분위기는 조명·emissive로 만들고,
//   후처리는 사용자가 Environment ▸ Post Processing에서 직접 켜도록 남겨 둔다.
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
    // 쇼룸 — "회색 박스 나열"이 아니라 **공간 연출**로 설계.
    //   ① 실내라 태양을 끄고(sunEnabled:false) 스포트라이트로 제품에 빛 웅덩이를 만든다(명암 대비 = 쇼룸의 핵심).
    //   ② 어두운 페더 월(뒷벽) + 밝은 제품 → 시선이 제품에 꽂힌다. 전면은 열어 두어 진입 시야를 확보.
    //   ③ 구도: 히어로를 중앙에서 살짝 왼쪽으로 밀고(3분할), 좌우 플린스를 비대칭 배치 + 전경 벤치로 깊이 레이어링.
    //   ④ 코브 조명(자체발광 띠)으로 천장을 훑는 간접광 느낌 → bloom과 함께 "매장" 분위기.
    //   ⑤ startView로 오프닝 컷을 지정 — 처음 열었을 때의 첫인상이 곧 템플릿의 값어치.
    id: 'showroom',
    name: '쇼룸',
    description: '스포트라이트로 연출한 제품 전시 공간',
    emoji: '🏛',
    build: (projectId, sceneId) => ({
      ...base(),
      projectId,
      sceneId,
      environment: {
        ...DEFAULT_ENVIRONMENT,
        // 전면이 열려 있어 바깥이 살짝 보인다 — 실내가 어두우므로 바깥은 밝은 회색 그라데이션.
        sky: { type: 'gradient', value: '#c8d2dc', value2: '#eef1f4' },
        // 실내 씬: 태양 끔. 밝기는 스포트 + 낮은 환경광이 만든다(균일하게 밝히면 입체감이 죽는다).
        lights: {
          ambientIntensity: 0.28,
          ambientColor: '#c9d4e4',
          directionalIntensity: 0,
          directionalPosition: { x: 5, y: 10, z: 5 },
          sunEnabled: false,
        },
        toneMappingExposure: 1.05,
        contactShadows: false,
        disableWalk: false, // 걸어 들어가 볼 수 있는 공간
        startView: { position: { x: 6.2, y: 3.1, z: 10.5 }, target: { x: -0.6, y: 1.15, z: -3.5 }, fov: 38 },
      },
      objects: [
        // ── 구조 ─────────────────────────────────────────────
        // 광택 바닥 — roughness를 낮춰 조명이 은은하게 비친다(쇼룸의 '매끈한 바닥' 느낌).
        mesh('plane', '바닥', [0, 0, -2], [16, 1, 20], '#d9d6d2', { roughness: 0.14, metalness: 0.06, cast: false }),
        mesh('box', '천장', [0, 4.2, -2], [16, 0.2, 20], '#f2f0ee', { roughness: 0.95, cast: false }),
        // 페더 월(뒷벽) — 어두운 차콜. 밝은 제품과 대비를 만드는 배경.
        mesh('box', '페더 월', [0, 2.1, -12], [16, 4.2, 0.25], '#2f3237', { roughness: 0.85, cast: false }),
        mesh('box', '좌벽', [-8, 2.1, -2], [0.25, 4.2, 20], '#efece8', { roughness: 0.92, cast: false }),
        mesh('box', '우벽', [8, 2.1, -2], [0.25, 4.2, 20], '#efece8', { roughness: 0.92, cast: false }),
        // 코브 조명 — 천장 가장자리를 훑는 자체발광 띠(간접광 느낌 + bloom).
        mesh('box', '코브 조명 L', [-7.6, 3.95, -2], [0.12, 0.1, 19], '#ffffff', { emissive: '#ffe9c9', roughness: 1, cast: false, solid: false }),
        mesh('box', '코브 조명 R', [7.6, 3.95, -2], [0.12, 0.1, 19], '#ffffff', { emissive: '#ffe9c9', roughness: 1, cast: false, solid: false }),
        // 페더 월 백라이트 — 벽에서 살짝 띄운 띠. 벽면을 씻어 제품 실루엣을 세운다.
        mesh('box', '월 워시 라인', [0, 3.5, -11.6], [12, 0.08, 0.08], '#ffffff', { emissive: '#9fd4ff', roughness: 1, cast: false, solid: false }),

        // ── 히어로 존(중앙에서 살짝 왼쪽 — 3분할 구도) ────────
        mesh('cylinder', '히어로 포디움', [-1.2, 0.18, -6.5], [3.6, 0.36, 3.6], '#f7f5f2', { roughness: 0.35 }),
        mesh('box', '히어로 제품', [-1.2, 1.06, -6.5], [1.5, 1.4, 1.5], '#23262b', {
          roughness: 0.28, metalness: 0.35, geom: { cornerRadius: 0.16, cornerSegments: 6 }, rot: [0, 22, 0],
        }),
        mesh('torus', '히어로 액센트', [-1.2, 2.05, -6.5], [1.15, 1.15, 1.15], '#d9a441', {
          roughness: 0.22, metalness: 0.9, geom: { tubeRatio: 0.14 }, rot: [78, 0, 0], solid: false,
        }),

        // ── 좌/우 플린스(비대칭 — 깊이·높이를 다르게) ─────────
        mesh('box', '플린스 L', [-5.2, 0.55, -4.2], [1.3, 1.1, 1.3], '#f7f5f2', { roughness: 0.4, geom: { cornerRadius: 0.06 } }),
        mesh('sphere', '전시품 L', [-5.2, 1.48, -4.2], [0.76, 0.76, 0.76], '#3b6ea5', { roughness: 0.15, metalness: 0.2 }),
        mesh('box', '플린스 R', [4.3, 0.42, -7.4], [1.5, 0.84, 1.5], '#f7f5f2', { roughness: 0.4, geom: { cornerRadius: 0.06 } }),
        mesh('cylinder', '전시품 R', [4.3, 1.24, -7.4], [0.62, 0.8, 0.62], '#b8483a', { roughness: 0.3 }),

        // ── 전경 레이어(깊이감) ───────────────────────────────
        mesh('box', '라운지 벤치', [2.6, 0.22, 2.2], [3.4, 0.44, 1.1], '#8d8681', { roughness: 0.7, geom: { cornerRadius: 0.1 } }),
        mesh('box', '리셉션 카운터', [-6.1, 0.55, 1.6], [2.2, 1.1, 0.9], '#3a3d42', { roughness: 0.5, geom: { cornerRadius: 0.04 } }),
        // 화분 — 원기둥 화분 + 구체 수관 두 개(현실감용 소품).
        mesh('cylinder', '화분', [6.6, 0.3, 0.4], [0.7, 0.6, 0.7], '#57534e', { roughness: 0.8 }),
        mesh('sphere', '수관 하단', [6.6, 0.95, 0.4], [1.15, 0.95, 1.15], '#4a7c52', { roughness: 0.9, solid: false }),
        mesh('sphere', '수관 상단', [6.75, 1.45, 0.25], [0.8, 0.72, 0.8], '#568a5e', { roughness: 0.9, solid: false }),

        // ── 조명(제품마다 빛 웅덩이) ──────────────────────────
        spot('스포트 · 히어로', [-1.2, 3.9, -6.0], { intensity: 55, angle: 0.42, penumbra: 0.75, distance: 12, color: '#fff1dc', shadow: true }),
        spot('스포트 · 좌', [-5.2, 3.9, -4.2], { intensity: 26, angle: 0.38, penumbra: 0.8, distance: 10 }),
        spot('스포트 · 우', [4.3, 3.9, -7.4], { intensity: 26, angle: 0.38, penumbra: 0.8, distance: 10 }),
        // 진입부 쿨 필 — 전경이 새까매지지 않게 받쳐 준다(키=따뜻 / 필=차가움 대비).
        spot('필 라이트 · 입구', [1.5, 4.0, 4.5], { intensity: 18, angle: 0.85, penumbra: 1, distance: 16, color: '#cfe0f5' }),
      ],
    }),
  },
  {
    // 갤러리 — 쇼룸이 '제품'이라면 여기는 '벽면'이 주인공.
    //   ① 화이트 큐브: 벽·천장·바닥을 밝은 무채색으로 통일해 작품 색만 남긴다(쇼룸과 정반대 전략).
    //   ② 천창(skylight) — 천장 자체발광 패널로 위에서 고르게 떨어지는 자연광. 갤러리의 전형적인 빛.
    //   ③ 픽처 라이트: 액자마다 스포트를 벽 쪽으로 기울여 캔버스를 씻어낸다(rot X로 조준).
    //   ④ 구도: 가벽 두 장을 엇갈리게 세워 동선을 S자로 만들고, 정면이 한 번에 다 보이지 않게 한다.
    id: 'gallery',
    name: '갤러리',
    description: '천창과 픽처 라이트가 있는 화이트 큐브',
    emoji: '🖼',
    build: (projectId, sceneId) => ({
      ...base(),
      projectId,
      sceneId,
      environment: {
        ...DEFAULT_ENVIRONMENT,
        sky: { type: 'gradient', value: '#e8eaec', value2: '#f6f7f8' },
        lights: {
          ambientIntensity: 0.55,
          ambientColor: '#eef2f7',
          directionalIntensity: 0,
          directionalPosition: { x: 0, y: 10, z: 0 },
          sunEnabled: false,
        },
        toneMappingExposure: 1,
        contactShadows: false,
        disableWalk: false,
        startView: { position: { x: 5.4, y: 2.6, z: 11 }, target: { x: -1, y: 1.6, z: -2 }, fov: 42 },
      },
      objects: [
        // ── 화이트 큐브 ───────────────────────────────────────
        mesh('plane', '바닥', [0, 0, 0], [20, 1, 22], '#dcdad6', { roughness: 0.55, cast: false }),
        mesh('box', '천장', [0, 4.6, 0], [20, 0.2, 22], '#f4f4f5', { roughness: 0.95, cast: false }),
        mesh('box', '뒷벽', [0, 2.3, -11], [20, 4.6, 0.2], '#f2f1ef', { roughness: 0.95, cast: false }),
        mesh('box', '좌벽', [-10, 2.3, 0], [0.2, 4.6, 22], '#f2f1ef', { roughness: 0.95, cast: false }),
        mesh('box', '우벽', [10, 2.3, 0], [0.2, 4.6, 22], '#f2f1ef', { roughness: 0.95, cast: false }),
        // 천창 — 천장에 박힌 발광 패널 2줄(위에서 고르게 떨어지는 빛의 근원처럼 보이게).
        mesh('box', '천창 A', [-3.5, 4.44, -2], [3.2, 0.06, 13], '#ffffff', { emissive: '#ffffff', roughness: 1, cast: false, solid: false }),
        mesh('box', '천창 B', [3.5, 4.44, -2], [3.2, 0.06, 13], '#ffffff', { emissive: '#ffffff', roughness: 1, cast: false, solid: false }),

        // ── 가벽(엇갈리게 세워 S자 동선) ──────────────────────
        mesh('box', '가벽 L', [-3.6, 1.8, -3.5], [0.24, 3.6, 8], '#f2f1ef', { roughness: 0.95 }),
        mesh('box', '가벽 R', [3.6, 1.8, 1.5], [0.24, 3.6, 8], '#f2f1ef', { roughness: 0.95 }),

        // ── 작품(액자 = 프레임 박스 + 캔버스 면) ──────────────
        // 뒷벽 3점 — 가운데를 크게 걸어 시선의 종착점으로.
        mesh('box', '액자 1 · 프레임', [-4.6, 1.85, -10.8], [1.5, 1.9, 0.08], '#2b2b2b', { roughness: 0.6, solid: false }),
        mesh('box', '액자 1 · 캔버스', [-4.6, 1.85, -10.72], [1.34, 1.74, 0.02], '#8fa9c4', { roughness: 0.85, solid: false }),
        mesh('box', '액자 2 · 프레임', [0, 2.0, -10.8], [2.6, 2.6, 0.08], '#2b2b2b', { roughness: 0.6, solid: false }),
        mesh('box', '액자 2 · 캔버스', [0, 2.0, -10.72], [2.42, 2.42, 0.02], '#c98b6b', { roughness: 0.85, solid: false }),
        mesh('box', '액자 3 · 프레임', [4.6, 1.85, -10.8], [1.5, 1.9, 0.08], '#2b2b2b', { roughness: 0.6, solid: false }),
        mesh('box', '액자 3 · 캔버스', [4.6, 1.85, -10.72], [1.34, 1.74, 0.02], '#7e9c7f', { roughness: 0.85, solid: false }),
        // 가벽에 건 1점(측면에서만 보이게 — 돌아 들어가는 재미)
        mesh('box', '액자 4 · 프레임', [-3.44, 1.9, -3.5], [0.08, 2.2, 3], '#2b2b2b', { roughness: 0.6, solid: false, rot: [0, 0, 0] }),
        mesh('box', '액자 4 · 캔버스', [-3.36, 1.9, -3.5], [0.02, 2.0, 2.8], '#b9a4c9', { roughness: 0.85, solid: false }),

        // ── 조각 + 관람 벤치 ──────────────────────────────────
        mesh('cylinder', '조각 좌대', [2.2, 0.45, -5.5], [1.1, 0.9, 1.1], '#eceae7', { roughness: 0.4 }),
        mesh('sphere', '조각', [2.2, 1.32, -5.5], [0.9, 0.9, 0.9], '#9aa3ab', { roughness: 0.25, metalness: 0.65 }),
        mesh('box', '관람 벤치', [0, 0.21, -5.5], [2.8, 0.42, 0.8], '#3f3b38', { roughness: 0.7, geom: { cornerRadius: 0.08 } }),

        // ── 픽처 라이트(벽을 향해 기울인 스포트) ───────────────
        // rot X 음수 = 빔이 -Z(뒷벽) 쪽으로 기운다. 액자 위에서 캔버스를 비스듬히 씻어낸다.
        spot('픽처 라이트 · 좌', [-4.6, 4.1, -9.3], { intensity: 22, angle: 0.34, penumbra: 0.6, distance: 9, rot: [-28, 0, 0] }),
        spot('픽처 라이트 · 중', [0, 4.1, -9.0], { intensity: 30, angle: 0.38, penumbra: 0.6, distance: 9, rot: [-30, 0, 0] }),
        spot('픽처 라이트 · 우', [4.6, 4.1, -9.3], { intensity: 22, angle: 0.34, penumbra: 0.6, distance: 9, rot: [-28, 0, 0] }),
        spot('스포트 · 조각', [2.2, 4.2, -5.5], { intensity: 20, angle: 0.3, penumbra: 0.8, distance: 8, color: '#ffffff', shadow: true }),
      ],
    }),
  },
  {
    // 광장 — 유일한 '야외' 템플릿. 실내 둘과 정반대로 **태양이 주인공**.
    //   ① 늦은 오후의 낮은 태양(y가 낮음) → 긴 그림자가 바닥에 깔린다. 야외의 입체감은 이 그림자가 만든다.
    //   ② 안개(exp)로 원경 건물을 하늘에 녹여 깊이(공기원근)를 만든다 — 없으면 판때기처럼 보인다.
    //   ③ 구도: 중앙 분수를 축으로 삼되 정면 대칭을 피하고, 건물 스카이라인은 높낮이를 다르게 세운다.
    //      가로수를 화면 가장자리에 둬 프레이밍(자연스러운 액자) 효과.
    id: 'plaza',
    name: '광장',
    description: '늦은 오후의 야외 광장 — 긴 그림자와 분수',
    emoji: '🌆',
    build: (projectId, sceneId) => ({
      ...base(),
      projectId,
      sceneId,
      environment: {
        ...DEFAULT_ENVIRONMENT,
        // 오후 하늘 — 천정은 맑은 파랑, 지평선은 옅은 금빛.
        sky: { type: 'gradient', value: '#6ba3d6', value2: '#f3e2c8' },
        lights: {
          ambientIntensity: 0.5,
          ambientColor: '#bcd3ef',      // 하늘빛이 그림자에 스며든 느낌(그림자를 파랗게)
          directionalIntensity: 2.1,
          directionalPosition: { x: 14, y: 6, z: 9 }, // 낮은 고도 = 긴 그림자
          directionalColor: '#ffd9a8',  // 오후의 따뜻한 햇빛
          shadowIntensity: 0.85,
        },
        toneMappingExposure: 1,
        fog: { enabled: true, color: '#dbe6f0', near: 30, far: 120, mode: 'exp', density: 0.012 },
        contactShadows: false,
        disableWalk: false,
        startView: { position: { x: 9, y: 4.2, z: 15 }, target: { x: -1, y: 1.2, z: -2 }, fov: 45 },
      },
      objects: [
        // ── 지면 ──────────────────────────────────────────────
        mesh('plane', '광장 바닥', [0, 0, 0], [60, 1, 60], '#b9b2a6', { roughness: 0.9, cast: false }),
        // 중앙 원형 포장 — 바닥 톤을 나눠 '광장의 중심'을 만든다.
        mesh('cylinder', '중앙 포장', [0, 0.02, -2], [16, 0.04, 16], '#a79f92', { roughness: 0.85, cast: false, solid: false }),

        // ── 분수(중심축) ──────────────────────────────────────
        mesh('cylinder', '분수 외벽', [0, 0.35, -2], [5, 0.7, 5], '#cfc8bb', { roughness: 0.7 }),
        mesh('cylinder', '수면', [0, 0.62, -2], [4.5, 0.06, 4.5], '#4d8fb8', { roughness: 0.08, metalness: 0.3, cast: false, solid: false }),
        mesh('cylinder', '분수 기둥', [0, 1.1, -2], [0.8, 1.6, 0.8], '#cfc8bb', { roughness: 0.7 }),
        mesh('sphere', '분수 조형', [0, 2.15, -2], [1.3, 1.3, 1.3], '#9fb7c4', { roughness: 0.2, metalness: 0.5 }),

        // ── 스카이라인(높낮이를 다르게, 비대칭) ────────────────
        mesh('box', '건물 A', [-16, 7, -22], [10, 14, 10], '#8d8b86', { roughness: 0.9, cast: true, receive: false }),
        mesh('box', '건물 B', [-4, 11, -26], [9, 22, 9], '#7c7a76', { roughness: 0.9, cast: true, receive: false }),
        mesh('box', '건물 C', [9, 8.5, -24], [11, 17, 11], '#96938d', { roughness: 0.9, cast: true, receive: false }),
        mesh('box', '건물 D', [21, 5.5, -19], [9, 11, 9], '#83817c', { roughness: 0.9, cast: true, receive: false }),
        mesh('box', '저층 상가', [-20, 2.5, -6], [7, 5, 12], '#9a9186', { roughness: 0.9 }),

        // ── 가로수(가장자리 프레이밍) ─────────────────────────
        mesh('cylinder', '가로수 1 · 줄기', [-9, 1.4, 4], [0.42, 2.8, 0.42], '#6b5844', { roughness: 0.95 }),
        mesh('sphere', '가로수 1 · 수관', [-9, 3.5, 4], [4.2, 3.4, 4.2], '#5c8250', { roughness: 0.95, solid: false }),
        mesh('cylinder', '가로수 2 · 줄기', [10, 1.6, 2], [0.46, 3.2, 0.46], '#6b5844', { roughness: 0.95 }),
        mesh('sphere', '가로수 2 · 수관', [10, 4.0, 2], [4.8, 3.8, 4.8], '#547a49', { roughness: 0.95, solid: false }),
        mesh('cylinder', '가로수 3 · 줄기', [-13, 1.3, -9], [0.4, 2.6, 0.4], '#6b5844', { roughness: 0.95 }),
        mesh('sphere', '가로수 3 · 수관', [-13, 3.3, -9], [3.8, 3.1, 3.8], '#628a55', { roughness: 0.95, solid: false }),

        // ── 스트리트 퍼니처 ───────────────────────────────────
        mesh('box', '벤치 1', [-6, 0.24, 3.5], [2.6, 0.48, 0.7], '#7a5a3c', { roughness: 0.85, geom: { cornerRadius: 0.08 } }),
        mesh('box', '벤치 2', [6.5, 0.24, 4.2], [2.6, 0.48, 0.7], '#7a5a3c', { roughness: 0.85, geom: { cornerRadius: 0.08 }, rot: [0, -18, 0] }),
        mesh('cylinder', '가로등 · 기둥', [-4.5, 2.2, 6], [0.16, 4.4, 0.16], '#3f4349', { roughness: 0.6, metalness: 0.4 }),
        mesh('sphere', '가로등 · 등', [-4.5, 4.5, 6], [0.5, 0.5, 0.5], '#ffffff', { emissive: '#ffe6b0', roughness: 1, solid: false }),
        mesh('cylinder', '가로등 2 · 기둥', [7.5, 2.2, -8], [0.16, 4.4, 0.16], '#3f4349', { roughness: 0.6, metalness: 0.4 }),
        mesh('sphere', '가로등 2 · 등', [7.5, 4.5, -8], [0.5, 0.5, 0.5], '#ffffff', { emissive: '#ffe6b0', roughness: 1, solid: false }),
        // 계단 3단 — 광장 레벨 차이(원경으로 올라가는 느낌)
        mesh('box', '계단 1', [0, 0.09, 9.5], [18, 0.18, 1.1], '#b0a89b', { roughness: 0.9 }),
        mesh('box', '계단 2', [0, 0.27, 10.6], [18, 0.18, 1.1], '#b0a89b', { roughness: 0.9 }),
        mesh('box', '계단 3', [0, 0.45, 11.7], [18, 0.18, 1.1], '#b0a89b', { roughness: 0.9 }),
      ],
    }),
  },
  {
    // 카페 — 셋 중 가장 '따뜻한' 씬. 아늑함은 **빛의 색과 높이**에서 나온다.
    //   ① 창문(자체발광 패널) + 창 바깥에서 들어오는 스포트 → 낮 시간 자연광이 비스듬히 깔린다.
    //   ② 펜던트 조명: 테이블마다 낮게 매단 갓 + 포인트 라이트. 눈높이 아래 광원이 아늑함을 만든다.
    //   ③ 구도: 카운터를 한쪽 벽으로 몰고 테이블을 대각선으로 흩어 놔 정면 대칭을 피한다.
    //      창가 2인석을 전경에 둬 깊이 레이어를 만든다.
    id: 'cafe',
    name: '카페',
    description: '창가 자연광과 펜던트 조명이 있는 카페',
    emoji: '☕',
    build: (projectId, sceneId) => ({
      ...base(),
      projectId,
      sceneId,
      environment: {
        ...DEFAULT_ENVIRONMENT,
        sky: { type: 'gradient', value: '#cfe0ee', value2: '#f6efe2' }, // 창 밖 낮 하늘
        lights: {
          ambientIntensity: 0.42,
          ambientColor: '#e8d9c4',   // 나무·벽돌에 반사된 따뜻한 실내 반사광
          directionalIntensity: 0,
          directionalPosition: { x: 3, y: 8, z: 3 },
          sunEnabled: false,
        },
        toneMappingExposure: 1.05,
        contactShadows: false,
        disableWalk: false,
        startView: { position: { x: 4.6, y: 2.3, z: 7.4 }, target: { x: -0.8, y: 1.1, z: -1.5 }, fov: 44 },
      },
      objects: [
        // ── 공간 ──────────────────────────────────────────────
        mesh('plane', '바닥', [0, 0, 0], [12, 1, 13], '#8a5a34', { roughness: 0.75, cast: false }),
        mesh('box', '천장', [0, 3.4, 0], [12, 0.2, 13], '#e8ddcd', { roughness: 0.95, cast: false }),
        mesh('box', '뒷벽(벽돌)', [0, 1.7, -6.5], [12, 3.4, 0.2], '#8c5744', { roughness: 0.95, cast: false }),
        mesh('box', '좌벽', [-6, 1.7, 0], [0.2, 3.4, 13], '#e3d6c3', { roughness: 0.95, cast: false }),
        mesh('box', '우벽(창측)', [6, 1.7, 0], [0.2, 3.4, 13], '#e3d6c3', { roughness: 0.95, cast: false }),

        // ── 창 — 발광 패널 + 창틀. 빛이 들어오는 '근원'이 보여야 자연광으로 읽힌다.
        mesh('box', '창 1', [5.88, 1.9, -2.5], [0.06, 1.9, 3], '#ffffff', { emissive: '#fff3dd', roughness: 1, cast: false, solid: false }),
        mesh('box', '창 2', [5.88, 1.9, 2], [0.06, 1.9, 3], '#ffffff', { emissive: '#fff3dd', roughness: 1, cast: false, solid: false }),
        mesh('box', '창틀 중앙', [5.84, 1.9, -0.25], [0.1, 2.1, 0.14], '#5c4632', { roughness: 0.8, solid: false }),

        // ── 바 카운터(한쪽 벽으로) ────────────────────────────
        mesh('box', '카운터', [-3.6, 0.55, -4.6], [4.6, 1.1, 1.1], '#5f3d26', { roughness: 0.5, geom: { cornerRadius: 0.05 } }),
        mesh('box', '카운터 상판', [-3.6, 1.14, -4.6], [4.9, 0.09, 1.3], '#33251b', { roughness: 0.25, metalness: 0.15 }),
        mesh('box', '백 선반', [-3.6, 2.1, -6.2], [4.4, 0.08, 0.34], '#5f3d26', { roughness: 0.7, solid: false }),
        mesh('box', '백 선반 2', [-3.6, 2.6, -6.2], [4.4, 0.08, 0.34], '#5f3d26', { roughness: 0.7, solid: false }),
        mesh('cylinder', '에스프레소 머신', [-4.8, 1.45, -4.7], [0.66, 0.52, 0.66], '#c0c4c8', { roughness: 0.2, metalness: 0.8 }),
        // 스툴 2개
        mesh('cylinder', '스툴 1', [-2.4, 0.36, -3.4], [0.44, 0.72, 0.44], '#3f3a35', { roughness: 0.7 }),
        mesh('cylinder', '스툴 2', [-1.3, 0.36, -3.4], [0.44, 0.72, 0.44], '#3f3a35', { roughness: 0.7 }),

        // ── 테이블(대각선 배치) ───────────────────────────────
        mesh('cylinder', '테이블 1 · 다리', [1.6, 0.36, -1.6], [0.16, 0.72, 0.16], '#4a3728', { roughness: 0.6 }),
        mesh('cylinder', '테이블 1 · 상판', [1.6, 0.74, -1.6], [1.5, 0.08, 1.5], '#7a5233', { roughness: 0.45 }),
        mesh('box', '의자 1a', [0.65, 0.24, -1.6], [0.5, 0.48, 0.5], '#4a4038', { roughness: 0.8, geom: { cornerRadius: 0.06 } }),
        mesh('box', '의자 1b', [2.55, 0.24, -1.6], [0.5, 0.48, 0.5], '#4a4038', { roughness: 0.8, geom: { cornerRadius: 0.06 } }),

        mesh('cylinder', '테이블 2 · 다리', [3.4, 0.36, 2.6], [0.16, 0.72, 0.16], '#4a3728', { roughness: 0.6 }),
        mesh('cylinder', '테이블 2 · 상판', [3.4, 0.74, 2.6], [1.3, 0.08, 1.3], '#7a5233', { roughness: 0.45 }),
        mesh('box', '의자 2a', [3.4, 0.24, 1.75], [0.5, 0.48, 0.5], '#4a4038', { roughness: 0.8, geom: { cornerRadius: 0.06 } }),
        mesh('box', '의자 2b', [3.4, 0.24, 3.45], [0.5, 0.48, 0.5], '#4a4038', { roughness: 0.8, geom: { cornerRadius: 0.06 } }),

        // ── 소품 ──────────────────────────────────────────────
        mesh('cylinder', '컵', [1.35, 0.83, -1.4], [0.16, 0.11, 0.16], '#f2ede4', { roughness: 0.5, solid: false }),
        mesh('cylinder', '화분', [5, 0.3, -5.2], [0.66, 0.6, 0.66], '#8c6b4f', { roughness: 0.85 }),
        mesh('sphere', '식물', [5, 0.95, -5.2], [1.1, 0.9, 1.1], '#4f7a4a', { roughness: 0.95, solid: false }),

        // ── 조명 ──────────────────────────────────────────────
        // 펜던트 = 원뿔 갓(frustum topScale 0.25) + 그 안의 포인트 라이트. 낮게 매달아야 아늑하다.
        mesh('cylinder', '펜던트 1 · 선', [1.6, 2.75, -1.6], [0.03, 1.3, 0.03], '#2e2a26', { roughness: 0.8, solid: false }),
        mesh('frustum', '펜던트 1 · 갓', [1.6, 2.0, -1.6], [0.66, 0.44, 0.66], '#2e2a26', {
          roughness: 0.6, geom: { topScale: 0.25 }, emissive: '#3a2a18', solid: false,
        }),
        point('펜던트 1 · 빛', [1.6, 1.82, -1.6], { intensity: 9, distance: 6, color: '#ffcf94' }),

        mesh('cylinder', '펜던트 2 · 선', [3.4, 2.75, 2.6], [0.03, 1.3, 0.03], '#2e2a26', { roughness: 0.8, solid: false }),
        mesh('frustum', '펜던트 2 · 갓', [3.4, 2.0, 2.6], [0.66, 0.44, 0.66], '#2e2a26', {
          roughness: 0.6, geom: { topScale: 0.25 }, emissive: '#3a2a18', solid: false,
        }),
        point('펜던트 2 · 빛', [3.4, 1.82, 2.6], { intensity: 9, distance: 6, color: '#ffcf94' }),

        // 창에서 들어오는 낮빛 — 창 바깥에 두고 실내로 비스듬히(rot Z 양수 = -X 방향으로 기움).
        spot('창 자연광', [7.5, 3.2, -0.4], { intensity: 45, angle: 0.95, penumbra: 1, distance: 20, color: '#fff2da', rot: [0, 0, 58], shadow: true }),
        // 카운터 작업등
        spot('카운터 조명', [-3.6, 3.1, -4.6], { intensity: 16, angle: 0.6, penumbra: 0.9, distance: 8, color: '#ffe3b8' }),
      ],
    }),
  },
];
