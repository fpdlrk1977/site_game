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
 * 제자리 회전(Y축) — **기존 코드와 같은 방향이어야 한다.**
 *
 * ⚠️ 방향(+90°냐 −90°냐)은 **손으로 유도하지 말 것.** `parts.ts`의 기존 `pivotOffset`이
 *   정답이고, `rotation.test.ts`가 rot 0~3에서 그것과 일치하는지 검사한다.
 *   내가 처음 유도했을 땐 부호가 반대로 나왔고, 테스트가 그걸 잡아 여기로 고정했다.
 */
function spinY(n: number): RotMatrix {
  // θ = −n·90° (기존 `pivotOffset` 표에 맞춘 방향)
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

/** 24개를 한 번만 만들어 둔다 */
const MATRICES: readonly RotMatrix[] = Array.from({ length: ROT_COUNT }, (_, rot) =>
  mul(TIP[Math.floor(rot / 4)], spinY(rot % 4)),
);

export function rotMatrix(rot: number): RotMatrix {
  return MATRICES[((rot % ROT_COUNT) + ROT_COUNT) % ROT_COUNT];
}

export const tipOf = (rot: number): number => Math.floor((((rot % ROT_COUNT) + ROT_COUNT) % ROT_COUNT) / 4);
export const spinOf = (rot: number): number => (((rot % ROT_COUNT) + ROT_COUNT) % ROT_COUNT) % 4;
export const makeRot = (tip: number, spin: number): number => (tip % 6) * 4 + (spin % 4);

/** 제자리로 한 번 더 돌린다(tip 유지) */
export const nextSpin = (rot: number): number => makeRot(tipOf(rot), spinOf(rot) + 1);
/** 눕히는 방향을 한 단계 바꾼다(spin 유지) */
export const nextTip = (rot: number): number => makeRot(tipOf(rot) + 1, spinOf(rot));

/**
 * 월드 축마다 **어느 로컬 축에서 오고 부호가 뭔지**.
 * 24방향이 전부 부호 있는 축 교환이라 각 행에 0이 아닌 값이 딱 하나다.
 *
 * 반환 `[[로컬축, 부호], …]` — 월드 X·Y·Z 순서.
 */
export function axisMap(rot: number): [number, number][] {
  const m = rotMatrix(rot);
  const out: [number, number][] = [];
  for (let w = 0; w < 3; w++) {
    for (let a = 0; a < 3; a++) {
      const v = m[w * 3 + a];
      if (v !== 0) { out.push([a, v]); break; }
    }
  }
  return out;
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
