import * as Y from 'yjs';
import { useSceneStore } from '@/store/sceneStore';
import { useLiveTransformStore } from '@/store/liveTransformStore';
import type { ObjectNodeSchema } from '@/types/scene';
import {
  LOCAL_ORIGIN, META_KEYS, type MetaKey, type SceneDocFields,
  getObjectsMap, getOrder, getMeta, seedDoc, readDoc, isDocEmpty, clone,
} from './yjsSceneDoc';

export interface BindingControl {
  detach: () => void;
  /** 현재 스토어로 문서를 seed(첫 참가자) */
  seedFromStore: () => void;
  /** 로컬→문서 동기화 시작(핸드셰이크 완료 후 호출). 호출 전에는 스토어 변경을 문서에 안 쓴다. */
  start: () => void;
  isDocEmpty: () => boolean;
}

/**
 * 스토어 ↔ Yjs 문서 양방향 바인딩(M2/M3).
 *
 *  - 로컬 편집(스토어 변경) → 문서에 diff 반영(objects는 참조 비교로 변경분만, order/meta도 변경 시만).
 *    LOCAL_ORIGIN 트랜잭션으로 기록. **start() 이후에만** 동작(핸드셰이크 전 조기 쓰기 방지).
 *  - 원격 편집(문서 변경, origin≠LOCAL) → 스토어에 반영(관찰자 즉시 활성). applyingRemote 가드로 에코 차단.
 *
 * 스토어는 불변 업데이트라 '바뀐 오브젝트만 새 참조' → 참조 비교로 값싸게 diff 가능.
 * 비협업(바인딩 미부착) 시 스토어는 지금과 100% 동일하게 동작.
 */
export function attachBinding(doc: Y.Doc): BindingControl {
  const objs = getObjectsMap(doc);
  const order = getOrder(doc);
  const meta = getMeta(doc);

  let applyingRemote = false;
  let started = false;
  // 마지막으로 문서에 반영한 오브젝트 참조(참조 비교용)
  const lastObjRef = new Map<string, ObjectNodeSchema>();
  const lastMetaRef = new Map<MetaKey, unknown>();

  const pick = (): SceneDocFields => {
    const s = useSceneStore.getState();
    return {
      objects: s.objects, environment: s.environment, assets: s.assets,
      prefabs: s.prefabs, materialAssets: s.materialAssets, colorAssets: s.colorAssets,
      variables: s.variables, hudElements: s.hudElements, sceneEvents: s.sceneEvents,
      animClips: s.animClips,
    };
  };

  const rememberRefs = () => {
    const f = pick();
    lastObjRef.clear();
    for (const o of f.objects) lastObjRef.set(o.id, o);
    for (const k of META_KEYS) lastMetaRef.set(k, f[k]);
  };

  // ── seed / start (핸드셰이크는 호출부[useCollab]가 조율) ──────
  function seedFromStore() {
    doc.transact(() => seedDoc(doc, pick()), LOCAL_ORIGIN);
    rememberRefs();
  }
  function start() {
    if (started) return;
    started = true;
    rememberRefs(); // 현재 스토어를 기준선으로(문서와 이미 일치 상태에서 시작)
  }

  // ── 로컬 → 문서 ─────────────────────────────────────────────
  function syncStoreToDoc() {
    if (!started || applyingRemote) return;
    const f = pick();
    doc.transact(() => {
      // objects: 참조가 바뀐 것만 set, 사라진 키는 delete
      const curIds = new Set<string>();
      for (const o of f.objects) {
        curIds.add(o.id);
        if (lastObjRef.get(o.id) !== o) objs.set(o.id, clone(o));
      }
      for (const id of Array.from(objs.keys())) {
        if (!curIds.has(id)) objs.delete(id);
      }
      // order: 달라졌을 때만 교체
      const curOrder = f.objects.map((o) => o.id);
      if (!arrEq(order.toArray(), curOrder)) {
        if (order.length) order.delete(0, order.length);
        order.insert(0, curOrder);
      }
      // meta: 참조 바뀐 키만 set
      for (const k of META_KEYS) {
        if (lastMetaRef.get(k) !== f[k]) meta.set(k, clone(f[k]));
      }
    }, LOCAL_ORIGIN);
    rememberRefs();
  }

  // ── 문서 → 로컬 ─────────────────────────────────────────────
  function applyRemote() {
    applyingRemote = true;
    try {
      const fields = readDoc(doc);
      useSceneStore.setState(fields as Partial<ReturnType<typeof useSceneStore.getState>>);
      rememberRefs(); // setState가 새 참조를 만들었으니 갱신(에코 방지)
    } finally {
      applyingRemote = false;
    }
  }

  // 원격 변경 관찰 — 한 트랜잭션이 여러 관찰자를 깨우므로 microtask로 1회 coalesce.
  // 내가 드래그(기즈모/핸들) 중이면 반영을 잠시 미룬다 — 원격 objects 교체가 내 조작을 튕기지 않게(하드닝).
  let scheduled = false;
  const flushRemote = () => {
    if (useLiveTransformStore.getState().dragging) {
      setTimeout(flushRemote, 150);
      return;
    }
    applyRemote();
  };
  const onRemote = (_events: unknown, tr: Y.Transaction) => {
    if (tr.origin === LOCAL_ORIGIN) return; // 내 변경은 무시
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      flushRemote();
    });
  };

  objs.observe(onRemote);
  order.observe(onRemote);
  meta.observe(onRemote);
  const unsubStore = useSceneStore.subscribe(syncStoreToDoc);

  return {
    detach: () => {
      unsubStore();
      objs.unobserve(onRemote);
      order.unobserve(onRemote);
      meta.unobserve(onRemote);
    },
    seedFromStore,
    start,
    isDocEmpty: () => isDocEmpty(doc),
  };
}

function arrEq(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
