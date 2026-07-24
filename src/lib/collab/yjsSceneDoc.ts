import * as Y from 'yjs';
import type {
  ObjectNodeSchema, AssetRefSchema, EnvSchema, PrefabSchema,
  MaterialAsset, ColorAsset, GameVariable, HudElement, EventSchema, AnimClip,
} from '@/types/scene';

/**
 * Yjs 씬 문서 모델 — 협업 co-edit의 CRDT 소스.
 *
 * 구조(Y.Doc):
 *  - 'objects' (Y.Map<id, objJSON>) : 오브젝트 단위 머지. 서로 다른 오브젝트 동시편집 = 충돌 없음.
 *                                     같은 오브젝트 동시편집 = 오브젝트 단위 last-writer(허용).
 *  - 'order'   (Y.Array<id>)        : 오브젝트 배열 순서(계층 트리 순서 보존).
 *  - 'meta'    (Y.Map<key, valJSON>): environment/assets/prefabs/... 를 통값(JSON)으로. 배열 단위 LWW.
 *
 * 로컬 변경은 origin=LOCAL_ORIGIN 트랜잭션으로 기록 → observer가 자기 변경을 걸러낸다(에코 방지).
 */
export const LOCAL_ORIGIN = Symbol('collab-local');

/** 문서로 동기화하는 스토어 필드(로컬 UI 상태는 제외) */
export interface SceneDocFields {
  objects: ObjectNodeSchema[];
  environment: EnvSchema;
  assets: AssetRefSchema[];
  prefabs: PrefabSchema[];
  materialAssets: MaterialAsset[];
  colorAssets: ColorAsset[];
  variables: GameVariable[];
  hudElements: HudElement[];
  sceneEvents: EventSchema[];
  animClips: AnimClip[];
}

/** objects 외 통값 저장하는 meta 키(전부 배열/객체) */
export const META_KEYS = [
  'environment', 'assets', 'prefabs', 'materialAssets',
  'colorAssets', 'variables', 'hudElements', 'sceneEvents', 'animClips',
] as const;
export type MetaKey = (typeof META_KEYS)[number];

export const getObjectsMap = (doc: Y.Doc) => doc.getMap<ObjectNodeSchema>('objects');
export const getOrder = (doc: Y.Doc) => doc.getArray<string>('order');
export const getMeta = (doc: Y.Doc) => doc.getMap<unknown>('meta');

/** JSON 안전 딥클론(씬 데이터는 전부 직렬화 가능) */
export function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v ?? null)) as T;
}

/** 문서가 비어 있는지(초기 seed 판단용) */
export function isDocEmpty(doc: Y.Doc): boolean {
  return getObjectsMap(doc).size === 0 && getOrder(doc).length === 0 && getMeta(doc).size === 0;
}

/** 스토어 필드 → 문서(초기 seed). LOCAL_ORIGIN 트랜잭션으로 감싸 호출할 것. */
export function seedDoc(doc: Y.Doc, f: SceneDocFields) {
  const objs = getObjectsMap(doc);
  const order = getOrder(doc);
  const meta = getMeta(doc);
  objs.clear();
  for (const o of f.objects) objs.set(o.id, clone(o));
  if (order.length) order.delete(0, order.length);
  order.insert(0, f.objects.map((o) => o.id));
  for (const k of META_KEYS) meta.set(k, clone(f[k]));
}

/** 문서 → 스토어 필드(원격 반영/초기 로드) */
export function readDoc(doc: Y.Doc): Partial<SceneDocFields> {
  const objs = getObjectsMap(doc);
  const order = getOrder(doc);
  const meta = getMeta(doc);

  const ids = order.length ? order.toArray() : Array.from(objs.keys());
  const objects: ObjectNodeSchema[] = [];
  for (const id of ids) {
    const o = objs.get(id);
    if (o) objects.push(o as ObjectNodeSchema);
  }

  const out: Partial<SceneDocFields> = { objects };
  for (const k of META_KEYS) {
    if (meta.has(k)) (out as Record<string, unknown>)[k] = meta.get(k);
  }
  return out;
}
