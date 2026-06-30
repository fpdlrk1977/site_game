import { create } from 'zustand';
import { MathUtils } from 'three';
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
} from '@/types/scene';

interface HistoryEntry {
  objects: ObjectNodeSchema[];
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
  isModified: boolean;
  wireframeMode: boolean;
  past: HistoryEntry[];
  future: HistoryEntry[];
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
  updateObject: (id: string, patch: Partial<ObjectNodeSchema>) => void;
  duplicateSelected: () => void;
  updateEnvironment: (patch: Partial<EnvSchema>) => void;
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;
  markSaved: () => void;
  toggleWireframe: () => void;
  addLayer: (name: string) => void;
  toggleLayerVisible: (name: string) => void;
  toggleLayerLocked: (name: string) => void;
  setObjectLayer: (id: string, layer: string) => void;
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
  isModified: false,
  wireframeMode: false,
  past: [],
  future: [],

  loadScene: (data) =>
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
    }),

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
    const { objects, past } = get();
    set({
      objects: [...objects, obj],
      selectedId: obj.id,
      isModified: true,
      past: [...past.slice(-49), { objects }],
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
    const obj = objects.find((o) => o.id === selectedId);
    if (!obj) return;
    set({ focusTarget: { ...obj.position, _tick: Date.now() } });
  },

  addContentObject: (type) => {
    objectCounter += 1;
    const defaults = {
      text: { text: '텍스트를 입력하세요', fontSize: 0.5, color: '#ffffff' },
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
      position: { x: 0, y: 1, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 2, y: 1, z: 1 },
      visible: true,
      locked: false,
      physics: { ...DEFAULT_PHYSICS },
      events: [],
      content: { type, ...defaults[type] },
    };
    const { objects, past } = get();
    set({
      objects: [...objects, obj],
      selectedId: obj.id,
      selectedIds: [obj.id],
      isModified: true,
      past: [...past.slice(-49), { objects }],
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
    const { objects, past } = get();
    set({
      objects: [...objects, obj],
      selectedId: obj.id,
      selectedIds: [obj.id],
      isModified: true,
      past: [...past.slice(-49), { objects }],
      future: [],
    });
  },

  addAsset: (asset) => {
    const { assets } = get();
    if (assets.find((a) => a.id === asset.id)) return;
    set({ assets: [...assets, asset] });
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
    const { objects, past } = get();
    set({
      objects: [...objects, obj],
      selectedId: obj.id,
      isModified: true,
      past: [...past.slice(-49), { objects }],
      future: [],
    });
  },

  updateObject: (id, patch) => {
    const { objects } = get();
    set({
      objects: objects.map((o) => (o.id === id ? { ...o, ...patch } : o)),
      isModified: true,
    });
  },

  deleteSelected: () => {
    const { selectedId, selectedIds, objects, past } = get();
    const toDelete = selectedIds.length > 0 ? selectedIds : (selectedId ? [selectedId] : []);
    if (toDelete.length === 0) return;
    set({
      objects: objects.filter((o) => !toDelete.includes(o.id)),
      selectedId: null,
      selectedIds: [],
      isModified: true,
      past: [...past.slice(-49), { objects }],
      future: [],
    });
  },

  alignSelected: (axis, mode) => {
    const { selectedIds, objects, past } = get();
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
      past: [...past.slice(-49), { objects }],
      future: [],
    });
  },

  duplicateSelected: () => {
    const { selectedId, objects, past } = get();
    if (!selectedId) return;
    const src = objects.find((o) => o.id === selectedId);
    if (!src) return;
    objectCounter += 1;
    const copy: ObjectNodeSchema = {
      ...src,
      id: MathUtils.generateUUID(),
      name: `${src.name} 복사`,
      position: { ...src.position, x: src.position.x + 1 },
    };
    set({
      objects: [...objects, copy],
      selectedId: copy.id,
      isModified: true,
      past: [...past.slice(-49), { objects }],
      future: [],
    });
  },

  updateEnvironment: (patch) => {
    const { environment } = get();
    set({ environment: { ...environment, ...patch }, isModified: true });
  },

  pushHistory: () => {
    const { objects, past } = get();
    set({ past: [...past.slice(-49), { objects }], future: [] });
  },

  undo: () => {
    const { past, objects, future } = get();
    if (past.length === 0) return;
    const prev = past[past.length - 1];
    set({
      objects: prev.objects,
      past: past.slice(0, -1),
      future: [{ objects }, ...future],
      isModified: true,
    });
  },

  redo: () => {
    const { past, objects, future } = get();
    if (future.length === 0) return;
    const next = future[0];
    set({
      objects: next.objects,
      past: [...past, { objects }],
      future: future.slice(1),
      isModified: true,
    });
  },

  markSaved: () => set({ isModified: false }),
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
}));
