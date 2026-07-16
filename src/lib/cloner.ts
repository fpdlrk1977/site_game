// 클로너(비파괴 배열) 순수 로직.
// 클로너 그룹 = 소스 오브젝트 1개(직속 자식, clonerClone 없음) + 자동 생성 복제본들(clonerClone=true).
// 파라미터가 바뀌면 복제본을 전부 지우고 다시 만든다(소스는 유지·재배치).
import { MathUtils } from 'three';
import type { ObjectNodeSchema, ClonerConfig } from '@/types/scene';

export const DEFAULT_CLONER: ClonerConfig = { mode: 'linear', count: 5, offset: { x: 2, y: 0, z: 0 } };

// 총 인스턴스 수(원본 포함). grid는 열×행.
export function clonerCount(cfg: ClonerConfig): number {
  if (cfg.mode === 'grid') return Math.max(1, Math.round(cfg.cols ?? 1)) * Math.max(1, Math.round(cfg.rows ?? 1));
  return Math.max(1, Math.round(cfg.count));
}

// i번째 복제의 Y축 회전 증분(도). rotStep×i.
export function clonerRotYDeg(cfg: ClonerConfig, i: number): number {
  return (cfg.rotStep ?? 0) * i;
}

// i번째 인스턴스의 클로너 그룹 로컬 위치. (i=0=소스)
export function clonerPlacement(cfg: ClonerConfig, i: number): { x: number; y: number; z: number } {
  if (cfg.mode === 'radial') {
    const r = cfg.radius ?? 3;
    const t = (2 * Math.PI / Math.max(1, cfg.count)) * i;
    const c = Math.cos(t) * r, s = Math.sin(t) * r;
    const ax = cfg.axis ?? 'y';
    if (ax === 'x') return { x: 0, y: c, z: s };
    if (ax === 'z') return { x: c, y: s, z: 0 };
    return { x: c, y: 0, z: s }; // y: XZ 평면(바닥)
  }
  if (cfg.mode === 'grid') {
    const cols = Math.max(1, Math.round(cfg.cols ?? 1));
    const col = i % cols, row = Math.floor(i / cols);
    return { x: cfg.offset.x * col, y: 0, z: cfg.offset.z * row }; // 바닥(XZ) 격자
  }
  return { x: cfg.offset.x * i, y: cfg.offset.y * i, z: cfg.offset.z * i };
}

function subtreeOf(objects: ObjectNodeSchema[], rootId: string): ObjectNodeSchema[] {
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

// 클로너 그룹의 복제본을 config에 맞게 재생성한 새 objects 배열을 반환.
export function regenerateCloner(
  objects: ObjectNodeSchema[],
  clonerGroupId: string,
  cfg: ClonerConfig,
): ObjectNodeSchema[] {
  const group = objects.find((o) => o.id === clonerGroupId);
  if (!group) return objects;
  const directChildren = objects.filter((o) => o.parentId === clonerGroupId);
  const source = directChildren.find((o) => !o.clonerClone);
  if (!source) return objects;

  // 기존 복제본(+자손) 제거
  const cloneRoots = directChildren.filter((o) => o.clonerClone);
  const toRemove = new Set<string>();
  const collectDesc = (id: string) => {
    toRemove.add(id);
    for (const c of objects.filter((o) => o.parentId === id)) collectDesc(c.id);
  };
  cloneRoots.forEach((c) => collectDesc(c.id));
  let next = objects.filter((o) => !toRemove.has(o.id));

  // 소스를 placement(0)로 재배치
  const p0 = clonerPlacement(cfg, 0);
  next = next.map((o) => (o.id === source.id ? { ...o, position: { x: p0.x, y: p0.y, z: p0.z } } : o));

  // 복제본 생성 (i=1..count-1) — 소스 서브트리를 재귀 복제
  const subtree = subtreeOf(next, source.id);
  const descendants = subtree.filter((o) => o.id !== source.id);
  const count = Math.max(2, Math.min(400, clonerCount(cfg)));
  const additions: ObjectNodeSchema[] = [];
  for (let i = 1; i < count; i++) {
    const pi = clonerPlacement(cfg, i);
    const idMap = new Map<string, string>();
    const rootNewId = MathUtils.generateUUID();
    idMap.set(source.id, rootNewId);
    for (const d of descendants) idMap.set(d.id, MathUtils.generateUUID());
    const rotY = clonerRotYDeg(cfg, i);
    additions.push({ ...source, id: rootNewId, parentId: clonerGroupId, clonerClone: true, position: { x: pi.x, y: pi.y, z: pi.z }, rotation: rotY ? { ...source.rotation, y: source.rotation.y + rotY } : source.rotation, name: `${source.name} ${i}` });
    for (const d of descendants) {
      additions.push({ ...d, id: idMap.get(d.id)!, parentId: idMap.get(d.parentId!) ?? d.parentId, clonerClone: true });
    }
  }
  return [...next, ...additions];
}
