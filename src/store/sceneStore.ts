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
} from '@/types/scene';

interface HistoryEntry {
  objects: ObjectNodeSchema[];
}

interface SceneState {
  projectId: string | null;
  sceneId: string | null;
  objects: ObjectNodeSchema[];
  assets: AssetRefSchema[];
  environment: EnvSchema;
  selectedId: string | null;
  transformMode: 'translate' | 'rotate' | 'scale';
  transformSpace: 'world' | 'local';
  snapEnabled: boolean;
  snapTranslate: number;
  snapRotate: number;
  focusTarget: { x: number; y: number; z: number; _tick: number } | null;
  isModified: boolean;
  past: HistoryEntry[];
  future: HistoryEntry[];
}

interface SceneActions {
  loadScene: (data: ProjectSceneSchema) => void;
  selectObject: (id: string | null) => void;
  setTransformMode: (mode: 'translate' | 'rotate' | 'scale') => void;
  setTransformSpace: (space: 'world' | 'local') => void;
  addObject: (shape: PrimitiveShape) => void;
  addAsset: (asset: AssetRefSchema) => void;
  addAssetObject: (asset: AssetRefSchema) => void;
  setSnap: (enabled: boolean, translate?: number, rotate?: number) => void;
  requestFocus: () => void;
  updateObject: (id: string, patch: Partial<ObjectNodeSchema>) => void;
  deleteSelected: () => void;
  duplicateSelected: () => void;
  updateEnvironment: (patch: Partial<EnvSchema>) => void;
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;
  markSaved: () => void;
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
  focusTarget: null,
  isModified: false,
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
      isModified: false,
      past: [],
      future: [],
    }),

  selectObject: (id) => set({ selectedId: id }),

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
    const { selectedId, objects, past } = get();
    if (!selectedId) return;
    set({
      objects: objects.filter((o) => o.id !== selectedId),
      selectedId: null,
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
}));
