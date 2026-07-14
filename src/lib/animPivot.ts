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
 * 레거시(미-baked) pivot 클립의 키프레임 position에 pivot 스윙을 1회 반영(baked).
 * baked 후엔 pivotBaked=true로 표시 → 이후 런타임은 pivotOffset을 재적용하지 않고 순수 보간.
 * 이미 baked거나 pivot이 없으면 그대로 반환(멱등). 변경이 없으면 원본 배열 참조 반환.
 */
export function bakeClipPivots(clips: AnimClip[]): AnimClip[] {
  let changed = false;
  const out = clips.map((c) => {
    if (!c.pivot || c.pivotBaked) return c;
    changed = true;
    const pivot = c.pivot;
    return {
      ...c,
      pivotBaked: true,
      tracks: c.tracks.map((t) => ({
        ...t,
        keys: t.keys.map((k) => {
          if (!k.position || !k.rotation) return k;
          const off = pivotOffset(pivot, k.rotation);
          return { ...k, position: { x: k.position.x + off.x, y: k.position.y + off.y, z: k.position.z + off.z } };
        }),
      })),
    };
  });
  return changed ? out : clips;
}
