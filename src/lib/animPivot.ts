// 애니 클립 회전 피벗(경첩) 유틸 — ANIMATION.md.
// pivot은 오브젝트 스케일드-로컬 오프셋(0.5×scale=모서리). 회전 R을 그 점 기준으로 하려면
// 오브젝트 원점을 (pivot − R·pivot)만큼 옮기면 그 점이 고정된다.
//   에디터 기즈모가 pivot 기준으로 회전하면 이 오프셋이 position에 자연히 반영(baked)되고,
//   레거시 클립(중심회전 저작 + 런타임 pivotOffset)은 로드 시 bakeClipPivots로 1회 반영해 동일 결과로 통일한다.
import * as THREE from 'three';
import type { AnimClip, Vector3 } from '@/types/scene';

const DEG2RAD = Math.PI / 180;
const _euler = new THREE.Euler();
const _pv = new THREE.Vector3();

/** 회전 피벗 보정 오프셋 = pivot − R·pivot (그 점이 고정되도록 오브젝트 원점을 이동). rotDeg는 도(deg). */
export function pivotOffset(pivot: Vector3, rotDeg: Vector3): Vector3 {
  _euler.set(rotDeg.x * DEG2RAD, rotDeg.y * DEG2RAD, rotDeg.z * DEG2RAD, 'XYZ');
  _pv.set(pivot.x, pivot.y, pivot.z).applyEuler(_euler);
  return { x: pivot.x - _pv.x, y: pivot.y - _pv.y, z: pivot.z - _pv.z };
}

/**
 * 클립 피벗 정규화 — 로드 시 1회. (1) 레거시 클립레벨 pivot을 **트랙별 pivot으로 이전**(다중 트랙 대비),
 * (2) 미-baked면 키 position에 스윙을 반영(bake). 이후 런타임/에디터는 트랙별 pivot만 본다.
 * 클립레벨 pivot이 없으면 그대로(멱등). 변경 없으면 원본 참조 반환.
 */
export function normalizeClipPivots(clips: AnimClip[]): AnimClip[] {
  let changed = false;
  const out = clips.map((c) => {
    if (!c.pivot) return c; // 이미 per-track이거나 피벗 없음
    changed = true;
    const clipPivot = c.pivot;
    const clipBaked = c.pivotBaked;
    const tracks = c.tracks.map((t) => {
      if (t.pivot) return t; // 이미 트랙 피벗 있으면 유지
      if (clipBaked) return { ...t, pivot: clipPivot, pivotBaked: true }; // 키가 이미 baked → 트랙으로 이전만
      // 레거시 미-baked → 키에 스윙 반영(bake) 후 트랙 피벗 설정
      return {
        ...t,
        pivot: clipPivot,
        pivotBaked: true,
        keys: t.keys.map((k) => {
          if (!k.position || !k.rotation) return k;
          const off = pivotOffset(clipPivot, k.rotation);
          return { ...k, position: { x: k.position.x + off.x, y: k.position.y + off.y, z: k.position.z + off.z } };
        }),
      };
    });
    return { ...c, pivot: undefined, pivotBaked: undefined, tracks };
  });
  return changed ? out : clips;
}
