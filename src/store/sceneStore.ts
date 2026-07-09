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

interface HistoryEntry {
  objects: ObjectNodeSchema[];
  environment: EnvSchema;
  // 프리팹 정의도 함께 스냅샷(프리팹 관련 액션만 채움). 미설정 = 이 액션은 prefabs를 안 바꿈 → undo 시 현재값 유지.
  prefabs?: PrefabSchema[];
}

export interface LayerState {
  name: string;
  visible: boolean;
  locked: boolean;
}

interface SceneState {
  projectId: string | null;
  sceneId: string | null;
  objects: ObjectNodeSchema[];
  assets: AssetRefSchema[];
  environment: EnvSchema;
  // 프리팹 원본 정의 라이브러리(씬 단위). 인스턴스는 objects에 구워진 채로 존재한다.
  prefabs: PrefabSchema[];
  layers: Record<string, LayerState>;
  selectedId: string | null;
  selectedIds: string[];
  transformMode: 'translate' | 'rotate' | 'scale';
  transformSpace: 'world' | 'local';
  snapEnabled: boolean;
  snapTranslate: number;
  snapRotate: number;
  focusTarget: { x: number; y: number; z: number; _tick: number } | null;
  focusAllRequest: number | null;
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
  toggleSelectObject: (id: string) => void;
  selectObjects: (ids: string[]) => void;
  deleteSelected: () => void;
  alignSelected: (axis: 'x' | 'y' | 'z', mode: 'min' | 'center' | 'max') => void;
  setTransformMode: (mode: 'translate' | 'rotate' | 'scale') => void;
  setTransformSpace: (space: 'world' | 'local') => void;
  addObject: (shape: PrimitiveShape) => void;
  addAsset: (asset: AssetRefSchema) => void;
  addAssetObject: (asset: AssetRefSchema) => void;
  addContentObject: (type: ContentType) => void;
  addParticleObject: (preset: ParticlePreset) => void;
  setSnap: (enabled: boolean, translate?: number, rotate?: number) => void;
  requestFocus: () => void;
  requestFocusAll: () => void;
  requestCameraView: (view: 'top' | 'front' | 'right') => void;
  duplicateInPlace: () => void;
  requestSaveBookmark: (slot: number) => void;
  requestRecallBookmark: (slot: number) => void;
  setCameraBookmark: (slot: number, position: [number, number, number], target: [number, number, number]) => void;
  updateObject: (id: string, patch: Partial<ObjectNodeSchema>) => void;
  setObjectLocked: (id: string, locked: boolean) => void;
  moveObject: (draggedId: string, targetId: string, position: 'before' | 'after' | 'inside') => void;
  duplicateSelected: () => void;
  // 선택 오브젝트를 일정 간격으로 count개(원본 포함)까지 배열 복제 — 울타리·기둥 등. offset은 복제 간 간격.
  arraySelected: (count: number, offset: { x: number; y: number; z: number }) => void;
  groupSelected: () => void;
  ungroupSelected: () => void;
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
  addLayer: (name: string) => void;
  toggleLayerVisible: (name: string) => void;
  toggleLayerLocked: (name: string) => void;
  setObjectLayer: (id: string, layer: string) => void;
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

function makeObject(shape: PrimitiveShape): ObjectNodeSchema {
  objectCounter += 1;
  return makeBaseObject({
    name: `${SHAPE_NAMES[shape]} ${objectCounter}`,
    primitiveShape: shape,
    material: { color: '#a78bfa', roughness: 0.5, metalness: 0.1 },
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
  transformMode: 'translate',
  transformSpace: 'world',
  snapEnabled: false,
  snapTranslate: 0.5,
  snapRotate: 15,
  layers: { default: { name: 'Default', visible: true, locked: false } },
  selectedIds: [],
  focusTarget: null,
  focusAllRequest: null,
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
      isModified: false,
      savedVersion,
      past: [],
      future: [],
      _prevSnapshot: null,
    });
  },

  selectObject: (id) => set({ selectedId: id, selectedIds: id ? [id] : [] }),
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

  arraySelected: (count, offset) => {
    const { selectedId, objects, environment, past } = get();
    if (!selectedId || count < 2) return;
    const src = objects.find((o) => o.id === selectedId);
    if (!src) return;

    const additions: ObjectNodeSchema[] = [];
    const newIds: string[] = [];

    for (let i = 1; i < count; i++) {
      const dx = offset.x * i, dy = offset.y * i, dz = offset.z * i;
      const pos = { x: src.position.x + dx, y: src.position.y + dy, z: src.position.z + dz };

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

    const DEG2RAD = Math.PI / 180;
    const RAD2DEG = 180 / Math.PI;

    const groupQuat = new Quaternion().setFromEuler(
      new Euler(
        group.rotation.x * DEG2RAD,
        group.rotation.y * DEG2RAD,
        group.rotation.z * DEG2RAD,
      ),
    );

    const children = objects.filter((o) => o.parentId === selectedId);
    const restoredChildren = children.map((c) => {
      // 자식 로컬 좌표 → 그룹 scale 적용 → 그룹 rotation 적용 → 그룹 위치 더하기
      const localPos = new Vector3(c.position.x, c.position.y, c.position.z);
      localPos.x *= group.scale.x;
      localPos.y *= group.scale.y;
      localPos.z *= group.scale.z;
      localPos.applyQuaternion(groupQuat);
      localPos.x += group.position.x;
      localPos.y += group.position.y;
      localPos.z += group.position.z;

      // 월드 rotation = 그룹 rotation * 자식 rotation
      const childQuat = new Quaternion().setFromEuler(
        new Euler(c.rotation.x * DEG2RAD, c.rotation.y * DEG2RAD, c.rotation.z * DEG2RAD),
      );
      const worldEuler = new Euler().setFromQuaternion(groupQuat.clone().multiply(childQuat));

      return {
        ...c,
        parentId: null,
        position: { x: localPos.x, y: localPos.y, z: localPos.z },
        rotation: {
          x: worldEuler.x * RAD2DEG,
          y: worldEuler.y * RAD2DEG,
          z: worldEuler.z * RAD2DEG,
        },
        scale: {
          x: c.scale.x * group.scale.x,
          y: c.scale.y * group.scale.y,
          z: c.scale.z * group.scale.z,
        },
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

  addLayer: (name) => set((s) => ({
    layers: { ...s.layers, [name.toLowerCase().replace(/\s+/g, '_')]: { name, visible: true, locked: false } },
  })),

  toggleLayerVisible: (key) => set((s) => {
    const layer = s.layers[key];
    if (!layer) return s;
    const visible = !layer.visible;
    const layers = { ...s.layers, [key]: { ...layer, visible } };
    const objects = s.objects.map((o) => o.layer === key ? { ...o, visible } : o);
    return { layers, objects, isModified: true };
  }),

  toggleLayerLocked: (key) => set((s) => {
    const layer = s.layers[key];
    if (!layer) return s;
    const locked = !layer.locked;
    const layers = { ...s.layers, [key]: { ...layer, locked } };
    const objects = s.objects.map((o) => o.layer === key ? { ...o, locked } : o);
    return { layers, objects, isModified: true };
  }),

  setObjectLayer: (id, layer) => set((s) => ({
    objects: s.objects.map((o) => o.id === id ? { ...o, layer } : o),
    isModified: true,
  })),

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
