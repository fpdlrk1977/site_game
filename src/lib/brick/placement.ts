// 브릭 배치 — 기준: doc/BRICK_SYSTEM.md §4.3~4.4
//
// ★★ 규칙은 하나다: **겨눈 칸의 옆 칸에 놓는다. 자동 보정은 없다.**
//
//   흐름: 표면의 **칸 하나**를 겨눔(강조 표시) → 그 옆 칸에 브릭의 첫 칸을 맞춤
//        → 걸리면 **빨강으로 표시하고 놓지 않음** (알아서 옮기지 않는다)
//
// ★ 왜 자동 보정을 다 걷어냈는가 (2026-07-30, 네 번의 헛수정 뒤):
//   마인크래프트가 정확하게 느껴지는 이유는 **블록이 전부 1칸**이라 "어느 면이냐"가
//   정해지면 들어갈 칸이 **딱 하나**뿐이기 때문이다. 고를 여지가 없으니 계산도 없다.
//   우리 브릭은 여러 칸이라 "그 면 위 어디에?"가 남는데, 나는 그걸 **자동으로 채워 넣었다**:
//     · 커서 좌표로 좌우 위치 계산 (`snapCentered`)
//     · 걸리면 알아서 한 칸 밀어냄 (`seatAlong`)
//   둘 다 **사용자가 겨눈 것을 내가 고쳐서 놓는 것**이다. 그래서 "한 칸씩 밀리거나 올라간다".
//   → 마인크래프트는 **막히면 그냥 안 놓인다.** 알아서 옮겨 주지 않는다. 그 규칙을 따른다.
//
//   큰 브릭은 첫 칸이 겨눈 칸이고 나머지가 한 방향으로 뻗는다. 방향은 **회전(R)** 으로 바꾼다.

import { CELL_X, CELL_Y, CELL_Z, worldToCellX, worldToCellY, worldToCellZ, type Rot } from './grid';
import { extentOf, PARTS, pivotOffset, type PartId } from './parts';
import type { BrickWorld } from './world';

export interface Anchor { x: number; y: number; z: number }

/** 면의 축 — 0=x, 1=y, 2=z */
export type FaceAxis = 0 | 1 | 2;
export interface Face { axis: FaceAxis; dir: 1 | -1 }

const CELL = [CELL_X, CELL_Y, CELL_Z] as const;
const toCell = [worldToCellX, worldToCellY, worldToCellZ] as const;

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

/** 면에 붙인 배치 */
export interface FacePlacement {
  anchor: Anchor;
  face: Face;
  /** **겨눈 칸** — 표면에 강조해 보여준다. "여기 옆에 놓인다"가 눈에 보이게 */
  cell: [number, number, number];
  /** 드래그로 바꿀 수 있는 축 (나머지는 고정) */
  slide: FaceAxis[];
  /**
   * 미끄러질 평면의 월드 좌표(면 축 기준) — 드래그 레이캐스트에 쓴다.
   *
   * ★ 반드시 **브릭이 표면에 닿는 면**이어야 한다. 한때 브릭 **중심**으로 잡았는데,
   *   그러면 평면이 표면보다 브릭 두께의 절반(0.3m)만큼 떠 있어서 비스듬히 볼 때
   *   투영 지점이 `0.3m × tan(기울기)`만큼 어긋난다 — 45°면 **한 칸 이상**이다.
   *   그래서 "클릭하는 순간 브릭이 한 칸 옮겨졌다"(위에서 볼 때는 정확).
   */
  planeAt: number;
  /** 놓을 브릭의 칸수(회전 반영) */
  ext: [number, number, number];
  /**
   * 기준 칸(꼭지점)이 AABB 안 어디인지 — `[dx, dz]`. **드래그도 같은 규칙을 써야** 한다.
   * (여기 안 담고 `slideAnchor`에서 다시 계산하면 파츠·회전을 또 넘겨야 하고, 그러다 어긋난다)
   */
  pivot: [number, number];
}

/**
 * 겨눈 칸의 **옆 칸**에 브릭의 첫 칸을 맞춘다. 그게 전부다.
 *
 * 자동 보정이 없으므로 **결과가 항상 놓을 수 있는 자리는 아니다.**
 * 막혔는지는 호출부가 `world.canPlace`로 판정해 빨강으로 알려준다 — 몰래 옮기지 않는다.
 */
export function anchorFromFace(
  world: BrickWorld, brickId: number, face: Face,
  px: number, py: number, pz: number,
  part: PartId, rot: Rot,
): FacePlacement | null {
  const b = world.bricks.get(brickId);
  if (!b) return null;
  const be = extentOf(PARTS[b.part], b.rot);
  const bLo = [b.x, b.y, b.z];
  const bHi = [b.x + be.ex - 1, b.y + be.ey - 1, b.z + be.ez - 1];

  // 겨눈 칸 — 그 브릭 표면의 칸 하나. 범위 밖으로 새지 않게 자른다
  const p = [px, py, pz];
  const cell: [number, number, number] = [0, 0, 0];
  for (let a = 0; a < 3; a++) cell[a] = Math.min(bHi[a], Math.max(bLo[a], toCell[a](p[a])));
  cell[face.axis] = face.dir > 0 ? bHi[face.axis] : bLo[face.axis]; // 면 쪽 표면 칸

  const e = extentOf(PARTS[part], rot);
  const ext: [number, number, number] = [e.ex, e.ey, e.ez];

  // 새 브릭의 첫 칸. 면 축만 한 칸 비켜 놓는다(아래쪽 면이면 두께만큼).
  //
  // ★ 나머지 축은 **겨눈 칸이 기준 칸(꼭지점)** 이 되도록 뒤로 민다 — 그래야 R을 눌러도
  //   겨눈 칸이 제자리에 붙어 있고 브릭이 그 둘레로 돈다. 안 밀면 항상 +X/+Z로만 자란다.
  const [pdx, pdz] = pivotOffset(PARTS[part], rot);
  const anchor: [number, number, number] = [cell[0] - pdx, cell[1], cell[2] - pdz];
  anchor[face.axis] = face.dir > 0 ? cell[face.axis] + 1 : cell[face.axis] - ext[face.axis];

  // 수평면(윗면·밑면)이면 XZ 두 방향, 수직면이면 그 벽을 따라 수평 한 방향만
  const slide: FaceAxis[] = face.axis === 1 ? [0, 2] : [face.axis === 0 ? 2 : 0];
  return {
    anchor: { x: anchor[0], y: anchor[1], z: anchor[2] },
    face,
    cell,
    slide,
    ext,
    pivot: [pdx, pdz],
    // 브릭이 **표면에 닿는 면**. 위쪽 면을 겨눴으면 브릭의 아래쪽, 아래쪽 면이면 위쪽이 닿는다
    planeAt: (face.dir > 0 ? anchor[face.axis] : anchor[face.axis] + ext[face.axis]) * CELL[face.axis],
  };
}

/**
 * 드래그 중 — 평면 위 지점을 받아 **미끄러질 수 있는 축만** 갱신한다.
 * 여기도 보정 없이 **커서가 있는 칸**을 브릭의 첫 칸으로 쓴다.
 */
export function slideAnchor(base: FacePlacement, px: number, py: number, pz: number): Anchor {
  const p = [px, py, pz];
  const out = [base.anchor.x, base.anchor.y, base.anchor.z];
  // 커서가 있는 칸이 **기준 칸**이 되도록 민다 — 첫 클릭(anchorFromFace)과 같은 규칙이라야
  // 드래그하는 동안 브릭이 커서 밑에서 튀지 않는다.
  const pivotOf = [base.pivot[0], 0, base.pivot[1]];
  for (const a of base.slide) out[a] = toCell[a](p[a]) - pivotOf[a];
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
