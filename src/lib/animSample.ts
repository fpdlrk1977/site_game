// 애니 클립 키프레임 샘플링(보간) — ANIMATION.md. 뷰어 재생·에디터 미리보기가 공유하는 순수 함수.
//   회전 피벗(경첩)은 완벽한 원호로: 각 키의 rest 위치(baked면 pivotOffset 제거)로 회전을 보간한 뒤,
//   보간된 회전으로 pivotOffset을 매 프레임 재계산해 더한다(직선 보간의 중심 드리프트 방지).
import { pivotOffset } from './animPivot';
import type { AnimClip, AnimTrack, AnimKeyframe, Vector3 } from '@/types/scene';

export type ClipSample = { position?: Vector3; rotation?: Vector3; scale?: Vector3 };

function lerp(a: number, b: number, f: number) { return a + (b - a) * f; }
function lerpVec(a: Vector3 | undefined, b: Vector3 | undefined, f: number): Vector3 | undefined {
  if (!a) return b; if (!b) return a;
  return { x: lerp(a.x, b.x, f), y: lerp(a.y, b.y, f), z: lerp(a.z, b.z, f) };
}

/** 한 트랙을 시간 t에서 샘플(선형/easeInOut 보간). */
export function sampleTrack(track: AnimTrack, t: number, easing?: string): ClipSample {
  const ks = track.keys;
  if (!ks || ks.length === 0) return {};
  const pick = (k: AnimKeyframe): ClipSample => ({ position: k.position, rotation: k.rotation, scale: k.scale });
  if (t <= ks[0].time) return pick(ks[0]);
  if (t >= ks[ks.length - 1].time) return pick(ks[ks.length - 1]);
  let i = 0; while (i < ks.length - 1 && ks[i + 1].time <= t) i++;
  const k0 = ks[i], k1 = ks[i + 1];
  const span = k1.time - k0.time;
  let f = span > 0 ? (t - k0.time) / span : 0;
  if (easing === 'easeInOut') f = f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2;
  return { position: lerpVec(k0.position, k1.position, f), rotation: lerpVec(k0.rotation, k1.rotation, f), scale: lerpVec(k0.scale, k1.scale, f) };
}

/** 클립을 시간 t에서 샘플 → { objectId: 트랜스폼 }. 경첩(pivot)이면 원호 복원. */
export function sampleClip(clip: AnimClip, t: number): Record<string, ClipSample> {
  const out: Record<string, ClipSample> = {};
  for (const tr of clip.tracks) {
    let s: ClipSample;
    if (clip.pivot) {
      const pivot = clip.pivot;
      const baked = clip.pivotBaked;
      // 각 키의 rest 위치(baked면 pivotOffset 제거; 레거시 미-baked는 keyPos가 곧 rest)
      const restKeys = tr.keys.map((k) => {
        if (!k.position || !k.rotation || !baked) return k;
        const o = pivotOffset(pivot, k.rotation);
        return { ...k, position: { x: k.position.x - o.x, y: k.position.y - o.y, z: k.position.z - o.z } };
      });
      s = sampleTrack({ ...tr, keys: restKeys }, t, clip.easing);
      if (s.rotation && s.position) {
        const off = pivotOffset(pivot, s.rotation);
        s = { ...s, position: { x: s.position.x + off.x, y: s.position.y + off.y, z: s.position.z + off.z } };
      }
    } else {
      s = sampleTrack(tr, t, clip.easing);
    }
    out[tr.objectId] = s;
  }
  return out;
}
