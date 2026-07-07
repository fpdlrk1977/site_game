import * as THREE from 'three';
import type { ObjectNodeSchema, AssetRefSchema } from '@/types/scene';
import { glbLocalBboxCache } from './glbBboxCache';

const DEG2RAD = Math.PI / 180;

// 오브젝트 로컬 TRS 행렬 (부모 기준)
export function localMatrix(o: ObjectNodeSchema): THREE.Matrix4 {
  const pos = new THREE.Vector3(o.position.x, o.position.y, o.position.z);
  const quat = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(o.rotation.x * DEG2RAD, o.rotation.y * DEG2RAD, o.rotation.z * DEG2RAD),
  );
  const scl = new THREE.Vector3(o.scale.x, o.scale.y, o.scale.z);
  return new THREE.Matrix4().compose(pos, quat, scl);
}

// 루트→id 체인의 로컬행렬 곱 = id의 월드 행렬(자기 TRS 포함)
export function worldMatrix(objects: ObjectNodeSchema[], id: string): THREE.Matrix4 {
  const chain: ObjectNodeSchema[] = [];
  let cur = objects.find((x) => x.id === id);
  while (cur) {
    chain.push(cur);
    const pid: string | null = cur.parentId;
    cur = pid ? objects.find((x) => x.id === pid) : undefined;
  }
  chain.reverse(); // 루트 먼저
  const m = new THREE.Matrix4();
  for (const node of chain) m.multiply(localMatrix(node));
  return m;
}

/**
 * 오브젝트의 "자기 로컬 프레임" bbox — 자기 TRS(position/rotation/scale) 적용 전.
 * - GLB: 렌더 시 캐시된 로컬 bbox(glbLocalBboxCache). 미로딩이면 단위 박스 근사.
 * - 프리미티브/콘텐츠: 중심 원점, 단위 크기.
 * - 라이트: 점(빈 bbox).
 * - 그룹: 자식들을 각 로컬 TRS로 변환해 재귀 union(그룹-로컬 프레임).
 * (회전된 자식은 AABB 근사 — 시각 경계로는 충분)
 */
export function localBBox(objects: ObjectNodeSchema[], assets: AssetRefSchema[], id: string): THREE.Box3 | null {
  const o = objects.find((x) => x.id === id);
  if (!o) return null;

  if (o.isGroup) {
    const box = new THREE.Box3().makeEmpty();
    for (const c of objects.filter((x) => x.parentId === id && x.visible)) {
      const cb = localBBox(objects, assets, c.id);
      if (!cb || cb.isEmpty()) continue;
      box.union(cb.clone().applyMatrix4(localMatrix(c)));
    }
    return box.isEmpty() ? null : box;
  }

  if (o.light) return new THREE.Box3(new THREE.Vector3(), new THREE.Vector3());

  if (o.assetId) {
    const url = assets.find((a) => a.id === o.assetId)?.dracoUrl;
    const cached = url ? glbLocalBboxCache.get(url) : undefined;
    if (cached && !cached.isEmpty()) return cached.clone();
    // 미로딩 GLB 근사(밑면 0, 높이 1)
    return new THREE.Box3(new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 1, 0.5));
  }

  // 프리미티브/콘텐츠 — 중심 원점 단위
  return new THREE.Box3(new THREE.Vector3(-0.5, -0.5, -0.5), new THREE.Vector3(0.5, 0.5, 0.5));
}

/** 오브젝트의 월드 축정렬 bbox(AABB). 정렬 등 시각 경계 기준 계산용. */
export function worldBBox(objects: ObjectNodeSchema[], assets: AssetRefSchema[], id: string): THREE.Box3 | null {
  const lb = localBBox(objects, assets, id);
  if (!lb) return null;
  return lb.clone().applyMatrix4(worldMatrix(objects, id));
}

/** 오브젝트 로컬 프레임에서의 형상 중심(자기 TRS 적용 전). 중심 피벗 회전용. */
export function localCenter(objects: ObjectNodeSchema[], assets: AssetRefSchema[], id: string): THREE.Vector3 | null {
  const lb = localBBox(objects, assets, id);
  if (!lb || lb.isEmpty()) return null;
  return lb.getCenter(new THREE.Vector3());
}
