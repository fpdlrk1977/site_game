// 브릭 파츠 카탈로그 — 기준: doc/BRICK_SYSTEM.md §5
//
// 파츠(형태) · 재질군 · 색은 서로 직교한다. 마인크래프트는 형태×재질이 곱해진
// 카탈로그(돌블록/돌계단/돌반블록…)라 종류가 수백인데, 여기선 N+M 정의로 N×M 조합이 나온다.

import { BRICK_CELLS_Y, type Rot } from './grid';

export type BrickPartId =
  | 'b1x1' | 'b1x2' | 'b1x3' | 'b1x4' | 'b1x6' | 'b1x8'
  | 'b2x2' | 'b2x3' | 'b2x4' | 'b2x6' | 'b2x8';
export type PlatePartId = 'p1x1' | 'p1x2' | 'p2x2' | 'p2x4' | 'p2x6';
export type PartId = BrickPartId | PlatePartId | 'terrain';

/** 재질군 — 셰이더·렌더 패스가 갈리는 단위. 색은 이 안에서 인스턴스마다 자유 */
export type MatClass = 'opaque' | 'transparent' | 'emissive';

/** 파츠 갈래 — UI 분류용. 지형은 사용자가 못 고른다 */
export type PartKind = 'brick' | 'plate' | 'terrain';

/**
 * 플레이트 높이 = 1칸 = **브릭의 ⅓**.
 *
 * ★ 얇은 것을 만들 수 있느냐가 표현력을 가른다 — 책상 상판·바닥 마감·창틀·계단 디테일이
 *   플레이트 없이는 전부 0.6m 덩어리가 된다. 3장 쌓으면 브릭 하나 높이(레고와 같은 규칙).
 */
export const PLATE_CELLS_Y = 1;

export interface BrickPart {
  id: PartId;
  label: string;
  kind: PartKind;
  /** 스터드 개수 (회전 0 기준) */
  sx: number;
  sz: number;
  /** 높이(셀) */
  h: number;
}

const brick = (sx: number, sz: number): BrickPart => ({
  id: `b${sx}x${sz}` as PartId, label: `${sx}×${sz}`, kind: 'brick', sx, sz, h: BRICK_CELLS_Y,
});
const plate = (sx: number, sz: number): BrickPart => ({
  id: `p${sx}x${sz}` as PartId, label: `${sx}×${sz}`, kind: 'plate', sx, sz, h: PLATE_CELLS_Y,
});

export const PARTS: Record<PartId, BrickPart> = {
  b1x1: brick(1, 1), b1x2: brick(1, 2), b1x3: brick(1, 3), b1x4: brick(1, 4),
  b1x6: brick(1, 6), b1x8: brick(1, 8),
  b2x2: brick(2, 2), b2x3: brick(2, 3), b2x4: brick(2, 4), b2x6: brick(2, 6), b2x8: brick(2, 8),

  p1x1: plate(1, 1), p1x2: plate(1, 2), p2x2: plate(2, 2), p2x4: plate(2, 4), p2x6: plate(2, 6),

  // 지형(바닥) 블록 — 2×2 격자. 돌기가 없고, 파낼 수 있다.
  //   1×1로 깔면 블록 수가 4배라 2×2로 잡았다(1m × 0.6m × 1m).
  terrain: { id: 'terrain', label: '지형', kind: 'terrain', sx: 2, sz: 2, h: BRICK_CELLS_Y },
};

/** 사용자가 고를 수 있는 파츠 — 지형은 배치 대상이 아니라 제외 */
export const PART_LIST: BrickPart[] = Object.values(PARTS).filter((p) => p.kind !== 'terrain');

/** UI 분류 — 갈래별 목록 */
export const PART_KINDS: { id: Exclude<PartKind, 'terrain'>; label: string; note: string }[] = [
  { id: 'brick', label: '브릭', note: '높이 3칸 (0.6m)' },
  { id: 'plate', label: '플레이트', note: '높이 1칸 (0.2m) — 브릭의 ⅓' },
];

export const partsOfKind = (kind: PartKind): BrickPart[] => PART_LIST.filter((p) => p.kind === kind);

/** 지형 블록의 격자 간격(스터드). 지형은 이 배수 좌표에만 놓인다 */
export const TERRAIN_STEP = 2;

export const MAT_CLASSES: { id: MatClass; label: string }[] = [
  { id: 'opaque', label: '불투명' },
  { id: 'transparent', label: '반투명' },
  { id: 'emissive', label: '발광' },
];

export interface Extent { ex: number; ey: number; ez: number }

/**
 * 회전을 반영한 점유 범위(셀 단위).
 * 앵커는 항상 회전 후 AABB의 **최소 모서리**라, 90/270도면 X/Z 범위만 뒤바뀐다.
 * → 점유 검사가 회전과 무관하게 단순해진다.
 */
export function extentOf(part: BrickPart, rot: Rot): Extent {
  const swap = rot === 1 || rot === 3;
  return { ex: swap ? part.sz : part.sx, ey: part.h, ez: swap ? part.sx : part.sz };
}
