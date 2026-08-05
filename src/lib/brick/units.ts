// 큰 파츠 → 1×1 단위로 펼치기 — 기준: doc/BRICK_PLAN.md §20
//
// ★★ **기본 단위는 1×1이다.** 카탈로그의 `2×4`는 부품이 아니라 **붓 크기(도장)** 다 —
//   클릭하면 `b1x1` 여덟 개가 놓인다. 그래야
//     ① 칸마다 테두리가 보이고(마인크래프트처럼 칸칸이 나뉘어 보인다)
//     ② **한 칸씩 지울 수** 있다(2×4로 깔아 놓고 그중 한 칸만 파내기)
//   실제로 월드와 저장소에 들어가는 레코드는 **단위뿐**이다.
//
// ★ 안 쪼개지는 것: **지형**(2×2가 곧 마인크래프트 블록 크기)과 이미 1칸인 파츠.
//
// ★ **삭제된 경사**도 여기를 지난다 — 껍데기 파츠의 단위가 `b1x1`이라, 지어 둔 지붕이
//   불러오는 순간 **평범한 블록으로** 바뀐다. 따로 분기할 것이 없다.

import type { Rot } from './grid';
import { extentOf, PARTS, unitOf, type PartId } from './parts';

export interface UnitPlacement {
  part: PartId;
  x: number; y: number; z: number;
  rot: Rot;
}

/**
 * 큰 파츠 하나를 **단위 여러 개**로 펼친다. 단위는 그 파츠의 점유 칸을 **빈틈없이·겹침없이** 채운다.
 *
 * ★★ **회전 행렬을 직접 다루지 않는다.** 이미 24방향을 아는 `extentOf`로 두 AABB의 크기만 비교해
 *   그 비율만큼 깐다. 회전 기준이 **두 개**라(화면 +90° / 배치 −90°, `BRICK_PITFALLS.md` D-6)
 *   여기서 축을 손으로 돌리면 **에러 없이 방향만 조용히 틀린다.** 그 함정을 아예 안 밟는 방식이다.
 *
 * ★ 단위에는 **같은 `rot`** 을 준다 — 뒤집기(돌기 방향)와 얇은 파츠의 두께 축이 그대로 따라온다.
 *   단위의 점유 크기도 같은 회전으로 구하므로 나눗셈이 항상 딱 떨어진다
 *   (단위는 로컬에서 `1 × 높이 × 1`이고, 큰 파츠는 `sx × 같은 높이 × sz`라 축이 어떻게 섞이든 배수 관계다).
 */
export function unitsOf(part: PartId, x: number, y: number, z: number, rot: Rot): UnitPlacement[] {
  const p = PARTS[part];
  const unit = unitOf(part);
  if (unit === part) return [{ part, x, y, z, rot }];

  const e = extentOf(p, rot);
  const ue = extentOf(PARTS[unit], rot);

  const out: UnitPlacement[] = [];
  for (let dx = 0; dx < e.ex; dx += ue.ex) {
    for (let dy = 0; dy < e.ey; dy += ue.ey) {
      for (let dz = 0; dz < e.ez; dz += ue.ez) {
        out.push({ part: unit, x: x + dx, y: y + dy, z: z + dz, rot });
      }
    }
  }
  return out;
}
