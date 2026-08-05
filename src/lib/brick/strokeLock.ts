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

/**
 * **놓기**의 도달 거리(m) — 지우기(12m)보다 훨씬 넉넉하다.
 *
 * 🔴 **왜 갈랐나** (2026-08-05 사용자 보고: *"드래그로 큰 사각형을 만들면 브릭이 그 사각형보다 잘려서 생성된다"*)
 *   12m를 그대로 쓰니 **사각형이 원형으로 깎였다** — 거리는 유클리드라 모서리가 먼저 잘린다.
 *   실측: 11×11 사각형 121개 중 **61개만** 놓였다(딱 절반, 사분원 모양).
 *
 * ★ 놓기에서 이 그물이 원래 막던 것은 **붓칠 시절의 사고**(커서가 표면을 벗어나 화면 저 끝에 놓이는 것)다.
 *   지금 놓기는 **잠긴 평면 위 사각형 + 미리보기**라 그 위험이 구조적으로 없다 —
 *   커서가 어디로 튀든 결과가 **테두리로 먼저 보이고**, 손을 떼야 확정된다.
 *   그래서 한계는 "사고 방지"가 아니라 **"스트리밍이 올라와 있는 범위"** 로 잡는다(로드 반경 48m 안쪽).
 */
export const PLACE_REACH_M = 40;

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

/**
 * 이 획에서 여기에 놓아도 되는가 (막힌 자리인지는 월드가 따로 본다).
 *
 * ★★ 거리를 **축마다 따로** 잰다(상자 판정) — 지우기의 유클리드 판정과 일부러 다르다.
 *   유클리드로 자르면 **사각형의 모서리가 먼저 잘려 둥글어진다**(실측: 11×11 중 61개만 남았다).
 *   놓기는 결과가 사각형이어야 하므로 한계도 사각형이어야 한다.
 */
export function canPlaceInStroke(lock: PlaceLock, anchor: [number, number, number]): boolean {
  if (anchor[lock.axis] !== lock.layer) return false;
  const w = [anchor[0] * CELL_X, anchor[1] * CELL_Y, anchor[2] * CELL_Z];
  for (let k = 0; k < 3; k++) if (Math.abs(w[k] - lock.origin[k]) > PLACE_REACH_M) return false;
  return true;
}

// ── 사각형 채우기 (§24) ──────────────────────────────────────────────────
//
// ★ 왜 "지나간 칸"이 아니라 사각형인가: 커서가 실제로 훑은 칸만 채우면 **바닥 192칸을 다 훑어야** 하고,
//   빨리 끌면 프레임 사이가 비어 **구멍**이 생긴다. 두 끝만 정하면 그 사이는 계산으로 채운다.
//
// ★ 위험(비스듬한 시점에서 엉뚱한 것이 지워지던 사고)은 **여기서 안 늘어난다** —
//   양 끝이 이미 같은 평면 위의 칸이고, 층·갈래·도달 거리 잠금은 그대로 통과시킨다.

/**
 * 한 획으로 채울 수 있는 **앵커 개수 상한**.
 *
 * ★ 도달 거리(12m)만으로도 범위는 묶이지만, 1×1 파츠로 넓게 끌면 그 안에서도 수천 개가 나온다.
 *   손이 미끄러진 한 번이 되돌리기 한 번으로 정리되긴 해도, 그 사이 프레임이 통째로 멈춘다.
 */
export const MAX_RECT_ANCHORS = 1024;

/**
 * 획 시작점 ↔ 지금 겨눈 칸 사이의 **사각형**을 채울 앵커 목록.
 *
 * ★ 자유 축(`slide`)만 자란다. 면 축은 `lock.layer`에 고정이라 **다른 층으로 새지 않는다.**
 * ★ 간격은 `strokeAnchor`와 **같은 규칙**(파츠 크기 단위 스냅) — 안 그러면 클릭과 드래그가 다른 격자에 놓인다.
 * ★ 두 끝을 **모두 포함**한다. 되돌려 끌어도(음수 방향) 같은 사각형이 나온다.
 *
 * ⚠️ 개수 상한에 걸리면 **자르되 버리지 않는다** — 시작점 쪽부터 채운다(사용자가 겨눈 쪽이 살아남는다).
 */
export function strokeRect(lock: PlaceLock, cell: [number, number, number]): [number, number, number][] {
  let out: [number, number, number][] = [[...lock.originCell] as [number, number, number]];

  for (const k of rectAxes(lock.axis)) {
    const step = Math.max(1, lock.ext[k]);
    // 끝점도 **같은 격자에 스냅**한다 — 안 그러면 사각형 끝이 클릭 격자와 어긋난다
    const span = Math.trunc((cell[k] - lock.originCell[k]) / step);
    const dir = span >= 0 ? 1 : -1;
    const n = Math.abs(span); // 두 끝 포함 → n+1개

    const next: [number, number, number][] = [];
    for (const base of out) {
      for (let i = 0; i <= n && next.length < MAX_RECT_ANCHORS; i++) {
        const a: [number, number, number] = [...base];
        a[k] = lock.originCell[k] + dir * i * step;
        next.push(a);
      }
    }
    out = next;
  }
  // ★★ **놓이지 않을 칸은 애초에 안 낸다** — 그래야 미리보기 테두리와 실제 결과가 같다(E-5).
  //   예전엔 여기서 다 내고 놓을 때 걸렀더니, **테두리보다 작게** 생겨서 잘린 것처럼 보였다(사용자 보고).
  return out.filter((a) => canPlaceInStroke(lock, a));
}

/**
 * 사각형이 자랄 수 있는 두 축 — **면 축을 뺀 나머지 전부**.
 *
 * ★ `lock.slide`(줄 긋기용)와 **일부러 다르다.** `slide`는 벽면에서 **가로 한 축**만 열어 둔다 —
 *   커서가 위아래로 흔들리면 엉뚱한 켜에 놓이던 사고 때문이다(사용자 보고 "Y방향으로 추가된다").
 *   그런데 **사각형에서는 세로가 곧 높이**라 잠그면 벽을 한 번에 못 세운다.
 *   대신 위험은 **미리보기가 막는다** — 흔들려서 한 켜가 더 잡히면 손 떼기 전에 눈에 보인다.
 *   (지금 방식은 *끌면서 즉시 확정*이라 눈에 보일 기회 자체가 없었다)
 */
function rectAxes(faceAxis: FaceAxis): FaceAxis[] {
  return ([0, 1, 2] as FaceAxis[]).filter((a) => a !== faceAxis);
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

function inReach(a: [number, number, number], b: [number, number, number], reach = ERASE_REACH_M): boolean {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  return dx * dx + dy * dy + dz * dz <= reach * reach;
}
