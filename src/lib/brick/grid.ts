// 브릭 격자 좌표계 — 기준: doc/BRICK_SYSTEM.md §3.1
//
// ★ 여기 수치는 되돌릴 수 없다. y 값은 "몇 번째 칸"이라는 정수로 저장되므로,
//   셀 높이를 바꾸면 저장된 모든 브릭이 엉뚱한 높이로 내려앉는다.

/** 셀 크기(m). X/Z = 스터드 간격, Y = 플레이트 높이. 비율 2.5:1 = 실제 레고(8mm : 3.2mm) */
export const CELL_X = 0.5;
export const CELL_Y = 0.2;
export const CELL_Z = 0.5;

/** 브릭 1개의 높이(셀). 플레이트 3장 = 0.6m. 얇은 플레이트(1칸)는 P4에서 추가 */
export const BRICK_CELLS_Y = 3;

/** 세로 범위 512칸 = 지하 12.8m ~ 지상 89.4m */
export const Y_MIN = -64;
export const Y_MAX = 447;

/**
 * 브릭 방향 24가지 — `rot = 눕히기(6) × 4 + 제자리회전(4)`. 표와 규칙은 `rotation.ts`.
 *
 * ★ **0~3은 예전과 똑같은 Y축 90° 회전**이다(눕히기 0 = 안 눕힘).
 *   저장된 월드가 이 번호를 그대로 쓰고 있으므로 **0~3의 뜻은 절대 바꾸지 않는다.**
 */
export type Rot =
  | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11
  | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23;

// ── 셀 좌표 ↔ 단일 숫자 키 ───────────────────────────────────────────────
// 문자열 키(`${x},${y},${z}`)는 매 조회마다 문자열을 만들어 낸다. 가시성 계산이
// 브릭당 수십~수백 번 조회하므로 숫자 키로 둔다.
//   x,z = 21비트(±1,048,576) · y = 10비트(0..1023) → 합 52비트 (double 정수 한계 2^53 이내)
const XZ_BIAS = 1 << 20;
const XZ_SPAN = 1 << 21;
const Y_SPAN = 1 << 10;

export function cellKey(x: number, y: number, z: number): number {
  return ((x + XZ_BIAS) * XZ_SPAN + (z + XZ_BIAS)) * Y_SPAN + (y - Y_MIN);
}

/** 기둥(XZ 열) 키 — "이 자리에서 가장 높은 브릭 윗면"을 캐시하는 데 쓴다 */
export function colKey(x: number, z: number): number {
  return (x + XZ_BIAS) * XZ_SPAN + (z + XZ_BIAS);
}

/** 기둥 키 → 셀 좌표 (기둥 맵을 순회할 때 좌표를 되찾는 용도) */
export function colKeyX(k: number): number { return Math.floor(k / XZ_SPAN) - XZ_BIAS; }
export function colKeyZ(k: number): number { return (k % XZ_SPAN) - XZ_BIAS; }

/**
 * 이웃 기둥 키는 **더하기 한 번**으로 얻는다 — `colKey(x±1, z)` / `colKey(x, z±1)`와 같다.
 * 기둥 맵을 크게 순회할 때 좌표 복원 + 키 재계산 비용이 실측으로 무시할 수 없어서 둔다.
 */
export const COL_STEP_X = XZ_SPAN;
export const COL_STEP_Z = 1;

// ── 청크 ─────────────────────────────────────────────────────────────────
// 저장·스트리밍의 단위. 세로 512칸 ÷ 32 = 16 청크층.
// 물리 크기 8m × 6.4m × 8m (Y 셀이 1/3이라 대략 정육면체가 된다).
export const CHUNK_X = 16;
export const CHUNK_Y = 32;
export const CHUNK_Z = 16;

/** 셀 좌표가 속한 청크 (음수 좌표도 안전 — Math.floor가 −쪽으로 내림) */
export function chunkOfX(x: number): number { return Math.floor(x / CHUNK_X); }
export function chunkOfY(y: number): number { return Math.floor((y - Y_MIN) / CHUNK_Y); }
export function chunkOfZ(z: number): number { return Math.floor(z / CHUNK_Z); }

/** 청크 원점(최소 모서리)의 셀 좌표 */
export function chunkOriginX(cx: number): number { return cx * CHUNK_X; }
export function chunkOriginY(cy: number): number { return cy * CHUNK_Y + Y_MIN; }
export function chunkOriginZ(cz: number): number { return cz * CHUNK_Z; }

/** 청크 키 — cy는 0..15(세로 512÷32)라 좁게 잡아도 된다 */
export function chunkKey(cx: number, cy: number, cz: number): number {
  return ((cx + XZ_BIAS) * XZ_SPAN + (cz + XZ_BIAS)) * 64 + cy;
}

export interface ChunkCoord { cx: number; cy: number; cz: number }

export function chunkCoordOf(x: number, y: number, z: number): ChunkCoord {
  return { cx: chunkOfX(x), cy: chunkOfY(y), cz: chunkOfZ(z) };
}

// ── 리전 ─────────────────────────────────────────────────────────────────
// **렌더 배칭**의 단위. 청크(저장 단위)와 일부러 다르게 둔다.
//
//   청크마다 InstancedMesh를 만들면 draw call이 폭발하고(507청크 × 그룹수),
//   반대로 월드 전체를 하나로 묶으면 three가 오브젝트 단위로 컬링하므로
//   **화면 밖 지오메트리도 매 프레임 전부 처리**한다(12만 브릭 실측에서 확인된 병목).
//   → 그 사이의 크기로 잘라 프러스텀 컬링이 실제로 먹게 한다.
//
// 4×4×4 청크 = 64×128×64 셀 = 32m × 25.6m × 32m.
export const REGION_CHUNKS = 4;
export const REGION_X = CHUNK_X * REGION_CHUNKS;
export const REGION_Y = CHUNK_Y * REGION_CHUNKS;
export const REGION_Z = CHUNK_Z * REGION_CHUNKS;

export interface RegionCoord { rx: number; ry: number; rz: number }

export function regionCoordOf(x: number, y: number, z: number): RegionCoord {
  return {
    rx: Math.floor(x / REGION_X),
    ry: Math.floor((y - Y_MIN) / REGION_Y),
    rz: Math.floor(z / REGION_Z),
  };
}

export function regionKey(rx: number, ry: number, rz: number): number {
  return ((rx + XZ_BIAS) * XZ_SPAN + (rz + XZ_BIAS)) * 64 + ry;
}

export function regionKeyOf(x: number, y: number, z: number): number {
  const r = regionCoordOf(x, y, z);
  return regionKey(r.rx, r.ry, r.rz);
}

/** 셀의 최소 모서리 월드 좌표 */
export function cellMinWorld(x: number, y: number, z: number): [number, number, number] {
  return [x * CELL_X, y * CELL_Y, z * CELL_Z];
}

/** 월드 좌표 → 그 점이 속한 셀 */
export function worldToCellX(wx: number): number { return Math.floor(wx / CELL_X); }
export function worldToCellY(wy: number): number { return Math.floor(wy / CELL_Y); }
export function worldToCellZ(wz: number): number { return Math.floor(wz / CELL_Z); }

/** 6방향 이웃 오프셋 (가시성·인접 배치 계산용) */
export const DIRS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 0], [-1, 0, 0],
  [0, 1, 0], [0, -1, 0],
  [0, 0, 1], [0, 0, -1],
];
