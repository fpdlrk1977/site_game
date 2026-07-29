// 브릭 파츠 카탈로그 — 기준: doc/BRICK_SYSTEM.md §5
//
// 파츠(형태) · 재질군 · 색은 서로 직교한다. 마인크래프트는 형태×재질이 곱해진
// 카탈로그(돌블록/돌계단/돌반블록…)라 종류가 수백인데, 여기선 N+M 정의로 N×M 조합이 나온다.

import { BRICK_CELLS_Y, type Rot } from './grid';

export type PartId = 'b1x1' | 'b1x2' | 'b2x2' | 'b2x4';

/** 재질군 — 셰이더·렌더 패스가 갈리는 단위. 색은 이 안에서 인스턴스마다 자유 */
export type MatClass = 'opaque' | 'transparent' | 'emissive';

export interface BrickPart {
  id: PartId;
  label: string;
  /** 스터드 개수 (회전 0 기준) */
  sx: number;
  sz: number;
  /** 높이(셀) */
  h: number;
}

export const PARTS: Record<PartId, BrickPart> = {
  b1x1: { id: 'b1x1', label: '1×1', sx: 1, sz: 1, h: BRICK_CELLS_Y },
  b1x2: { id: 'b1x2', label: '1×2', sx: 1, sz: 2, h: BRICK_CELLS_Y },
  b2x2: { id: 'b2x2', label: '2×2', sx: 2, sz: 2, h: BRICK_CELLS_Y },
  b2x4: { id: 'b2x4', label: '2×4', sx: 2, sz: 4, h: BRICK_CELLS_Y },
};

export const PART_LIST: BrickPart[] = [PARTS.b1x1, PARTS.b1x2, PARTS.b2x2, PARTS.b2x4];

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
