// 프리팹(원본 정의 ↔ 인스턴스) 순수 로직.
// 인스턴스는 scene_data.objects에 '구운(bake)' 실제 오브젝트로 존재하고, 프리팹 태그만 붙는다.
// → 뷰어/임베드/물리 코드는 무변경(평범한 오브젝트로 렌더). 동기화·override는 전부 에디터 전용.
import { MathUtils } from 'three';
import type {
  ObjectNodeSchema,
  PrefabSchema,
  PrefabNode,
  PrefabNodeData,
  PrefabOverrideGroup,
  Vector3,
} from '@/types/scene';

// 오브젝트 필드 → override 그룹. 인스턴스 노드에서 이 필드를 편집하면 그 그룹은 원본을 안 따른다.
const FIELD_GROUP: Record<string, PrefabOverrideGroup> = {
  position: 'transform',
  rotation: 'transform',
  scale: 'transform',
  material: 'material',
  events: 'events',
  motion: 'motion',
  defaultClip: 'motion',
  physics: 'physics',
  content: 'content',
  light: 'light',
  particle: 'particle',
  name: 'name',
  visible: 'visibility',
  dialogue: 'dialogue',
  interactLabel: 'dialogue',
};

function cloneVal<T>(v: T): T {
  return v == null ? v : (JSON.parse(JSON.stringify(v)) as T);
}

// 오브젝트에서 프리팹 노드 data 추출 — 절대참조(id/parentId)·프리팹 태그 제거.
function stripToData(o: ObjectNodeSchema): PrefabNodeData {
  const {
    id: _id,
    parentId: _parentId,
    prefabId: _pid,
    prefabInstanceId: _iid,
    prefabNodeKey: _nk,
    prefabOverrides: _ov,
    ...rest
  } = o;
  void _id; void _parentId; void _pid; void _iid; void _nk; void _ov;
  return cloneVal(rest);
}

// 한 오브젝트 서브트리(root + 자손)를 objects에서 수집(부모→자식 순서 보존).
function collectSubtree(objects: ObjectNodeSchema[], rootId: string): ObjectNodeSchema[] {
  const out: ObjectNodeSchema[] = [];
  const walk = (id: string) => {
    const o = objects.find((x) => x.id === id);
    if (!o) return;
    out.push(o);
    for (const c of objects.filter((x) => x.parentId === id)) walk(c.id);
  };
  walk(rootId);
  return out;
}

// patch로 바뀐 필드들이 속한 override 그룹 목록. isRoot면 transform은 인스턴스 소유라 제외.
export function overrideGroupsFromPatch(
  patchKeys: string[],
  isRoot: boolean,
): PrefabOverrideGroup[] {
  const groups = new Set<PrefabOverrideGroup>();
  for (const k of patchKeys) {
    const g = FIELD_GROUP[k];
    if (!g) continue;
    if (isRoot && g === 'transform') continue;
    groups.add(g);
  }
  return [...groups];
}

// 선택한 루트(+자손)로부터 프리팹 정의를 만들고, 원본 오브젝트에 붙일 태그된 노드 목록을 함께 반환.
export function buildPrefab(
  objects: ObjectNodeSchema[],
  rootId: string,
  name: string,
): { prefab: PrefabSchema; tagged: ObjectNodeSchema[]; instanceId: string } {
  const subtree = collectSubtree(objects, rootId);
  const idToKey = new Map<string, string>();
  for (const o of subtree) idToKey.set(o.id, MathUtils.generateUUID());
  const rootKey = idToKey.get(rootId)!;

  const nodes: PrefabNode[] = subtree.map((o) => ({
    nodeKey: idToKey.get(o.id)!,
    parentKey: o.parentId && idToKey.has(o.parentId) ? idToKey.get(o.parentId)! : null,
    data: stripToData(o),
  }));

  const prefabId = MathUtils.generateUUID();
  const instanceId = MathUtils.generateUUID();
  const prefab: PrefabSchema = { id: prefabId, name, rootKey, nodes };

  const tagged: ObjectNodeSchema[] = subtree.map((o) => ({
    ...o,
    prefabId,
    prefabInstanceId: instanceId,
    prefabNodeKey: idToKey.get(o.id)!,
    prefabOverrides: [],
  }));

  return { prefab, tagged, instanceId };
}

// 프리팹 정의를 실제 오브젝트 인스턴스로 펼친다(bake).
export function instantiate(
  prefab: PrefabSchema,
  opts?: { position?: Vector3; parentId?: string | null },
): { objects: ObjectNodeSchema[]; instanceId: string; rootId: string } {
  const instanceId = MathUtils.generateUUID();
  const keyToId = new Map<string, string>();
  for (const n of prefab.nodes) keyToId.set(n.nodeKey, MathUtils.generateUUID());
  const rootId = keyToId.get(prefab.rootKey)!;

  const objects: ObjectNodeSchema[] = prefab.nodes.map((n) => {
    const isRoot = n.nodeKey === prefab.rootKey;
    const data = cloneVal(n.data);
    const obj: ObjectNodeSchema = {
      ...data,
      id: keyToId.get(n.nodeKey)!,
      parentId: n.parentKey ? keyToId.get(n.parentKey)! : (opts?.parentId ?? null),
      prefabId: prefab.id,
      prefabInstanceId: instanceId,
      prefabNodeKey: n.nodeKey,
      prefabOverrides: [],
    };
    if (isRoot && opts?.position) obj.position = { ...opts.position };
    return obj;
  });

  return { objects, instanceId, rootId };
}

// def data를 인스턴스 노드에 병합 — override된 그룹과 (루트의) transform은 건드리지 않는다.
export function mergeDefIntoNode(
  node: ObjectNodeSchema,
  def: PrefabNodeData,
  isRoot: boolean,
): ObjectNodeSchema {
  const skip = new Set(node.prefabOverrides ?? []);
  // 인스턴스 소유(id/parentId/layer/locked/프리팹 태그)와 현재 transform은 out에 그대로 유지.
  const out: ObjectNodeSchema = { ...node };

  // 정체성/구조 — 항상 def 따름
  out.assetId = def.assetId;
  out.primitiveShape = def.primitiveShape;
  out.isGroup = def.isGroup;
  out.interactRange = def.interactRange;

  if (!skip.has('name')) out.name = def.name;
  if (!skip.has('visibility')) out.visible = def.visible;
  if (!skip.has('material')) out.material = cloneVal(def.material);
  if (!skip.has('events')) out.events = cloneVal(def.events) ?? [];
  if (!skip.has('motion')) {
    out.motion = cloneVal(def.motion);
    out.defaultClip = def.defaultClip;
  }
  if (!skip.has('physics')) out.physics = cloneVal(def.physics);
  if (!skip.has('content')) out.content = cloneVal(def.content);
  if (!skip.has('light')) out.light = cloneVal(def.light);
  if (!skip.has('particle')) out.particle = cloneVal(def.particle);
  if (!skip.has('dialogue')) {
    out.dialogue = cloneVal(def.dialogue);
    out.interactLabel = def.interactLabel;
  }
  // 자식 노드 transform은 override 안 됐으면 def 따름. 루트 transform은 항상 인스턴스 소유.
  if (!isRoot && !skip.has('transform')) {
    out.position = cloneVal(def.position);
    out.rotation = cloneVal(def.rotation);
    out.scale = cloneVal(def.scale);
  }
  return out;
}

// 특정 프리팹의 모든 인스턴스를 def에 맞춰 재동기화(구조 추가/삭제 포함, override 존중).
export function syncInstances(
  objects: ObjectNodeSchema[],
  prefab: PrefabSchema,
): ObjectNodeSchema[] {
  const defByKey = new Map(prefab.nodes.map((n) => [n.nodeKey, n]));

  // 인스턴스별 노드 그룹핑
  const instances = new Map<string, ObjectNodeSchema[]>();
  for (const o of objects) {
    if (o.prefabId !== prefab.id || !o.prefabInstanceId) continue;
    const arr = instances.get(o.prefabInstanceId) ?? [];
    arr.push(o);
    instances.set(o.prefabInstanceId, arr);
  }

  // 인스턴스별 keyToId(기존 노드는 id 재사용, def에 새로 생긴 노드는 새 id) + 기존 키 집합
  const plan = new Map<string, { keyToId: Map<string, string>; existing: Set<string>; rootParentId: string | null }>();
  for (const [iid, nodes] of instances) {
    const existing = new Set(nodes.map((n) => n.prefabNodeKey!).filter(Boolean));
    const keyToId = new Map<string, string>();
    const byKey = new Map(nodes.map((n) => [n.prefabNodeKey, n]));
    for (const n of prefab.nodes) {
      const cur = byKey.get(n.nodeKey);
      keyToId.set(n.nodeKey, cur ? cur.id : MathUtils.generateUUID());
    }
    const rootNode = byKey.get(prefab.rootKey);
    plan.set(iid, { keyToId, existing, rootParentId: rootNode?.parentId ?? null });
  }

  const result: ObjectNodeSchema[] = [];
  for (const o of objects) {
    if (o.prefabId !== prefab.id) {
      result.push(o);
      continue;
    }
    const key = o.prefabNodeKey;
    if (!key || !defByKey.has(key)) continue; // def에서 삭제된 노드 → 인스턴스에서도 제거
    const defNode = defByKey.get(key)!;
    const iid = o.prefabInstanceId!;
    const p = plan.get(iid)!;
    const isRoot = key === prefab.rootKey;
    const merged = mergeDefIntoNode(o, defNode.data, isRoot);
    if (!isRoot) merged.parentId = defNode.parentKey ? (p.keyToId.get(defNode.parentKey) ?? o.parentId) : o.parentId;
    result.push(merged);
  }

  // def에 새로 생긴 노드를 각 인스턴스에 추가
  for (const [iid, p] of plan) {
    for (const n of prefab.nodes) {
      if (p.existing.has(n.nodeKey)) continue;
      const isRoot = n.nodeKey === prefab.rootKey;
      const data = cloneVal(n.data);
      result.push({
        ...data,
        id: p.keyToId.get(n.nodeKey)!,
        parentId: n.parentKey ? (p.keyToId.get(n.parentKey) ?? null) : p.rootParentId,
        prefabId: prefab.id,
        prefabInstanceId: iid,
        prefabNodeKey: n.nodeKey,
        prefabOverrides: [],
      });
      void isRoot;
    }
  }

  return result;
}

// 한 인스턴스의 현재 상태로 프리팹 def를 재구성(Apply). 루트 transform은 def의 기존 값을 보존(배치는 인스턴스별이므로).
export function rebuildPrefabFromInstance(
  objects: ObjectNodeSchema[],
  prefab: PrefabSchema,
  instanceRootId: string,
): PrefabSchema {
  const root = objects.find((o) => o.id === instanceRootId);
  if (!root || !root.prefabInstanceId) return prefab;
  const iid = root.prefabInstanceId;
  const nodes = objects.filter((o) => o.prefabInstanceId === iid);

  const idToKey = new Map<string, string>();
  for (const o of nodes) idToKey.set(o.id, o.prefabNodeKey ?? MathUtils.generateUUID());
  const rootKey = idToKey.get(instanceRootId)!;

  const oldRootData = prefab.nodes.find((n) => n.nodeKey === prefab.rootKey)?.data;

  const newNodes: PrefabNode[] = nodes.map((o) => {
    const data = stripToData(o);
    // 루트는 배치 transform을 def에 밀어넣지 않는다(기존 def 값 유지).
    if (o.id === instanceRootId && oldRootData) {
      data.position = cloneVal(oldRootData.position);
      data.rotation = cloneVal(oldRootData.rotation);
      data.scale = cloneVal(oldRootData.scale);
    }
    return {
      nodeKey: idToKey.get(o.id)!,
      parentKey: o.parentId && idToKey.has(o.parentId) ? idToKey.get(o.parentId)! : null,
      data,
    };
  });

  return { ...prefab, rootKey, nodes: newNodes };
}
