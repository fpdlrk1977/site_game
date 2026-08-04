// 브릭 회전 24방향 — 기준: doc/BRICK_PLAN.md §14
//
// ★ 왜 표(table)로 가는가: 회전을 각도로 다루면 **점유 칸 계산이 부동소수로 새어** 격자가 어긋난다.
//   24방향은 전부 **부호 있는 축 교환**(signed permutation)이라 정수로 정확히 표현된다.
//   격자 세계에서 회전은 "어느 축이 어디로 가고 부호가 뭐냐"가 전부다.
//
// ★ 번호 규칙: `rot = tip * 4 + spin`
//     tip  = 어느 면이 위를 보나 (6가지)
//     spin = 그 상태에서 제자리로 몇 번 돌았나 (4가지)
//   **tip 0 = 지금까지의 상태**라, `rot 0~3`은 기존 Y축 회전과 **완전히 같다**.
//   → 이미 저장된 월드가 그대로 열린다(저장값은 이 번호를 그대로 쓴다).
//
// ⚠️ 늘릴 때: `TIP` 순서를 바꾸면 **저장된 브릭의 방향이 통째로 뒤바뀐다.** 뒤에만 추가할 것.

/** 3×3 정수 행렬(행 우선). `world = M · local` */
export type RotMatrix = readonly [number, number, number, number, number, number, number, number, number];

export const ROT_COUNT = 24;

/**
 * ⚠️⚠️ **이 파일에는 회전 기준이 두 개 있다. 섞으면 안 된다.**
 *
 * 기존 코드가 **서로 반대 방향**을 쓰고 있었다(2026-08-02, 숫자로 확인):
 *
 *   화면(`BrickInstances`의 회전·밝기표) … Y축 **+90°**
 *   배치(`parts.pivotOffset`의 기준 칸)  … Y축 **−90°**
 *
 * rot 1과 3이 서로 뒤바뀌어 있다(rot 0·2는 같다). **둘 다 그대로 둔다** — 이유:
 *  - 브릭은 상자라 **점유 범위는 어느 쪽이든 같다**(90°든 −90°든 X/Z 크기만 맞바뀜).
 *  - 화면 기준은 **경사 파츠가 어느 쪽을 보는가**를 정하고, 배치 기준은 **커서 밑에 어느 모서리가 붙어 있는가**를 정한다.
 *    각자 제 일에는 일관돼 있고, 사용자가 확인까지 마친 동작이다.
 *  - 한쪽을 "고치면" **이미 지어 둔 경사 지붕의 방향이나 R 조작감이 뒤집힌다.** 얻는 것 없이 회귀만 난다.
 *
 * → 24방향으로 늘릴 때도 **각자의 기준에서 각자 늘린다.** 아래 두 함수가 그것이고,
 *   테스트가 rot 0~3에서 각각 기존과 일치하는지 잠근다.
 */

/** 제자리 회전 — **화면 기준**(Y축 +90°). 메시 회전·밝기표가 쓴다 */
function spinYVisual(n: number): RotMatrix {
  const c = [1, 0, -1, 0][n & 3];
  const s = [0, 1, 0, -1][n & 3];
  return [c, 0, s, 0, 1, 0, -s, 0, c];
}

/** 제자리 회전 — **배치 기준**(Y축 −90°). 점유 범위·기준 칸이 쓴다 */
function spinYPlace(n: number): RotMatrix {
  const c = [1, 0, -1, 0][n & 3];
  const s = [0, -1, 0, 1][n & 3];
  return [c, 0, s, 0, 1, 0, -s, 0, c];
}

/**
 * 눕히기 — **로컬 +Y(브릭의 위쪽)가 월드 어느 쪽을 보게 되나.**
 *
 *   0 그대로(위) · 1 오른쪽(+X) · 2 왼쪽(−X) · 3 앞(+Z) · 4 뒤(−Z) · 5 뒤집힘(아래)
 *
 * tip 0이 항등이라 `rot 0~3`이 기존과 같아진다 — 이 순서는 **바꾸면 안 된다**(저장값).
 */
const TIP: readonly RotMatrix[] = [
  [1, 0, 0, 0, 1, 0, 0, 0, 1],     // 0 그대로
  [0, -1, 0, 1, 0, 0, 0, 0, 1],    // 1 +X가 위 (Z축 +90°)
  [0, 1, 0, -1, 0, 0, 0, 0, 1],    // 2 −X가 위 (Z축 −90°)
  [1, 0, 0, 0, 0, -1, 0, 1, 0],    // 3 +Z가 위 (X축 +90°)
  [1, 0, 0, 0, 0, 1, 0, -1, 0],    // 4 −Z가 위 (X축 −90°)
  [1, 0, 0, 0, -1, 0, 0, 0, -1],   // 5 뒤집힘 (Z축 180°)
];

export const TIP_LABELS = ['그대로', '오른쪽으로', '왼쪽으로', '앞으로', '뒤로', '뒤집기'] as const;

function mul(a: RotMatrix, b: RotMatrix): RotMatrix {
  const o = new Array(9).fill(0) as number[];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
  }
  return o as unknown as RotMatrix;
}

/** 24개를 한 번만 만들어 둔다 (두 기준 각각) */
const VISUAL: readonly RotMatrix[] = Array.from({ length: ROT_COUNT }, (_, rot) =>
  mul(TIP[Math.floor(rot / 4)], spinYVisual(rot % 4)),
);
const PLACE: readonly RotMatrix[] = Array.from({ length: ROT_COUNT }, (_, rot) =>
  mul(TIP[Math.floor(rot / 4)], spinYPlace(rot % 4)),
);

const wrap = (rot: number): number => ((rot % ROT_COUNT) + ROT_COUNT) % ROT_COUNT;

/** **화면 기준** 회전 — 메시를 돌릴 때·꼭짓점 밝기를 짝지을 때 쓴다 */
export function rotMatrixVisual(rot: number): RotMatrix {
  return VISUAL[wrap(rot)];
}

/** **배치 기준** 회전 — 점유 범위·기준 칸을 구할 때 쓴다 */
export function rotMatrixPlace(rot: number): RotMatrix {
  return PLACE[wrap(rot)];
}

/**
 * 로컬 꼭짓점 → 월드 꼭짓점 번호 (`i + 2j + 4k`, i=+x·j=+y·k=+z).
 * **화면 기준**이다 — 밝기표(`CORNER_MAP`)가 이걸로 만들어진다.
 * 틀리면 에러 없이 **명암만 조용히 뒤집힌다**(D 계열).
 */
export function cornerMap(rot: number): number[] {
  const m = rotMatrixVisual(rot);
  return Array.from({ length: 8 }, (_, local) => {
    const l = [local & 1 ? 1 : -1, local & 2 ? 1 : -1, local & 4 ? 1 : -1];
    const w = [0, 1, 2].map((r) => m[r * 3] * l[0] + m[r * 3 + 1] * l[1] + m[r * 3 + 2] * l[2]);
    return (w[0] > 0 ? 1 : 0) + (w[1] > 0 ? 2 : 0) + (w[2] > 0 ? 4 : 0);
  });
}

/**
 * ★★ **이 방향이 격자에 정확히 앉는가.**
 *
 * 칸이 정육면체가 아니다 — 가로세로 `CELL_X = CELL_Z = 0.5m`인데 **높이 `CELL_Y = 0.2m`** (2.5 : 1).
 * 그래서 브릭을 **옆으로 눕히면** 세로였던 길이가 가로 칸에, 가로였던 길이가 세로 칸에 들어가야 하는데
 * 어느 쪽도 정수로 안 떨어진다:
 *
 *   브릭 높이 0.6m → 가로 칸 0.6 / 0.5 = **1.2칸**
 *   스터드 폭 0.5m → 세로 칸 0.5 / 0.2 = **2.5칸**
 *
 * → **점유 칸과 그려지는 크기가 어긋난다**(실측: 1×4를 눕히면 그린 것 0.60×0.50×2.00 vs 점유 1.50×0.20×2.00).
 *   화면에서는 브릭이 제 상자를 뚫고 나오고, 옆에 붙여도 틈이 뜬다.
 *
 * 세로가 세로로 남는 방향(그대로·뒤집기)만 정확하다. 가로끼리(X↔Z)는 칸 크기가 같아 안전하다.
 * ⚠️ `CELL_X !== CELL_Z`가 되면 이 판정도 같이 고쳐야 한다.
 *
 * (실제 레고도 같은 제약을 갖는다 — 브릭 9.6mm 높이 : 8mm 간격이라 옆으로 돌리면 스터드 격자에 안 맞고,
 *  그래서 전용 브래킷 부품이 따로 있다.)
 */
export function isGridExact(rot: number): boolean {
  return rotMatrixPlace(rot)[4] !== 0; // 월드 Y가 로컬 Y에서 온다 = 세로가 세로로 남는다
}

/** 격자에 정확히 앉는 눕히기만 — 지금은 `0`(그대로) · `5`(뒤집기) 둘뿐이다 */
export const EXACT_TIPS: readonly number[] =
  [0, 1, 2, 3, 4, 5].filter((tip) => isGridExact(tip * 4));

export const tipOf = (rot: number): number => Math.floor((((rot % ROT_COUNT) + ROT_COUNT) % ROT_COUNT) / 4);
export const spinOf = (rot: number): number => (((rot % ROT_COUNT) + ROT_COUNT) % ROT_COUNT) % 4;
export const makeRot = (tip: number, spin: number): number => (tip % 6) * 4 + (spin % 4);

/** 제자리로 한 번 더 돌린다(tip 유지) */
export const nextSpin = (rot: number): number => makeRot(tipOf(rot), spinOf(rot) + 1);
/** 눕히는 방향을 한 단계 바꾼다(spin 유지). **수학 전체** — 격자에 안 맞는 방향도 포함한다 */
export const nextTip = (rot: number): number => makeRot(tipOf(rot) + 1, spinOf(rot));

/**
 * 눕히는 방향을 한 단계 — **격자에 정확히 앉는 것만** 돈다. UI는 반드시 이걸 쓴다.
 * (`nextTip`은 옆으로 눕힌 방향까지 도는 순수 수학이라 화면에 내보내면 브릭이 상자를 뚫는다)
 */
export function nextExactTip(rot: number): number {
  const cur = EXACT_TIPS.indexOf(tipOf(rot));
  const next = EXACT_TIPS[(cur + 1) % EXACT_TIPS.length] ?? EXACT_TIPS[0];
  return makeRot(next, spinOf(rot));
}

/**
 * 월드 축마다 **어느 로컬 축에서 오고 부호가 뭔지**.
 * 24방향이 전부 부호 있는 축 교환이라 각 행에 0이 아닌 값이 딱 하나다.
 *
 * 반환 `[[로컬축, 부호], …]` — 월드 X·Y·Z 순서.
 *
 * ⚠️ **24개를 미리 만들어 두고 그 배열을 그대로 돌려준다** — 고치지 말 것.
 *   `extentOf`가 점유 검사·가시성·빛 계산에서 브릭당 수십 번 불리는 자리라
 *   호출마다 배열을 새로 만들면 그게 그대로 쓰레기가 된다.
 */
function computeAxisMap(rot: number): readonly (readonly [number, number])[] {
  const m = rotMatrixPlace(rot);
  const out: (readonly [number, number])[] = [];
  for (let w = 0; w < 3; w++) {
    for (let a = 0; a < 3; a++) {
      const v = m[w * 3 + a];
      if (v !== 0) { out.push([a, v]); break; }
    }
  }
  return out;
}

const AXIS_MAPS: readonly (readonly (readonly [number, number])[])[] =
  Array.from({ length: ROT_COUNT }, (_, rot) => computeAxisMap(rot));

export function axisMap(rot: number): readonly (readonly [number, number])[] {
  return AXIS_MAPS[wrap(rot)];
}

/**
 * 회전 후 점유 범위 — 로컬 크기 `[sx, h, sz]`를 월드 축으로 옮긴다.
 * 앵커는 항상 회전 후 AABB의 **최소 모서리**라, 크기만 자리를 바꾸면 된다.
 */
export function rotateExtent(local: [number, number, number], rot: number): [number, number, number] {
  const map = axisMap(rot);
  return [local[map[0][0]], local[map[1][0]], local[map[2][0]]];
}

/**
 * **기준 칸**(로컬 칸 0,0,0)이 회전 후 AABB 안 어디에 오는가 — 월드 축별 오프셋.
 *
 * 부호가 +면 최소쪽(0), −면 최대쪽(크기−1)으로 간다.
 * 이게 있어야 **R을 눌러도 겨눈 칸이 제자리에 붙어 있고** 브릭이 그 둘레를 돈다.
 */
export function rotatePivot(local: [number, number, number], rot: number): [number, number, number] {
  const map = axisMap(rot);
  const ext = rotateExtent(local, rot);
  return [0, 1, 2].map((w) => (map[w][1] > 0 ? 0 : ext[w] - 1)) as [number, number, number];
}
