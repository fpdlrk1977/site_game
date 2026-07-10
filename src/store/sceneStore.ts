import { create } from 'zustand';
import { MathUtils, Quaternion, Euler, Vector3, Matrix4 } from 'three';
import { worldBBox } from '@/lib/objectBBox';
import { glbLocalBboxCache } from '@/lib/glbBboxCache';

// 추가 직후 아직 bbox(GLB 로드)가 없어 바닥 스냅을 못한 오브젝트 id들 — 로드되면 GlbObject가 재시도
const pendingFloorSnap = new Set<string>();
import {
  ObjectNodeSchema,
  AssetRefSchema,
  EnvSchema,
  ProjectSceneSchema,
  PrefabSchema,
  PrefabOverrideGroup,
  DEFAULT_ENVIRONMENT,
  DEFAULT_PHYSICS,
  PrimitiveShape,
  ContentType,
  ParticlePreset,
  LightType,
  Vector3 as Vec3Schema,
} from '@/types/scene';
import {
  buildPrefab,
  instantiate as instantiatePrefabNodes,
  syncInstances,
  rebuildPrefabFromInstance,
  overrideGroupsFromPatch,
} from '@/lib/prefab';
import { regenerateCloner, clonerPlacement, DEFAULT_CLONER } from '@/lib/cloner';
import type { ClonerConfig } from '@/types/scene';

interface HistoryEntry {
  objects: ObjectNodeSchema[];
  environment: EnvSchema;
  // 프리팹 정의도 함께 스냅샷(프리팹 관련 액션만 채움). 미설정 = 이 액션은 prefabs를 안 바꿈 → undo 시 현재값 유지.
  prefabs?: PrefabSchema[];
}

interface SceneState {
  projectId: string | null;
  sceneId: string | null;
  objects: ObjectNodeSchema[];
  assets: AssetRefSchema[];
  environment: EnvSchema;
  // 프리팹 원본 정의 라이브러리(씬 단위). 인스턴스는 objects에 구워진 채로 존재한다.
  prefabs: PrefabSchema[];
  selectedId: string | null;
  selectedIds: string[];
  // 그룹 격리(isolation) 스코프 — 더블클릭으로 '진입'한 그룹 id. 설정 시 단일 클릭이 이 그룹 안에서만
  // 형제 오브젝트를 선택한다(최상위 그룹으로 튕기지 않음). 빈 곳 클릭/Esc/스코프 밖 클릭으로 해제.
  groupScope: string | null;
  transformMode: 'translate' | 'rotate' | 'scale';
  transformSpace: 'world' | 'local';
  snapEnabled: boolean;
  snapTranslate: number;
  snapRotate: number;
  focusTarget: { x: number; y: number; z: number; _tick: number } | null;
  focusAllRequest: number | null;
  // 선택 오브젝트(들)로 카메라 프레이밍 요청(F키/더블클릭). tick 값으로 EditorCanvas가 감지.
  focusSelectedRequest: number | null;
  // .glb 내보내기 요청 — ids가 비면 씬 전체(루트 오브젝트 전부). EditorCanvas가 라이브 Three 객체로 처리.
  exportRequest: { ids: string[]; name: string; _tick: number } | null;
  // 펜 툴(2D 프로파일 → 돌출/회전체) 모달 열림 상태.
  penToolOpen: boolean;
  cameraViewRequest: { view: 'top' | 'front' | 'right'; _tick: number } | null;
  isModified: boolean;
  // 마지막으로 로드/저장한 시점의 DB scenes.version 값 — 저장 시 낙관적 잠금에 사용.
  // (scene_data 내부의 SCENE_VERSION[JSON 스키마 버전]과는 별개의 행 리비전 카운터)
  savedVersion: number;
  wireframeMode: boolean;
  past: HistoryEntry[];
  future: HistoryEntry[];
  cameraBookmarks: Record<number, { position: [number, number, number]; target: [number, number, number] }>;
  bookmarkSaveRequest: { slot: number; _tick: number } | null;
  bookmarkRecallRequest: { slot: number; _tick: number } | null;
  copiedProperties: { material?: ObjectNodeSchema['material']; physics?: ObjectNodeSchema['physics'] } | null;
  _prevSnapshot: HistoryEntry | null;
}

interface SceneActions {
  loadScene: (data: ProjectSceneSchema, savedVersion?: number) => void;
  selectObject: (id: string | null) => void;
  /** 그룹 격리 스코프 진입/해제(null=해제) */
  setGroupScope: (id: string | null) => void;
  toggleSelectObject: (id: string) => void;
  selectObjects: (ids: string[]) => void;
  deleteSelected: () => void;
  alignSelected: (axis: 'x' | 'y' | 'z', mode: 'min' | 'center' | 'max') => void;
  setTransformMode: (mode: 'translate' | 'rotate' | 'scale') => void;
  setTransformSpace: (space: 'world' | 'local') => void;
  addObject: (shape: PrimitiveShape) => void;
  /** 펜 툴 프로파일로 돌출/회전체 오브젝트 생성 */
  addProfileObject: (shape: 'extrude' | 'lathe', profile: { x: number; y: number }[], extrudeDepth: number, closed: boolean) => void;
  addAsset: (asset: AssetRefSchema) => void;
  addAssetObject: (asset: AssetRefSchema) => void;
  addContentObject: (type: ContentType) => void;
  addParticleObject: (preset: ParticlePreset) => void;
  setSnap: (enabled: boolean, translate?: number, rotate?: number) => void;
  requestFocus: () => void;
  requestFocusAll: () => void;
  /** 선택 오브젝트로 카메라 프레이밍(orbit pivot 이동 + 거리 맞춤). 시점 방향은 유지. */
  requestFocusSelected: () => void;
  /** 오브젝트(들)를 .glb로 내보내기. ids 비우면 씬 전체. */
  requestExport: (ids: string[], name: string) => void;
  /** 펜 툴 모달 열기/닫기 */
  setPenToolOpen: (open: boolean) => void;
  requestCameraView: (view: 'top' | 'front' | 'right') => void;
  duplicateInPlace: () => void;
  requestSaveBookmark: (slot: number) => void;
  requestRecallBookmark: (slot: number) => void;
  setCameraBookmark: (slot: number, position: [number, number, number], target: [number, number, number]) => void;
  updateObject: (id: string, patch: Partial<ObjectNodeSchema>) => void;
  /** 여러 오브젝트의 트랜스폼을 한 번에 원자적으로 커밋(기즈모 전용). _prevSnapshot에 의존하지 않아 undo 기준 오염이 없다. */
  commitTransforms: (updates: { id: string; position: Vec3Schema; rotation: Vec3Schema; scale: Vec3Schema }[]) => void;
  setObjectLocked: (id: string, locked: boolean) => void;
  moveObject: (draggedId: string, targetId: string, position: 'before' | 'after' | 'inside') => void;
  duplicateSelected: () => void;
  // 선택 오브젝트를 count개(원본 포함)로 배열 복제. linear=offset 간격 나열(울타리·기둥), radial=중심 기준 원형 배치(시계 숫자·원형 테이블 의자).
  arraySelected: (count: number, offset: { x: number; y: number; z: number }, radial?: { radius: number; axis: 'x' | 'y' | 'z' } | null) => void;
  groupSelected: () => void;
  ungroupSelected: () => void;
  /** 선택 오브젝트를 '클로너 그룹'으로 감싼다(비파괴 배열). config 미지정 시 기본값. */
  makeCloner: (config?: ClonerConfig) => void;
  /** 클로너 설정 변경 → 복제본 실시간 재생성. _prevSnapshot 패턴(호출부 pushHistory로 커밋). */
  updateCloner: (groupId: string, config: ClonerConfig) => void;
  /** 구운(bake) GLB 에셋으로 대상 오브젝트(+자손)를 대체 — Merge/Boolean 결과 반영. 원본 제거 + 에셋 오브젝트 1개 추가(단일 undo) */
  mergeIntoAsset: (rootIds: string[], asset: AssetRefSchema, position: Vec3Schema, name: string) => void;
  // ── 프리팹 ──
  /** 선택한 루트 오브젝트/그룹으로 프리팹 정의를 만들고, 그 선택물을 인스턴스 #1로 태깅 */
  createPrefab: (name?: string) => void;
  /** 프리팹 정의를 새 인스턴스로 씬에 배치(bake) */
  instantiatePrefab: (prefabId: string, position?: Vec3Schema) => void;
  /** 선택 인스턴스의 현재 상태를 원본 정의에 반영하고 다른 인스턴스를 재동기화(각자 override 보존) */
  applyInstanceToPrefab: (instanceRootId: string) => void;
  /** 선택 인스턴스의 override를 버리고 원본 값으로 되돌림(그룹 지정 시 그 그룹만) */
  revertInstance: (instanceRootId: string, group?: PrefabOverrideGroup) => void;
  /** 프리팹 정의 삭제 — 인스턴스는 태그를 벗고 독립 오브젝트가 됨(씬에는 유지) */
  deletePrefab: (prefabId: string) => void;
  /** 프리팹 이름 변경 */
  renamePrefab: (prefabId: string, name: string) => void;
  updateEnvironment: (patch: Partial<EnvSchema>) => void;
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;
  markSaved: (savedVersion?: number) => void;
  markModified: () => void;
  toggleWireframe: () => void;
  copyObjectProperties: () => void;
  pasteObjectProperties: () => void;
  batchUpdateObjects: (ids: string[], patch: (obj: ObjectNodeSchema) => Partial<ObjectNodeSchema>) => void;
  addLightObject: (type: LightType) => void;
  removeAsset: (id: string) => void;
  /** 특정 에셋을 참조하는 오브젝트(+자손) 전부 삭제. 삭제된 개수 반환(연쇄 삭제용) */
  removeObjectsByAsset: (assetId: string) => number;
  /** 오브젝트 밑면을 바닥(y=0)에 자동 정렬. bbox 미준비면 pending으로 남겨 나중에 재시도 */
  floorSnapObject: (id: string) => void;
}

// 에디터 뷰포트의 플레이어 캐릭터 프리뷰가 쓰는 가상 오브젝트 ID.
// objects 배열에는 존재하지 않으므로 다중 선택 등에 섞이면 안 된다.
// (CharacterPreview.tsx에서 re-export — 스토어가 원본을 소유해 순환 import 방지)
export const CHARACTER_PREVIEW_ID = '__character_preview__';

const SHAPE_NAMES: Record<PrimitiveShape, string> = {
  box: '박스',
  sphere: '구체',
  cylinder: '원기둥',
  plane: '평면',
  frustum: '각뿔대',
  loft: '로프트',
  extrude: '돌출',
  lathe: '회전체',
};

// 히스토리 스택 최대 길이 (past/future 공통)
const HISTORY_LIMIT = 49;

// 이전 스냅샷을 past에 push (한계 초과 시 오래된 항목 삭제)
function pushPast(past: HistoryEntry[], snapshot: HistoryEntry): HistoryEntry[] {
  return [...past.slice(-HISTORY_LIMIT), snapshot];
}

// 변경 직전 스냅샷을 past에 쌓고 future를 비우는 히스토리 필드 묶음.
// 즉시 히스토리를 커밋하는 액션(addObject/delete/group 등)에서 set()에 스프레드해 쓴다.
function withHistory(snapshot: HistoryEntry, past: HistoryEntry[]): { past: HistoryEntry[]; future: HistoryEntry[] } {
  return { past: pushPast(past, snapshot), future: [] };
}

let objectCounter = 0;

// 모든 오브젝트가 공유하는 기본값 팩토리. overrides로 타입별 필드(assetId/content/particle/light 등)를 덮어쓴다.
// objectCounter는 건드리지 않으므로 name은 이미 번호가 매겨진 값을 전달할 것.
function makeBaseObject(overrides: Partial<ObjectNodeSchema> & { name: string }): ObjectNodeSchema {
  return {
    id: MathUtils.generateUUID(),
    assetId: null,
    primitiveShape: undefined,
    material: {},
    parentId: null,
    layer: 'default',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    visible: true,
    locked: false,
    physics: { ...DEFAULT_PHYSICS },
    events: [],
    ...overrides,
  };
}

// 셰이프별 기본 지오메트리 파라미터(둥근 박스·각뿔대 등). 미지정 = 기존 각진 형태.
const SHAPE_DEFAULT_GEOM: Partial<Record<PrimitiveShape, ObjectNodeSchema['geom']>> = {
  frustum: { topScale: 0.5 },
  loft: { sections: [1, 0.7, 0.4] },
};

function makeObject(shape: PrimitiveShape): ObjectNodeSchema {
  objectCounter += 1;
  const geom = SHAPE_DEFAULT_GEOM[shape];
  return makeBaseObject({
    name: `${SHAPE_NAMES[shape]} ${objectCounter}`,
    primitiveShape: shape,
    ...(geom ? { geom: { ...geom } } : {}),
    material: { color: '#00a4eb', roughness: 0.5, metalness: 0.1 },
    position: { x: 0, y: 0.5, z: 0 },
  });
}

const DEG2RAD_M = Math.PI / 180;
const RAD2DEG_M = 180 / Math.PI;

// 오브젝트의 월드 변환 행렬 — 부모 체인의 로컬 변환을 루트→자신 순서로 누적
function computeWorldMatrix(objects: ObjectNodeSchema[], id: string): Matrix4 {
  const chain: ObjectNodeSchema[] = [];
  let cur: ObjectNodeSchema | undefined = objects.find((o) => o.id === id);
  while (cur) {
    chain.unshift(cur);
    const parentId: string | null = cur.parentId;
    cur = parentId ? objects.find((o) => o.id === parentId) : undefined;
  }
  const m = new Matrix4();
  const p = new Vector3(), q = new Quaternion(), s = new Vector3(), e = new Euler();
  for (const o of chain) {
    p.set(o.position.x, o.position.y, o.position.z);
    e.set(o.rotation.x * DEG2RAD_M, o.rotation.y * DEG2RAD_M, o.rotation.z * DEG2RAD_M);
    q.setFromEuler(e);
    s.set(o.scale.x, o.scale.y, o.scale.z);
    m.multiply(new Matrix4().compose(p, q, s));
  }
  return m;
}

// candidateId가 rootId의 자손인지 (그룹을 자기 자손 안에 넣는 순환 방지)
export function isDescendant(objects: ObjectNodeSchema[], candidateId: string, rootId: string): boolean {
  let cur: ObjectNodeSchema | undefined = objects.find((o) => o.id === candidateId);
  while (cur?.parentId) {
    if (cur.parentId === rootId) return true;
    const parentId: string = cur.parentId;
    cur = objects.find((o) => o.id === parentId);
  }
  return false;
}

// 그룹 원점(피벗)을 직속 자식들의 중심(centroid=위치 평균)으로 재배치한다.
// 자식 월드 위치는 그대로 유지하고 로컬 좌표만 보정 → 기즈모/회전·크기 피벗이 항상 자식 중심에 온다.
// 그룹 회전·크기는 유지하고 위치만 이동하므로 자식은 위치만 바뀐다(회전·크기 불변).
// (groupSelected·MultiGizmo와 동일하게 '위치 평균'을 중심으로 사용)
function recenterGroup(objects: ObjectNodeSchema[], groupId: string): ObjectNodeSchema[] {
  const group = objects.find((o) => o.id === groupId);
  if (!group?.isGroup) return objects;
  const children = objects.filter((o) => o.parentId === groupId);
  if (children.length === 0) return objects;

  // 각 자식의 월드 위치 + centroid(월드)
  const childWorldPos = new Map<string, Vector3>();
  const centroid = new Vector3();
  for (const c of children) {
    const wp = new Vector3().setFromMatrixPosition(computeWorldMatrix(objects, c.id));
    childWorldPos.set(c.id, wp);
    centroid.add(wp);
  }
  centroid.divideScalar(children.length);

  // 그룹의 현재 회전·크기는 유지하고 원점만 centroid로 이동한 새 월드행렬의 역행렬
  const gWorld = computeWorldMatrix(objects, groupId);
  const gPos = new Vector3(), gQuat = new Quaternion(), gScale = new Vector3();
  gWorld.decompose(gPos, gQuat, gScale);
  const gWorldNewInv = new Matrix4().compose(centroid, gQuat, gScale).invert();

  // 그룹의 새 로컬 위치(부모 기준) — centroid를 부모 공간으로 변환
  const parentInv = group.parentId ? computeWorldMatrix(objects, group.parentId).invert() : new Matrix4();
  const gLocalPos = centroid.clone().applyMatrix4(parentInv);

  const patches = new Map<string, ObjectNodeSchema>();
  patches.set(groupId, { ...group, position: { x: gLocalPos.x, y: gLocalPos.y, z: gLocalPos.z } });
  for (const c of children) {
    const lp = childWorldPos.get(c.id)!.clone().applyMatrix4(gWorldNewInv);
    patches.set(c.id, { ...c, position: { x: lp.x, y: lp.y, z: lp.z } });
  }
  return objects.map((o) => patches.get(o.id) ?? o);
}

export const useSceneStore = create<SceneState & SceneActions>((set, get) => ({
  projectId: null,
  sceneId: null,
  objects: [],
  assets: [],
  environment: DEFAULT_ENVIRONMENT,
  prefabs: [],
  selectedId: null,
  groupScope: null,
  transformMode: 'translate',
  transformSpace: 'world',
  snapEnabled: false,
  snapTranslate: 0.5,
  snapRotate: 15,
  selectedIds: [],
  focusTarget: null,
  focusAllRequest: null,
  focusSelectedRequest: null,
  exportRequest: null,
  penToolOpen: false,
  cameraViewRequest: null,
  isModified: false,
  savedVersion: 1,
  wireframeMode: false,
  past: [],
  future: [],
  cameraBookmarks: {},
  bookmarkSaveRequest: null,
  bookmarkRecallRequest: null,
  copiedProperties: null,
  _prevSnapshot: null,

  loadScene: (data, savedVersion = 1) => {
    objectCounter = 0;
    set({
      projectId: data.projectId,
      sceneId: data.sceneId,
      objects: data.objects,
      assets: data.assets ?? [],
      environment: data.environment,
      prefabs: data.prefabs ?? [],
      selectedId: null,
      selectedIds: [],
      groupScope: null,
      isModified: false,
      savedVersion,
      past: [],
      future: [],
      _prevSnapshot: null,
    });
  },

  selectObject: (id) => set({ selectedId: id, selectedIds: id ? [id] : [] }),
  setGroupScope: (id) => set({ groupScope: id }),
  selectObjects: (ids) => set({ selectedIds: ids, selectedId: ids[ids.length - 1] ?? null }),

  toggleSelectObject: (id) => set((s) => {
    // 캐릭터 프리뷰(가상 오브젝트)는 실제 오브젝트 다중 선택에 섞이지 않도록 제외
    const base = s.selectedIds.filter((x) => x !== CHARACTER_PREVIEW_ID);
    const already = base.includes(id);
    const selectedIds = already
      ? base.filter((x) => x !== id)
      : [...base, id];
    return { selectedIds, selectedId: selectedIds[selectedIds.length - 1] ?? null };
  }),

  setTransformMode: (mode) => set({ transformMode: mode }),
  setTransformSpace: (space) => set({ transformSpace: space }),

  addObject: (shape) => {
    const obj = makeObject(shape);
    const { objects, environment, past } = get();
    set({
      objects: [...objects, obj],
      selectedId: obj.id,
      selectedIds: [obj.id],
      isModified: true,
      ...withHistory({ objects, environment }, past),
    });
  },

  addProfileObject: (shape, profile, extrudeDepth, closed) => {
    objectCounter += 1;
    const obj = makeBaseObject({
      name: `${shape === 'lathe' ? '회전체' : '돌출'} ${objectCounter}`,
      primitiveShape: shape,
      geom: shape === 'extrude' ? { profile, extrudeDepth } : { profile, profileClosed: closed },
      material: { color: '#a78bfa', roughness: 0.5, metalness: 0.1 },
      position: { x: 0, y: 0.5, z: 0 },
    });
    const { objects, environment, past } = get();
    set({
      objects: [...objects, obj],
      selectedId: obj.id,
      selectedIds: [obj.id],
      isModified: true,
      ...withHistory({ objects, environment }, past),
    });
  },

  setSnap: (enabled, translate, rotate) =>
    set((s) => ({
      snapEnabled: enabled,
      snapTranslate: translate ?? s.snapTranslate,
      snapRotate: rotate ?? s.snapRotate,
    })),

  requestFocus: () => {
    const { selectedId, objects } = get();
    if (!selectedId) return;
    // 중첩 구조에서 월드 위치 근사 계산 (부모 체인 translation 합산)
    const approxWorldPos = (id: string): { x: number; y: number; z: number } => {
      const o = objects.find((x) => x.id === id);
      if (!o) return { x: 0, y: 0, z: 0 };
      if (!o.parentId) return o.position;
      const p = approxWorldPos(o.parentId);
      return { x: o.position.x + p.x, y: o.position.y + p.y, z: o.position.z + p.z };
    };
    const wp = approxWorldPos(selectedId);
    set({ focusTarget: { ...wp, _tick: Date.now() } });
  },

  requestFocusAll: () => set({ focusAllRequest: Date.now() }),
  requestFocusSelected: () => set({ focusSelectedRequest: Date.now() }),
  requestExport: (ids, name) => set({ exportRequest: { ids, name, _tick: Date.now() } }),
  setPenToolOpen: (open) => set({ penToolOpen: open }),

  requestCameraView: (view) => set({ cameraViewRequest: { view, _tick: Date.now() } }),

  duplicateInPlace: () => {
    const { selectedId, objects, environment, past } = get();
    if (!selectedId) return;
    const src = objects.find((o) => o.id === selectedId);
    if (!src) return;
    objectCounter += 1;
    if (src.isGroup) {
      // 중첩 그룹 포함 전체 하위 계층 재귀 복제
      const idMap = new Map<string, string>();
      const newDescendants: ObjectNodeSchema[] = [];
      const collectAll = (parentId: string): void => {
        const children = objects.filter((o) => o.parentId === parentId);
        for (const child of children) {
          const newId = MathUtils.generateUUID();
          idMap.set(child.id, newId);
          newDescendants.push({ ...child, id: newId });
          if (child.isGroup) collectAll(child.id);
        }
      };
      const newGroupId = MathUtils.generateUUID();
      idMap.set(src.id, newGroupId);
      collectAll(src.id);
      const newGroup: ObjectNodeSchema = { ...src, id: newGroupId, name: `${src.name} 복사` };
      const fixedDescendants = newDescendants.map((o) => ({
        ...o,
        parentId: idMap.get(o.parentId!) ?? o.parentId,
      }));
      set({ objects: [...objects, newGroup, ...fixedDescendants], selectedId: newGroupId, selectedIds: [newGroupId], isModified: true, ...withHistory({ objects, environment }, past) });
    } else {
      // 그룹 내부 오브젝트는 같은 부모 아래에 제자리 복제
      const copy: ObjectNodeSchema = { ...src, id: MathUtils.generateUUID(), name: `${src.name} 복사`, parentId: src.parentId };
      set({ objects: [...objects, copy], selectedId: copy.id, selectedIds: [copy.id], isModified: true, ...withHistory({ objects, environment }, past) });
    }
  },

  requestSaveBookmark: (slot) => set({ bookmarkSaveRequest: { slot, _tick: Date.now() } }),
  requestRecallBookmark: (slot) => set({ bookmarkRecallRequest: { slot, _tick: Date.now() } }),
  setCameraBookmark: (slot, position, target) =>
    set((s) => ({ cameraBookmarks: { ...s.cameraBookmarks, [slot]: { position, target } } })),

  addContentObject: (type) => {
    objectCounter += 1;
    const defaults = {
      text: { text: '텍스트를 입력하세요', fontSize: 0.5, color: '#ffffff', depth: 0.1 },
      image: { url: '' },
      video: { url: '' },
    };
    const obj = makeBaseObject({
      name: type === 'text' ? `텍스트 ${objectCounter}` : type === 'image' ? `이미지 ${objectCounter}` : `동영상 ${objectCounter}`,
      primitiveShape: 'plane',
      position: { x: 0, y: 0.5, z: 0 },
      scale: type === 'video' ? { x: 16 / 9, y: 1, z: 1 } : { x: 2, y: 1, z: 1 },
      content: { type, ...defaults[type] },
    });
    const { objects, environment, past } = get();
    set({
      objects: [...objects, obj],
      selectedId: obj.id,
      selectedIds: [obj.id],
      isModified: true,
      ...withHistory({ objects, environment }, past),
    });
  },

  addParticleObject: (preset) => {
    objectCounter += 1;
    const PRESET_NAMES: Record<string, string> = { fire: '불꽃', dust: '먼지', light: '빛 파티클', snow: '눈' };
    const obj = makeBaseObject({
      name: `${PRESET_NAMES[preset] ?? '파티클'} ${objectCounter}`,
      particle: { preset },
    });
    const { objects, environment, past } = get();
    set({
      objects: [...objects, obj],
      selectedId: obj.id,
      selectedIds: [obj.id],
      isModified: true,
      ...withHistory({ objects, environment }, past),
    });
  },

  addAsset: (asset) => {
    const { assets } = get();
    if (assets.find((a) => a.id === asset.id)) return;
    set({ assets: [...assets, asset] });
  },

  removeAsset: (id) => {
    const { assets } = get();
    set({ assets: assets.filter((a) => a.id !== id), isModified: true });
  },

  removeObjectsByAsset: (assetId) => {
    const { objects, environment, past, selectedId, selectedIds } = get();
    const directIds = objects.filter((o) => o.assetId === assetId).map((o) => o.id);
    if (directIds.length === 0) return 0;
    const collectDescendants = (oid: string): string[] => {
      const children = objects.filter((o) => o.parentId === oid);
      return [oid, ...children.flatMap((c) => collectDescendants(c.id))];
    };
    const allToDelete = new Set(directIds.flatMap((id) => collectDescendants(id)));
    set({
      objects: objects.filter((o) => !allToDelete.has(o.id)),
      selectedId: selectedId && allToDelete.has(selectedId) ? null : selectedId,
      selectedIds: selectedIds.filter((id) => !allToDelete.has(id)),
      isModified: true,
      ...withHistory({ objects, environment }, past),
    });
    return allToDelete.size;
  },

  addAssetObject: (asset) => {
    objectCounter += 1;
    const obj = makeBaseObject({
      name: asset.name,
      assetId: asset.id,
    });
    const { objects, environment, past } = get();
    set({
      objects: [...objects, obj],
      selectedId: obj.id,
      selectedIds: [obj.id],
      isModified: true,
      ...withHistory({ objects, environment }, past),
    });
    // 밑면을 바닥에 자동 정렬 — bbox가 이미 캐시돼 있으면 즉시, 아니면 pending으로 두고 GlbObject 로드 시 재시도
    pendingFloorSnap.add(obj.id);
    get().floorSnapObject(obj.id);
  },

  mergeIntoAsset: (rootIds, asset, position, name) => {
    const { objects, assets, environment, past } = get();
    // 대상 루트들의 모든 자손 수집 → 제거
    const collectDesc = (id: string): string[] => {
      const children = objects.filter((o) => o.parentId === id);
      return [id, ...children.flatMap((c) => collectDesc(c.id))];
    };
    const toRemove = new Set(rootIds.flatMap(collectDesc));
    objectCounter += 1;
    const merged = makeBaseObject({ name, assetId: asset.id, position: { ...position } });
    set({
      objects: [...objects.filter((o) => !toRemove.has(o.id)), merged],
      assets: assets.some((a) => a.id === asset.id) ? assets : [...assets, asset],
      selectedId: merged.id,
      selectedIds: [merged.id],
      isModified: true,
      ...withHistory({ objects, environment }, past),
    });
  },

  floorSnapObject: (id) => {
    if (!pendingFloorSnap.has(id)) return;
    const { objects, assets } = get();
    const o = objects.find((x) => x.id === id);
    if (!o || o.parentId) { pendingFloorSnap.delete(id); return; } // 루트만
    if (o.assetId) {
      const url = assets.find((a) => a.id === o.assetId)?.dracoUrl;
      if (!url || !glbLocalBboxCache.has(url)) return; // GLB bbox 아직 → pending 유지
    }
    const b = worldBBox(objects, assets, id);
    if (!b) return;
    pendingFloorSnap.delete(id);
    const newY = o.position.y - b.min.y; // 밑면이 y=0에 오도록
    if (Math.abs(newY - o.position.y) < 1e-4) return; // 이미 맞음
    // 히스토리 없이 위치만 보정(추가 액션에 묻어가는 자동 보정)
    set({
      objects: get().objects.map((x) => (x.id === id ? { ...x, position: { ...x.position, y: newY } } : x)),
      isModified: true,
    });
  },

  updateObject: (id, patch) => {
    const { objects, environment, prefabs, _prevSnapshot } = get();
    const target = objects.find((o) => o.id === id);
    // 프리팹 인스턴스 노드를 편집하면, 바뀐 필드가 속한 override 그룹을 기록 → 동기화 시 그 그룹은 원본을 안 따른다.
    let overridePatch: Partial<ObjectNodeSchema> | null = null;
    if (target?.prefabInstanceId && target.prefabId) {
      const def = prefabs.find((p) => p.id === target.prefabId);
      const isRoot = !!def && target.prefabNodeKey === def.rootKey;
      const groups = overrideGroupsFromPatch(Object.keys(patch), isRoot);
      if (groups.length > 0) {
        const merged = new Set<PrefabOverrideGroup>(target.prefabOverrides ?? []);
        groups.forEach((g) => merged.add(g));
        overridePatch = { prefabOverrides: [...merged] };
      }
    }
    set({
      _prevSnapshot: _prevSnapshot ?? { objects, environment },
      objects: objects.map((o) => (o.id === id ? { ...o, ...patch, ...overridePatch } : o)),
      isModified: true,
    });
  },

  commitTransforms: (updates) => {
    const { objects, environment, past } = get();
    const map = new Map(updates.map((u) => [u.id, u]));
    set({
      objects: objects.map((o) => {
        const u = map.get(o.id);
        return u ? { ...o, position: { ...u.position }, rotation: { ...u.rotation }, scale: { ...u.scale } } : o;
      }),
      isModified: true,
      // 직전에 커밋 안 된 편집 스냅샷 잔재를 버려 히스토리 오염 차단(기즈모는 자체 baseline으로 원자 커밋).
      _prevSnapshot: null,
      // 이 변환 '직전'의 objects를 undo 기준으로 원자적 커밋 → undo가 항상 일관된 단일 상태로 복원.
      ...withHistory({ objects, environment }, past),
    });
  },

  // 잠금 토글 — 잠글 때는 현재 선택에서도 제외한다(잠긴 오브젝트는 기즈모/하이라이트 대상이 아니므로).
  // updateObject와 동일하게 _prevSnapshot만 세팅 → 호출부의 pushHistory()가 커밋(undo 1회).
  setObjectLocked: (id, locked) => {
    const { objects, environment, _prevSnapshot, selectedId, selectedIds } = get();
    const nextIds = locked ? selectedIds.filter((x) => x !== id) : selectedIds;
    set({
      _prevSnapshot: _prevSnapshot ?? { objects, environment },
      objects: objects.map((o) => (o.id === id ? { ...o, locked } : o)),
      selectedIds: nextIds,
      selectedId: locked && selectedId === id ? (nextIds[nextIds.length - 1] ?? null) : selectedId,
      isModified: true,
    });
  },

  // 계층 리스트 드래그 이동 — 순서 변경 + 그룹 안팎 재부모화(reparent).
  // 배열 순서 = 같은 부모 내 형제 순서. before/after는 target의 형제로, inside는 target(그룹) 자식으로.
  // 부모가 바뀌면 월드 위치를 유지하도록 월드 변환을 새 부모 기준 로컬 변환으로 재계산한다
  // (그룹 자체를 옮겨도 자식은 로컬 좌표라 서브트리 전체가 제자리를 유지).
  moveObject: (draggedId, targetId, position) => {
    if (draggedId === targetId) return;
    const { objects, environment, past } = get();
    const dragged = objects.find((o) => o.id === draggedId);
    const target = objects.find((o) => o.id === targetId);
    if (!dragged || !target) return;
    if (position === 'inside' && !target.isGroup) return;

    const newParentId = position === 'inside' ? targetId : target.parentId;
    // 순환 방지 — 새 부모가 자기 자신이거나 자기 자손이면 거부
    if (newParentId === draggedId) return;
    if (newParentId && isDescendant(objects, newParentId, draggedId)) return;

    let moved = dragged;
    if (newParentId !== dragged.parentId) {
      // 월드 변환 유지 → 새 부모 기준 로컬 변환으로 변환
      const world = computeWorldMatrix(objects, draggedId);
      const parentWorld = newParentId ? computeWorldMatrix(objects, newParentId) : new Matrix4();
      const local = parentWorld.invert().multiply(world);
      const p = new Vector3(), q = new Quaternion(), s = new Vector3();
      local.decompose(p, q, s);
      const e = new Euler().setFromQuaternion(q);
      moved = {
        ...dragged,
        parentId: newParentId,
        position: { x: p.x, y: p.y, z: p.z },
        rotation: { x: e.x * RAD2DEG_M, y: e.y * RAD2DEG_M, z: e.z * RAD2DEG_M },
        scale: { x: s.x, y: s.y, z: s.z },
      };
    }

    const rest = objects.filter((o) => o.id !== draggedId);
    const targetIdx = rest.findIndex((o) => o.id === targetId);
    if (targetIdx < 0) return;
    // inside: 그룹 헤더 바로 뒤(첫 자식), before/after: target 앞/뒤
    const insertIdx = position === 'before' ? targetIdx : targetIdx + 1;
    let next = [...rest.slice(0, insertIdx), moved, ...rest.slice(insertIdx)];

    // 멤버십이 바뀐 경우에만 관련 그룹 피벗을 자식 중심으로 재배치
    // (같은 부모 내 순서 변경은 중심이 그대로이므로 제외)
    const oldParentId = dragged.parentId;
    if (newParentId !== oldParentId) {
      if (newParentId && next.find((o) => o.id === newParentId)?.isGroup) {
        next = recenterGroup(next, newParentId);
      }
      if (oldParentId && next.find((o) => o.id === oldParentId)?.isGroup) {
        next = recenterGroup(next, oldParentId);
      }
    }

    set({ objects: next, isModified: true, ...withHistory({ objects, environment }, past) });
  },

  deleteSelected: () => {
    const { selectedId, selectedIds, objects, environment, past } = get();
    const roots = selectedIds.length > 0 ? selectedIds : (selectedId ? [selectedId] : []);
    if (roots.length === 0) return;
    // 그룹의 모든 자손도 함께 삭제
    const collectDescendants = (id: string): string[] => {
      const children = objects.filter((o) => o.parentId === id);
      return [id, ...children.flatMap((c) => collectDescendants(c.id))];
    };
    const allToDelete = new Set(roots.flatMap((id) => collectDescendants(id)));
    set({
      objects: objects.filter((o) => !allToDelete.has(o.id)),
      selectedId: null,
      selectedIds: [],
      isModified: true,
      ...withHistory({ objects, environment }, past),
    });
  },

  alignSelected: (axis, mode) => {
    const { selectedIds, objects, assets, environment, past } = get();
    const targets = objects.filter((o) => selectedIds.includes(o.id));
    if (targets.length < 2) return;
    // 원점이 아니라 월드 바운딩박스 기준으로 정렬(min=좌/하/뒤 모서리, max=우/상/앞, center=중심)
    // → 원점이 형상 중심이 아니거나 회전돼 있어도 시각 모서리가 맞는다.
    const boxes = new Map(targets.map((o) => [o.id, worldBBox(objects, assets, o.id)]));
    const edge = (id: string, fallback: number): number => {
      const b = boxes.get(id);
      if (!b) return fallback;
      return mode === 'min' ? b.min[axis] : mode === 'max' ? b.max[axis] : (b.min[axis] + b.max[axis]) / 2;
    };
    const vals = targets.map((o) => edge(o.id, o.position[axis]));
    const targetVal = mode === 'min' ? Math.min(...vals) : mode === 'max' ? Math.max(...vals) : vals.reduce((a, b) => a + b, 0) / vals.length;
    set({
      objects: objects.map((o) => {
        if (!selectedIds.includes(o.id)) return o;
        // 현재 모서리/중심을 targetVal로 옮기는 만큼 position[axis] 이동(루트 기준 1:1)
        const delta = targetVal - edge(o.id, o.position[axis]);
        return { ...o, position: { ...o.position, [axis]: o.position[axis] + delta } };
      }),
      isModified: true,
      ...withHistory({ objects, environment }, past),
    });
  },

  duplicateSelected: () => {
    const { selectedId, objects, environment, past } = get();
    if (!selectedId) return;
    const src = objects.find((o) => o.id === selectedId);
    if (!src) return;
    objectCounter += 1;

    if (src.isGroup) {
      // 중첩 그룹 포함 전체 하위 계층 재귀 복제
      const idMap = new Map<string, string>();
      const newDescendants: ObjectNodeSchema[] = [];

      const collectAll = (parentId: string): void => {
        const children = objects.filter((o) => o.parentId === parentId);
        for (const child of children) {
          const newId = MathUtils.generateUUID();
          idMap.set(child.id, newId);
          newDescendants.push({ ...child, id: newId });
          if (child.isGroup) collectAll(child.id);
        }
      };

      const newGroupId = MathUtils.generateUUID();
      idMap.set(src.id, newGroupId);
      collectAll(src.id);

      const newGroup: ObjectNodeSchema = {
        ...src,
        id: newGroupId,
        name: `${src.name} 복사`,
        position: { ...src.position, x: src.position.x + 1 },
      };
      // parentId를 새로 생성된 ID로 교체
      const fixedDescendants = newDescendants.map((o) => ({
        ...o,
        parentId: idMap.get(o.parentId!) ?? o.parentId,
      }));
      set({
        objects: [...objects, newGroup, ...fixedDescendants],
        selectedId: newGroupId,
        selectedIds: [newGroupId],
        isModified: true,
        ...withHistory({ objects, environment }, past),
      });
    } else {
      // 그룹 내부 오브젝트는 같은 부모 아래에 복제 (parentId 유지)
      const copy: ObjectNodeSchema = {
        ...src,
        id: MathUtils.generateUUID(),
        name: `${src.name} 복사`,
        position: { ...src.position, x: src.position.x + 1 },
        parentId: src.parentId,
      };
      set({
        objects: [...objects, copy],
        selectedId: copy.id,
        selectedIds: [copy.id],
        isModified: true,
        ...withHistory({ objects, environment }, past),
      });
    }
  },

  arraySelected: (count, offset, radial) => {
    const { selectedId, objects, environment, past } = get();
    if (!selectedId || count < 2) return;
    const src = objects.find((o) => o.id === selectedId);
    if (!src) return;

    const additions: ObjectNodeSchema[] = [];
    const newIds: string[] = [];

    // radial: 원 위의 각 위치(중심 기준 오프셋). axis=원이 도는 축(원 평면의 법선).
    const ringOffset = (theta: number) => {
      const r = radial!.radius, c = Math.cos(theta) * r, s = Math.sin(theta) * r;
      if (radial!.axis === 'x') return { x: 0, y: c, z: s };
      if (radial!.axis === 'z') return { x: c, y: s, z: 0 };
      return { x: c, y: 0, z: s }; // y(기본): XZ 평면
    };
    // 원본을 각도 0에 두고 중심을 역산 → 원본은 제자리, 나머지가 원을 그린다.
    const o0 = radial ? ringOffset(0) : null;
    const center = o0 ? { x: src.position.x - o0.x, y: src.position.y - o0.y, z: src.position.z - o0.z } : null;

    for (let i = 1; i < count; i++) {
      let pos: { x: number; y: number; z: number };
      if (radial && center) {
        const off = ringOffset((2 * Math.PI / count) * i);
        pos = { x: center.x + off.x, y: center.y + off.y, z: center.z + off.z };
      } else {
        pos = { x: src.position.x + offset.x * i, y: src.position.y + offset.y * i, z: src.position.z + offset.z * i };
      }

      if (src.isGroup) {
        // 중첩 그룹 포함 전체 하위 계층 재귀 복제 (duplicateSelected와 동일 패턴)
        const idMap = new Map<string, string>();
        const newDescendants: ObjectNodeSchema[] = [];
        const collectAll = (parentId: string): void => {
          for (const child of objects.filter((o) => o.parentId === parentId)) {
            const newId = MathUtils.generateUUID();
            idMap.set(child.id, newId);
            newDescendants.push({ ...child, id: newId });
            if (child.isGroup) collectAll(child.id);
          }
        };
        const newGroupId = MathUtils.generateUUID();
        idMap.set(src.id, newGroupId);
        collectAll(src.id);
        additions.push({ ...src, id: newGroupId, name: `${src.name} ${i}`, position: pos });
        for (const o of newDescendants) {
          additions.push({ ...o, parentId: idMap.get(o.parentId!) ?? o.parentId });
        }
        newIds.push(newGroupId);
      } else {
        const id = MathUtils.generateUUID();
        additions.push({ ...src, id, name: `${src.name} ${i}`, position: pos, parentId: src.parentId });
        newIds.push(id);
      }
    }

    if (additions.length === 0) return;
    set({
      objects: [...objects, ...additions],
      selectedId: newIds[newIds.length - 1],
      selectedIds: [selectedId, ...newIds],
      isModified: true,
      ...withHistory({ objects, environment }, past),
    });
  },

  makeCloner: (config) => {
    const { selectedId, objects, environment, past } = get();
    if (!selectedId) return;
    const src = objects.find((o) => o.id === selectedId);
    if (!src || src.parentId || src.clonerConfig || src.clonerClone) return; // 루트·비클로너·비복제본만
    const cfg: ClonerConfig = config ? { ...config } : { ...DEFAULT_CLONER };
    objectCounter += 1;
    const clonerGroup = makeBaseObject({
      name: `클로너 ${objectCounter}`,
      isGroup: true,
      position: { ...src.position }, // 그룹(=패턴 중심)을 소스 자리에
      clonerConfig: cfg,
    });
    const gid = clonerGroup.id;
    const p0 = clonerPlacement(cfg, 0); // 소스를 placement(0)로
    const rebased = objects.map((o) => (o.id === src.id ? { ...o, parentId: gid, position: { x: p0.x, y: p0.y, z: p0.z } } : o));
    const regenerated = regenerateCloner([...rebased, clonerGroup], gid, cfg);
    set({
      objects: regenerated,
      selectedId: gid,
      selectedIds: [gid],
      isModified: true,
      ...withHistory({ objects, environment }, past),
    });
  },

  updateCloner: (groupId, config) => {
    const { objects, environment, _prevSnapshot } = get();
    const withCfg = objects.map((o) => (o.id === groupId ? { ...o, clonerConfig: { ...config } } : o));
    const regenerated = regenerateCloner(withCfg, groupId, config);
    set({
      _prevSnapshot: _prevSnapshot ?? { objects, environment },
      objects: regenerated,
      isModified: true,
    });
  },

  groupSelected: () => {
    const { selectedIds, objects, environment, past } = get();
    if (selectedIds.length < 2) return;

    // 그룹 내부 아이템 선택 시 최상위 조상으로 정규화
    // (로컬 좌표와 월드 좌표 혼용 방지)
    const getRootId = (id: string): string => {
      const o = objects.find((x) => x.id === id);
      if (!o || !o.parentId) return id;
      return getRootId(o.parentId);
    };
    const normalizedIds = [...new Set(selectedIds.map(getRootId))];
    if (normalizedIds.length < 2) return;

    const toGroup = objects.filter((o) => normalizedIds.includes(o.id));

    // 정규화된 아이템은 모두 최상위(world 좌표) → centroid 계산 정확
    let cx = 0, cy = 0, cz = 0;
    toGroup.forEach((o) => { cx += o.position.x; cy += o.position.y; cz += o.position.z; });
    cx /= toGroup.length; cy /= toGroup.length; cz /= toGroup.length;

    objectCounter += 1;
    const groupObj = makeBaseObject({
      name: `그룹 ${objectCounter}`,
      position: { x: cx, y: cy, z: cz },
      isGroup: true,
    });
    const groupId = groupObj.id;

    const updatedObjects = objects.map((o) =>
      normalizedIds.includes(o.id)
        ? { ...o, parentId: groupId, position: { x: o.position.x - cx, y: o.position.y - cy, z: o.position.z - cz } }
        : o
    );

    set({
      objects: [...updatedObjects, groupObj],
      selectedId: groupId,
      selectedIds: [groupId],
      isModified: true,
      ...withHistory({ objects, environment }, past),
    });
  },

  ungroupSelected: () => {
    const { selectedId, objects, environment, past } = get();
    if (!selectedId) return;
    const group = objects.find((o) => o.id === selectedId);
    if (!group?.isGroup) return;

    // 행렬 기반: 자식의 참 월드행렬(그룹 체인 포함)을 새 부모(그룹의 부모=중첩이면 조부모, 아니면 root)
    // 기준 로컬로 변환해 decompose. 회전+비균일 스케일에서도 위치/방향/크기가 어긋나지 않는다
    // (기존엔 scale을 성분별 곱 후 회전 → 회전·스케일 비가환으로 자식 위치가 산발적으로 틀어졌음).
    const newParentId = group.parentId;
    const parentInv = newParentId
      ? computeWorldMatrix(objects, newParentId).invert()
      : new Matrix4();

    const children = objects.filter((o) => o.parentId === selectedId);
    const p = new Vector3(), q = new Quaternion(), s = new Vector3();
    const restoredChildren = children.map((c) => {
      const world = computeWorldMatrix(objects, c.id);
      const local = new Matrix4().multiplyMatrices(parentInv, world);
      local.decompose(p, q, s);
      const e = new Euler().setFromQuaternion(q);
      return {
        ...c,
        parentId: newParentId,
        position: { x: p.x, y: p.y, z: p.z },
        rotation: { x: e.x * RAD2DEG_M, y: e.y * RAD2DEG_M, z: e.z * RAD2DEG_M },
        scale: { x: s.x, y: s.y, z: s.z },
      };
    });

    const remaining = objects.filter((o) => o.id !== selectedId && !children.find((c) => c.id === o.id));

    set({
      objects: [...remaining, ...restoredChildren],
      selectedId: null,
      selectedIds: restoredChildren.map((c) => c.id),
      isModified: true,
      ...withHistory({ objects, environment }, past),
    });
  },

  // ── 프리팹 ──
  createPrefab: (name) => {
    const { selectedId, objects, environment, prefabs, past } = get();
    if (!selectedId) return;
    const src = objects.find((o) => o.id === selectedId);
    if (!src || src.parentId) return; // 루트 오브젝트/그룹만
    if (src.prefabInstanceId) return;  // 이미 프리팹 인스턴스면 무시
    const { prefab, tagged } = buildPrefab(objects, selectedId, name?.trim() || src.name || '프리팹');
    const taggedById = new Map(tagged.map((t) => [t.id, t]));
    set({
      objects: objects.map((o) => taggedById.get(o.id) ?? o),
      prefabs: [...prefabs, prefab],
      isModified: true,
      ...withHistory({ objects, environment, prefabs }, past),
    });
  },

  instantiatePrefab: (prefabId, position?: Vec3Schema) => {
    const { objects, environment, prefabs, past } = get();
    const prefab = prefabs.find((p) => p.id === prefabId);
    if (!prefab) return;
    const { objects: newObjects, rootId } = instantiatePrefabNodes(prefab, { position });
    set({
      objects: [...objects, ...newObjects],
      selectedId: rootId,
      selectedIds: [rootId],
      isModified: true,
      ...withHistory({ objects, environment, prefabs }, past),
    });
  },

  applyInstanceToPrefab: (instanceRootId) => {
    const { objects, environment, prefabs, past } = get();
    const root = objects.find((o) => o.id === instanceRootId);
    if (!root?.prefabId || !root.prefabInstanceId) return;
    const prefab = prefabs.find((p) => p.id === root.prefabId);
    if (!prefab) return;
    const iid = root.prefabInstanceId;
    // 1) 인스턴스 현재 상태로 def 재구성  2) 소스 인스턴스의 override 초기화(이제 def에 반영됨)  3) 전체 재동기화
    const newPrefab = rebuildPrefabFromInstance(objects, prefab, instanceRootId);
    const clearedSource = objects.map((o) =>
      o.prefabInstanceId === iid ? { ...o, prefabOverrides: [] } : o,
    );
    const newPrefabs = prefabs.map((p) => (p.id === newPrefab.id ? newPrefab : p));
    const synced = syncInstances(clearedSource, newPrefab);
    set({
      objects: synced,
      prefabs: newPrefabs,
      isModified: true,
      ...withHistory({ objects, environment, prefabs }, past),
    });
  },

  revertInstance: (instanceRootId, group) => {
    const { objects, environment, prefabs, past } = get();
    const root = objects.find((o) => o.id === instanceRootId);
    if (!root?.prefabId || !root.prefabInstanceId) return;
    const prefab = prefabs.find((p) => p.id === root.prefabId);
    if (!prefab) return;
    const iid = root.prefabInstanceId;
    // override 제거(그룹 지정 시 그 그룹만) → 재동기화가 원본 값을 다시 당겨온다.
    const cleared = objects.map((o) =>
      o.prefabInstanceId === iid
        ? { ...o, prefabOverrides: group ? (o.prefabOverrides ?? []).filter((g) => g !== group) : [] }
        : o,
    );
    const synced = syncInstances(cleared, prefab);
    set({
      objects: synced,
      isModified: true,
      ...withHistory({ objects, environment, prefabs }, past),
    });
  },

  deletePrefab: (prefabId) => {
    const { objects, environment, prefabs, past } = get();
    if (!prefabs.some((p) => p.id === prefabId)) return;
    // 인스턴스는 씬에 유지하되 프리팹 태그를 벗겨 독립 오브젝트로 만든다.
    const detached = objects.map((o) =>
      o.prefabId === prefabId
        ? { ...o, prefabId: undefined, prefabInstanceId: undefined, prefabNodeKey: undefined, prefabOverrides: undefined }
        : o,
    );
    set({
      objects: detached,
      prefabs: prefabs.filter((p) => p.id !== prefabId),
      isModified: true,
      ...withHistory({ objects, environment, prefabs }, past),
    });
  },

  renamePrefab: (prefabId, name) => {
    const { environment, objects, prefabs, past } = get();
    const trimmed = name.trim();
    if (!trimmed || !prefabs.some((p) => p.id === prefabId)) return;
    set({
      prefabs: prefabs.map((p) => (p.id === prefabId ? { ...p, name: trimmed } : p)),
      isModified: true,
      ...withHistory({ objects, environment, prefabs }, past),
    });
  },

  updateEnvironment: (patch) => {
    const { environment, objects, _prevSnapshot } = get();
    set({
      _prevSnapshot: _prevSnapshot ?? { objects, environment },
      environment: { ...environment, ...patch },
      isModified: true,
    });
  },

  pushHistory: () => {
    const { _prevSnapshot, objects, environment, past } = get();
    const snapshot = _prevSnapshot ?? { objects, environment };
    set({ ...withHistory(snapshot, past), _prevSnapshot: null });
  },

  undo: () => {
    const { past, objects, environment, prefabs, future } = get();
    if (past.length === 0) return;
    const prev = past[past.length - 1];
    set({
      objects: prev.objects,
      environment: prev.environment,
      // 스냅샷에 prefabs가 있으면 복원(프리팹 액션), 없으면 현재값 유지(그 액션은 prefabs 미변경).
      prefabs: prev.prefabs ?? prefabs,
      past: past.slice(0, -1),
      future: [{ objects, environment, prefabs }, ...future],
      isModified: true,
      _prevSnapshot: null,
    });
  },

  redo: () => {
    const { past, objects, environment, prefabs, future } = get();
    if (future.length === 0) return;
    const next = future[0];
    set({
      objects: next.objects,
      environment: next.environment,
      prefabs: next.prefabs ?? prefabs,
      past: pushPast(past, { objects, environment, prefabs }),
      future: future.slice(1),
      isModified: true,
      _prevSnapshot: null,
    });
  },

  markSaved: (savedVersion) => set(savedVersion !== undefined ? { isModified: false, savedVersion } : { isModified: false }),
  markModified: () => set({ isModified: true }),
  toggleWireframe: () => set((s) => ({ wireframeMode: !s.wireframeMode })),

  copyObjectProperties: () => {
    const { selectedId, objects } = get();
    if (!selectedId) return;
    const obj = objects.find((o) => o.id === selectedId);
    if (!obj) return;
    set({ copiedProperties: { material: obj.material ? { ...obj.material } : undefined, physics: { ...obj.physics } } });
  },

  pasteObjectProperties: () => {
    const { selectedId, objects, copiedProperties, environment, past } = get();
    if (!selectedId || !copiedProperties) return;
    set({
      objects: objects.map((o) =>
        o.id === selectedId
          ? {
              ...o,
              ...(copiedProperties.material !== undefined ? { material: { ...copiedProperties.material } } : {}),
              physics: copiedProperties.physics ? { ...copiedProperties.physics } : o.physics,
            }
          : o
      ),
      isModified: true,
      ...withHistory({ objects, environment }, past),
    });
  },

  batchUpdateObjects: (ids, patch) => {
    const { objects, environment, past } = get();
    set({
      objects: objects.map((o) => ids.includes(o.id) ? { ...o, ...patch(o) } : o),
      isModified: true,
      ...withHistory({ objects, environment }, past),
    });
  },

  addLightObject: (type) => {
    objectCounter += 1;
    const LIGHT_NAMES: Record<LightType, string> = { point: '포인트 라이트', spot: '스팟 라이트', directional: '방향 라이트' };
    const obj = makeBaseObject({
      name: `${LIGHT_NAMES[type]} ${objectCounter}`,
      position: { x: 0, y: 3, z: 0 },
      light: { type, color: '#ffffff', intensity: 1, distance: 20, decay: 2, castShadow: false },
    });
    const { objects, environment, past } = get();
    set({
      objects: [...objects, obj],
      selectedId: obj.id,
      selectedIds: [obj.id],
      isModified: true,
      ...withHistory({ objects, environment }, past),
    });
  },
}));
