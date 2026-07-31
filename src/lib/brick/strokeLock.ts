// 드래그 한 획의 **안전장치** — 한 획이 무엇을 건드릴 수 있는지 정한다. 놓기·지우기가 같은 규칙을 쓴다.
//
// ★ 왜 필요한가 (2026-07-31, 사용자 보고)
//   지우기 판정은 **커서 밑에서 가장 가까운 것**을 집는다. 그런데 스윕은 *표면을 따라가는* 게 아니라
//   **화면을 가로지른다** — 커서가 브릭을 벗어나는 순간 그 뒤의 전혀 다른 것(바닥·먼 벽)이 잡힌다.
//   실제로 "바닥 위 브릭을 지우며 아래로 끌었더니 지나간 자리의 **바닥까지 사라졌다**".
//   이건 이 조작 방식이 원래 안고 있는 위험이다(마인크래프트 크리에이티브도 같은 사고가 난다.
//   거기선 크로스헤어 고정 + 도달 거리 5블록 + 캐는 시간이 완충 역할을 한다).
//
// 규칙 둘 — 첫 클릭에서 잠그고 그 획 내내 유지한다.
//   (A) **같은 갈래 · 같은 층**: 브릭에서 시작한 획은 지형을 건드리지 않고, 첫 면의 축 기준 **한 겹**만 훑는다.
//   (B) **도달 거리**: 획 시작점에서 너무 멀면 안 지운다. 화면 저 끝까지 훑었을 때의 사고를 막는 2차 그물.
//
// 감수하는 점: **한 획으로 여러 층은 못 지운다.** 3층 벽을 앞에서 훑으면 앞면 한 겹만 지워진다.
//   예측 가능한 쪽이 낫다 — 의도치 않게 파괴되는 것보다 한 번 더 끄는 편이 싸다.

import { CELL_X, CELL_Y, CELL_Z } from './grid';
import type { FaceAxis } from './placement';
import type { Brick } from './world';

/** 획 시작점에서 이만큼(m) 넘게 떨어진 것은 안 지운다. 긴 벽/바닥 훑기는 되고 화면 반대편은 안 되는 정도 */
export const ERASE_REACH_M = 12;

export interface EraseLock {
  /** 지형에서 시작한 획인가 — 브릭 획은 지형을, 지형 획은 브릭을 건드리지 않는다 */
  terrain: boolean;
  /** 첫 클릭이 짚은 면의 축(0=x, 1=y, 2=z) */
  axis: FaceAxis;
  /** 그 축의 앵커 좌표 = 훑을 "층" */
  layer: number;
  /** 획 시작점(월드 m) */
  origin: [number, number, number];
}

const anchorAt = (b: Brick, axis: FaceAxis): number => (axis === 0 ? b.x : axis === 1 ? b.y : b.z);

const worldOf = (b: Brick): [number, number, number] => [b.x * CELL_X, b.y * CELL_Y, b.z * CELL_Z];

/** 첫 브릭과 짚은 면으로 획을 연다 */
export function beginEraseStroke(first: Brick, axis: FaceAxis): EraseLock {
  return {
    terrain: first.part === 'terrain',
    axis,
    layer: anchorAt(first, axis),
    origin: worldOf(first),
  };
}

/**
 * 이 획에서 지워도 되는 브릭인가.
 *
 * ⚠️ **앵커 좌표로 층을 판정한다** — 커서가 브릭의 윗면을 짚었는지 옆면을 짚었는지는 보지 않는다.
 *   이웃을 지우고 나면 그 옆 브릭의 **노출된 옆면**이 잡히는데, 그때 히트 지점으로 층을 재면
 *   같은 층인데도 걸러져 획이 중간에 멈춘다(카메라 각도에 따라 되다 안 되다 한다).
 */
export function canEraseInStroke(lock: EraseLock, b: Brick): boolean {
  if ((b.part === 'terrain') !== lock.terrain) return false;
  if (anchorAt(b, lock.axis) !== lock.layer) return false;
  return inReach(lock.origin, worldOf(b));
}

// ── 놓기 획 ──────────────────────────────────────────────────────────────
//
// ★ 지우기와 **판정 대상이 다르다.**
//   지우기는 "커서 밑 브릭"을 보지만, 놓기는 **새 브릭이 앉을 자리**를 봐야 한다.
//   커서는 방금 놓은 브릭의 옆면을 짚고 있을 수도 있어서(바닥을 훑으면 반드시 그렇게 된다),
//   짚은 것의 종류·층으로 판정하면 **한 칸 놓자마자 획이 끊긴다.**
//   그래서 갈래(terrain 여부)는 보지 않고 **놓일 칸의 층**만 잠근다.

export interface PlaceLock {
  axis: FaceAxis;
  /** 첫 브릭이 앉은 층(그 축의 앵커 좌표) */
  layer: number;
  /**
   * 이 획에서 **움직일 수 있는 축**. 나머지는 첫 브릭 자리에 고정된다.
   *
   * ★ 값은 `anchorFromFace`의 `slide`를 그대로 쓴다 — **윗면은 XZ 두 방향, 벽면은 그 벽을 따라 수평 한 방향뿐.**
   *   이걸 안 쓰고 "면 축만 빼고 전부 자유"로 뒀더니, 벽 앞면을 훑을 때 **세로까지 열려서**
   *   커서가 조금만 위아래로 흔들려도 위 칸에 놓였다(사용자 보고: "X방향이 아니라 Y방향으로 추가된다").
   */
  slide: FaceAxis[];
  /** 첫 브릭의 앵커 칸 — 격자의 원점 */
  originCell: [number, number, number];
  /** 회전을 반영한 파츠 크기(칸) — 자유 축은 이 간격으로 스냅한다 */
  ext: [number, number, number];
  origin: [number, number, number];
}

export function beginPlaceStroke(
  anchor: [number, number, number],
  axis: FaceAxis,
  ext: [number, number, number],
  slide: FaceAxis[],
): PlaceLock {
  return {
    axis,
    layer: anchor[axis],
    slide,
    originCell: [...anchor],
    ext,
    origin: [anchor[0] * CELL_X, anchor[1] * CELL_Y, anchor[2] * CELL_Z],
  };
}

/**
 * 커서가 가리킨 칸 → **첫 브릭에서 이어지는 격자 위의 앵커**.
 *
 * ★ 칸을 그대로 앵커로 쓰면 안 된다 — **벽에서 줄이 어긋난다**(실제로 그랬다).
 *   벽은 세로(y)가 자유 축인데 **브릭 높이가 3칸**이라, 커서가 브릭 중간 높이를 지나면
 *   앵커가 1~2칸 위로 잡혀 **한 칸씩 뜬 줄**이 놓인다.
 *   바닥에서 티가 안 났던 건 세로가 잠긴 축이고 가로 간격이 우연히 맞아떨어졌기 때문이다.
 *   → 자유 축은 **첫 브릭 기준으로 파츠 크기 단위**로 스냅한다(레고를 격자에 붙이듯).
 */
export function strokeAnchor(lock: PlaceLock, cell: [number, number, number]): [number, number, number] {
  const a: [number, number, number] = [...lock.originCell]; // 기본은 첫 브릭 자리 — 움직일 축만 바꾼다
  for (const k of lock.slide) {
    const e = Math.max(1, lock.ext[k]);
    a[k] = lock.originCell[k] + Math.floor((cell[k] - lock.originCell[k]) / e) * e;
  }
  return a;
}

/** 이 획에서 여기에 놓아도 되는가 (막힌 자리인지는 월드가 따로 본다) */
export function canPlaceInStroke(lock: PlaceLock, anchor: [number, number, number]): boolean {
  if (anchor[lock.axis] !== lock.layer) return false;
  return inReach(lock.origin, [anchor[0] * CELL_X, anchor[1] * CELL_Y, anchor[2] * CELL_Z]);
}

// ── 줄 긋기(수직면) ──────────────────────────────────────────────────────
//
// ★ 왜 수평면과 규칙이 다른가 (사용자 지적, 2026-07-31)
//   윗면을 클릭하면 "그 평면을 칠한다"가 자연스럽다 — 바닥 한 층을 한 획에 깐다.
//   그런데 **옆면**을 클릭하고 오른쪽으로 끌면, 평면 모델에서는 그 평면(YZ) 위를 움직이므로
//   **앞뒤로** 줄이 생긴다. 사용자가 기대하는 건 **끈 방향(오른쪽)으로 늘어나는 것**이다.
//   → 수직면은 **끄는 방향 한 축**으로만 뻗는다. 규칙이 둘이지만 각 면에서 결과가 예측 가능하다.

/** 드래그 델타(월드 m)에서 줄이 뻗을 축 — **가장 많이 움직인 축** */
export function dominantAxis(dx: number, dy: number, dz: number): FaceAxis {
  const ax = Math.abs(dx), ay = Math.abs(dy), az = Math.abs(dz);
  if (ax >= ay && ax >= az) return 0;
  return ay >= az ? 1 : 2;
}

/**
 * 그 축으로 **파츠 몇 개**만큼 갔는지(부호 포함).
 *
 * 칸이 아니라 **파츠 크기** 단위다 — 2×4 브릭이면 한 걸음이 2칸 또는 4칸이다.
 * 절반 이상 갔을 때 한 걸음으로 친다(반올림) — 그래야 손이 미세하게 떨려도 줄이 안 늘었다 줄었다 한다.
 */
export function axisSteps(delta: number, extCells: number, cellSize: number): number {
  const step = Math.max(1, extCells) * cellSize;
  return Math.round(delta / step);
}

function inReach(a: [number, number, number], b: [number, number, number]): boolean {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  return dx * dx + dy * dy + dz * dz <= ERASE_REACH_M * ERASE_REACH_M;
}
