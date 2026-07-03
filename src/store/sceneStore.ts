import { create } from 'zustand';
import { MathUtils, Quaternion, Euler, Vector3 } from 'three';
import {
  ObjectNodeSchema,
  AssetRefSchema,
  EnvSchema,
  ProjectSceneSchema,
  DEFAULT_ENVIRONMENT,
  DEFAULT_PHYSICS,
  PrimitiveShape,
  ContentType,
  ParticlePreset,
  LightType,
} from '@/types/scene';

interface HistoryEntry {
  objects: ObjectNodeSchema[];
  environment: EnvSchema;
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
  loadScene: (data: ProjectSceneSchema) => void;
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
  duplicateSelected: () => void;
  groupSelected: () => void;
  ungroupSelected: () => void;
  updateEnvironment: (patch: Partial<EnvSchema>) => void;
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;
  markSaved: () => void;
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
}

const SHAPE_NAMES: Record<PrimitiveShape, string> = {
  box: '박스',
  sphere: '구체',
  cylinder: '원기둥',
  plane: '평면',
};

let objectCounter = 0;

function makeObject(shape: PrimitiveShape): ObjectNodeSchema {
  objectCounter += 1;
  return {
    id: MathUtils.generateUUID(),
    name: `${SHAPE_NAMES[shape]} ${objectCounter}`,
    assetId: null,
    primitiveShape: shape,
    material: { color: '#a78bfa', roughness: 0.5, metalness: 0.1 },
    parentId: null,
    layer: 'default',
    position: { x: 0, y: 0.5, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    visible: true,
    locked: false,
    physics: { ...DEFAULT_PHYSICS },
    events: [],
  };
}

export const useSceneStore = create<SceneState & SceneActions>((set, get) => ({
  projectId: null,
  sceneId: null,
  objects: [],
  assets: [],
  environment: DEFAULT_ENVIRONMENT,
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
  wireframeMode: false,
  past: [],
  future: [],
  cameraBookmarks: {},
  bookmarkSaveRequest: null,
  bookmarkRecallRequest: null,
  copiedProperties: null,
  _prevSnapshot: null,

  loadScene: (data) => {
    objectCounter = 0;
    set({
      projectId: data.projectId,
      sceneId: data.sceneId,
      objects: data.objects,
      assets: data.assets ?? [],
      environment: data.environment,
      selectedId: null,
      selectedIds: [],
      isModified: false,
      past: [],
      future: [],
      _prevSnapshot: null,
    });
  },

  selectObject: (id) => set({ selectedId: id, selectedIds: id ? [id] : [] }),
  selectObjects: (ids) => set({ selectedIds: ids, selectedId: ids[ids.length - 1] ?? null }),

  toggleSelectObject: (id) => set((s) => {
    const already = s.selectedIds.includes(id);
    const selectedIds = already
      ? s.selectedIds.filter((x) => x !== id)
      : [...s.selectedIds, id];
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
      isModified: true,
      past: [...past.slice(-49), { objects, environment }],
      future: [],
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
      set({ objects: [...objects, newGroup, ...fixedDescendants], selectedId: newGroupId, selectedIds: [newGroupId], isModified: true, past: [...past.slice(-49), { objects, environment }], future: [] });
    } else {
      // 그룹 내부 오브젝트는 같은 부모 아래에 제자리 복제
      const copy: ObjectNodeSchema = { ...src, id: MathUtils.generateUUID(), name: `${src.name} 복사`, parentId: src.parentId };
      set({ objects: [...objects, copy], selectedId: copy.id, selectedIds: [copy.id], isModified: true, past: [...past.slice(-49), { objects, environment }], future: [] });
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
    const obj: ObjectNodeSchema = {
      id: MathUtils.generateUUID(),
      name: type === 'text' ? `텍스트 ${objectCounter}` : type === 'image' ? `이미지 ${objectCounter}` : `동영상 ${objectCounter}`,
      assetId: null,
      primitiveShape: 'plane',
      material: {},
      parentId: null,
      layer: 'default',
      position: { x: 0, y: 0.5, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: type === 'video' ? { x: 16 / 9, y: 1, z: 1 } : { x: 2, y: 1, z: 1 },
      visible: true,
      locked: false,
      physics: { ...DEFAULT_PHYSICS },
      events: [],
      content: { type, ...defaults[type] },
    };
    const { objects, environment, past } = get();
    set({
      objects: [...objects, obj],
      selectedId: obj.id,
      selectedIds: [obj.id],
      isModified: true,
      past: [...past.slice(-49), { objects, environment }],
      future: [],
    });
  },

  addParticleObject: (preset) => {
    objectCounter += 1;
    const PRESET_NAMES: Record<string, string> = { fire: '불꽃', dust: '먼지', light: '빛 파티클', snow: '눈' };
    const obj: ObjectNodeSchema = {
      id: MathUtils.generateUUID(),
      name: `${PRESET_NAMES[preset] ?? '파티클'} ${objectCounter}`,
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
      particle: { preset },
    };
    const { objects, environment, past } = get();
    set({
      objects: [...objects, obj],
      selectedId: obj.id,
      selectedIds: [obj.id],
      isModified: true,
      past: [...past.slice(-49), { objects, environment }],
      future: [],
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

  addAssetObject: (asset) => {
    objectCounter += 1;
    const obj: ObjectNodeSchema = {
      id: MathUtils.generateUUID(),
      name: asset.name,
      assetId: asset.id,
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
    };
    const { objects, environment, past } = get();
    set({
      objects: [...objects, obj],
      selectedId: obj.id,
      isModified: true,
      past: [...past.slice(-49), { objects, environment }],
      future: [],
    });
  },

  updateObject: (id, patch) => {
    const { objects, environment, _prevSnapshot } = get();
    set({
      _prevSnapshot: _prevSnapshot ?? { objects, environment },
      objects: objects.map((o) => (o.id === id ? { ...o, ...patch } : o)),
      isModified: true,
    });
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
      past: [...past.slice(-49), { objects, environment }],
      future: [],
    });
  },

  alignSelected: (axis, mode) => {
    const { selectedIds, objects, environment, past } = get();
    const targets = objects.filter((o) => selectedIds.includes(o.id));
    if (targets.length < 2) return;
    const values = targets.map((o) => o.position[axis]);
    const target = mode === 'min' ? Math.min(...values) : mode === 'max' ? Math.max(...values) : values.reduce((a, b) => a + b, 0) / values.length;
    set({
      objects: objects.map((o) => selectedIds.includes(o.id)
        ? { ...o, position: { ...o.position, [axis]: target } }
        : o
      ),
      isModified: true,
      past: [...past.slice(-49), { objects, environment }],
      future: [],
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
        past: [...past.slice(-49), { objects, environment }],
        future: [],
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
        past: [...past.slice(-49), { objects, environment }],
        future: [],
      });
    }
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
    const groupId = MathUtils.generateUUID();
    const groupObj: ObjectNodeSchema = {
      id: groupId,
      name: `그룹 ${objectCounter}`,
      assetId: null,
      primitiveShape: undefined,
      material: {},
      parentId: null,
      layer: 'default',
      position: { x: cx, y: cy, z: cz },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      visible: true,
      locked: false,
      physics: { ...DEFAULT_PHYSICS },
      events: [],
      isGroup: true,
    };

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
      past: [...past.slice(-49), { objects, environment }],
      future: [],
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
      past: [...past.slice(-49), { objects, environment }],
      future: [],
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
    set({ past: [...past.slice(-49), snapshot], future: [], _prevSnapshot: null });
  },

  undo: () => {
    const { past, objects, environment, future } = get();
    if (past.length === 0) return;
    const prev = past[past.length - 1];
    set({
      objects: prev.objects,
      environment: prev.environment,
      past: past.slice(0, -1),
      future: [{ objects, environment }, ...future],
      isModified: true,
      _prevSnapshot: null,
    });
  },

  redo: () => {
    const { past, objects, environment, future } = get();
    if (future.length === 0) return;
    const next = future[0];
    set({
      objects: next.objects,
      environment: next.environment,
      past: [...past, { objects, environment }],
      future: future.slice(1),
      isModified: true,
      _prevSnapshot: null,
    });
  },

  markSaved: () => set({ isModified: false }),
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
      past: [...past.slice(-49), { objects, environment }],
      future: [],
    });
  },

  batchUpdateObjects: (ids, patch) => {
    const { objects, environment, past } = get();
    set({
      objects: objects.map((o) => ids.includes(o.id) ? { ...o, ...patch(o) } : o),
      isModified: true,
      past: [...past.slice(-49), { objects, environment }],
      future: [],
    });
  },

  addLightObject: (type) => {
    objectCounter += 1;
    const LIGHT_NAMES: Record<LightType, string> = { point: '포인트 라이트', spot: '스팟 라이트', directional: '방향 라이트' };
    const obj: ObjectNodeSchema = {
      id: MathUtils.generateUUID(),
      name: `${LIGHT_NAMES[type]} ${objectCounter}`,
      assetId: null,
      primitiveShape: undefined,
      material: {},
      parentId: null,
      layer: 'default',
      position: { x: 0, y: 3, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      visible: true,
      locked: false,
      physics: { ...DEFAULT_PHYSICS },
      events: [],
      light: { type, color: '#ffffff', intensity: 1, distance: 20, decay: 2, castShadow: false },
    };
    const { objects, environment, past } = get();
    set({
      objects: [...objects, obj],
      selectedId: obj.id,
      selectedIds: [obj.id],
      isModified: true,
      past: [...past.slice(-49), { objects, environment }],
      future: [],
    });
  },
}));
