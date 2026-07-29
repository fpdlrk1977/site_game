// 브릭 배치 — 기준: doc/BRICK_SYSTEM.md §4.3~4.4
//
// ★ 배치는 **가리킨 면에 붙이는** 방식이다(2026-07-30 전환).
//
//   흐름: 면에 호버 → 붙을 자리를 아웃라인으로 표시 → 누르면 그 자리에 놓임
//        → 누른 채 움직이면 **그 면의 평면 위에서만** 미끄러짐 → 떼면 확정
//
//   ★ 미끄러지는 축을 면이 정한다:
//     - 윗면·밑면(수평) → 그 평면 위 2방향 자유
//     - 옆면(수직)      → **수평 한 방향만**. 높이는 고정한다.
//       세로로도 움직이면 받쳐줄 게 없는 자리에 브릭이 뜬다.
//
//   (이전엔 '드롭' 모델이었다 — 포인터가 XZ만 정하고 높이는 발자국이 내려앉는 곳으로.
//    면 판정이 없어 단순했지만, **가리킨 면에 붙는다**는 직관과 어긋났다.)

import { CELL_X, CELL_Y, CELL_Z, type Rot } from './grid';
import { extentOf, PARTS, type PartId } from './parts';
import type { BrickWorld } from './world';

export interface Anchor { x: number; y: number; z: number }

/** 면의 축 — 0=x, 1=y, 2=z */
export type FaceAxis = 0 | 1 | 2;
export interface Face { axis: FaceAxis; dir: 1 | -1 }

const CELL = [CELL_X, CELL_Y, CELL_Z] as const;

/**
 * ★ **커서가 브릭의 중앙에 온다.**
 *
 *   `칸번호 = floor(좌표/셀)`로 잡고 거기서 보정하는 방식은 짝수 칸에서 반드시 어긋난다 —
 *   2칸·4칸짜리의 중앙은 **칸 한가운데가 아니라 칸 경계**에 있기 때문이다.
 *   그래서 2×4를 놓으면 커서가 사각형 **모서리**에 붙어 브릭이 한쪽으로 뻗어 보였다.
 *
 *   대신 **브릭 중심이 커서에 가장 가까운 자리**를 바로 고른다.
 *   `round(좌표/셀 − 칸수/2)` — 홀수든 짝수든 커서는 항상 브릭 한가운데(반 칸 이내)에 있고,
 *   자리는 커서가 **중간 지점을 넘을 때** 딱 한 칸씩 바뀐다.
 */
function snapCentered(world: number, axis: 0 | 1 | 2, ext: number): number {
  return Math.round(world / CELL[axis] - ext / 2);
}

/**
 * 클릭 지점이 그 브릭의 **어느 면**인가.
 *
 * ★ 지오메트리 법선이 아니라 **월드 AABB까지의 거리**로 판정한다.
 *   모따기(RoundedBox)나 돌기가 있으면 법선이 모서리에서 휘어 엉뚱한 면이 나온다.
 *   AABB는 어떤 돌기 모양에서도 같은 답을 준다.
 */
export function faceOf(world: BrickWorld, brickId: number, px: number, py: number, pz: number): Face | null {
  const b = world.bricks.get(brickId);
  if (!b) return null;
  const e = extentOf(PARTS[b.part], b.rot);
  const lo = [b.x * CELL_X, b.y * CELL_Y, b.z * CELL_Z];
  const hi = [(b.x + e.ex) * CELL_X, (b.y + e.ey) * CELL_Y, (b.z + e.ez) * CELL_Z];
  const p = [px, py, pz];

  let best: Face = { axis: 1, dir: 1 };
  let bestD = Infinity;
  for (let a = 0; a < 3; a++) {
    const dLo = Math.abs(p[a] - lo[a]);
    const dHi = Math.abs(p[a] - hi[a]);
    if (dLo < bestD) { bestD = dLo; best = { axis: a as FaceAxis, dir: -1 }; }
    if (dHi < bestD) { bestD = dHi; best = { axis: a as FaceAxis, dir: 1 }; }
  }
  return best;
}

/** 면에 붙인 배치 — 앵커 + 어느 축으로 미끄러질 수 있는지 */
export interface FacePlacement {
  anchor: Anchor;
  face: Face;
  /** 드래그로 바꿀 수 있는 축 (나머지는 고정) */
  slide: FaceAxis[];
  /** 미끄러질 평면의 월드 좌표(면 축 기준) — 드래그 레이캐스트에 쓴다 */
  planeAt: number;
  /** 놓을 브릭의 칸수(회전 반영) — 드래그 때 중앙 맞춤에 다시 쓴다 */
  ext: [number, number, number];
}

/**
 * 가리킨 면 바깥쪽에 브릭을 붙인다.
 *
 * **커서는 브릭 한가운데**에 온다(`snapCentered`). 크기가 홀수든 짝수든 같다.
 * 단 **옆면에서는 세로로 클릭한 브릭과 밑면을 맞춘다.**
 *   짚은 높이를 그대로 쓰면 같은 면이라도 위/아래 어디를 짚었느냐로 한 칸씩 어긋나
 *   땅에 파묻히거나 붕 뜬다. 밑면 정렬은 어디를 짚든 결과가 같다.
 */
export function anchorFromFace(
  world: BrickWorld, brickId: number, face: Face,
  px: number, py: number, pz: number,
  part: PartId, rot: Rot,
): FacePlacement | null {
  const b = world.bricks.get(brickId);
  if (!b) return null;
  const be = extentOf(PARTS[b.part], b.rot);
  const p = [px, py, pz];

  // 면 축은 상대 브릭 바로 바깥 칸으로 고정된다(붙는 자리라 선택의 여지가 없다)
  const outer = face.dir > 0
    ? [b.x + be.ex, b.y + be.ey, b.z + be.ez][face.axis]
    : [b.x, b.y, b.z][face.axis] - 1;

  const e = extentOf(PARTS[part], rot);
  const ext: [number, number, number] = [e.ex, e.ey, e.ez];
  const anchor = [0, 0, 0];
  for (let a = 0; a < 3; a++) {
    if (a === face.axis) {
      // 아래쪽 면이면 브릭 두께만큼 내려 붙여야 맞닿는다
      anchor[a] = face.dir > 0 ? outer : outer - (ext[a] - 1);
    } else if (a === 1) {
      anchor[a] = b.y;                        // 옆면 — 클릭한 브릭과 밑면을 맞춘다
    } else {
      anchor[a] = snapCentered(p[a], a as FaceAxis, ext[a]); // 커서가 브릭 한가운데
    }
  }

  // 수평면(윗면·밑면)이면 XZ 두 방향, 수직면이면 그 벽을 따라 수평 한 방향만
  const slide: FaceAxis[] = face.axis === 1 ? [0, 2] : [face.axis === 0 ? 2 : 0];
  return {
    anchor: { x: anchor[0], y: anchor[1], z: anchor[2] },
    face,
    slide,
    ext,
    planeAt: (anchor[face.axis] + ext[face.axis] / 2) * CELL[face.axis],
  };
}

/**
 * 드래그 중 — 평면 위 지점을 받아 **미끄러질 수 있는 축만** 갱신한다.
 * 고정 축은 처음 놓은 값 그대로라 높이가 저절로 바뀌는 일이 없다.
 */
export function slideAnchor(base: FacePlacement, px: number, py: number, pz: number): Anchor {
  const p = [px, py, pz];
  const out = [base.anchor.x, base.anchor.y, base.anchor.z];
  for (const a of base.slide) out[a] = snapCentered(p[a], a, base.ext[a]);
  return { x: out[0], y: out[1], z: out[2] };
}

/** 앵커 → 인스턴스 배치용 월드 중심 좌표 */
export function anchorCenterWorld(a: Anchor, part: PartId, rot: Rot): [number, number, number] {
  const e = extentOf(PARTS[part], rot);
  return [
    (a.x + e.ex / 2) * CELL_X,
    (a.y + e.ey / 2) * CELL_Y,
    (a.z + e.ez / 2) * CELL_Z,
  ];
}
