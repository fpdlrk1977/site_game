// 브릭 파츠 카탈로그 — 기준: doc/BRICK_SYSTEM.md §5
//
// 파츠(형태) · 재질군 · 색은 서로 직교한다. 마인크래프트는 형태×재질이 곱해진
// 카탈로그(돌블록/돌계단/돌반블록…)라 종류가 수백인데, 여기선 N+M 정의로 N×M 조합이 나온다.

import { BRICK_CELLS_Y, type Rot } from './grid';

export type BrickPartId =
  | 'b1x1' | 'b1x2' | 'b1x3' | 'b1x4' | 'b1x6' | 'b1x8'
  | 'b2x2' | 'b2x3' | 'b2x4' | 'b2x6' | 'b2x8';
export type PlatePartId = 'p1x1' | 'p1x2' | 'p2x2' | 'p2x4' | 'p2x6';
/** 경사 — `s`=지붕처럼 내려가는 쐐기, `si`=뒤집힌 쐐기(처마·계단 마감) */
export type SlopePartId = 's1x2' | 's2x2' | 'si1x2';
export type PartId = BrickPartId | PlatePartId | SlopePartId | 'terrain';

/** 재질군 — 셰이더·렌더 패스가 갈리는 단위. 색은 이 안에서 인스턴스마다 자유 */
export type MatClass = 'opaque' | 'transparent' | 'emissive';

/** 파츠 갈래 — UI 분류용. 지형은 사용자가 못 고른다 */
export type PartKind = 'brick' | 'plate' | 'slope' | 'terrain';

/**
 * 브릭의 **생김새**. 점유 칸(AABB)은 그대로고 그리는 모양만 달라진다.
 *
 * ★ `slope`/`slopeInv`는 **이웃 면을 감추지 않는다**(non-occluding).
 *   지금 가시성 규칙은 "표면에 닿은 칸이 전부 차 있으면 안 그린다"인데,
 *   경사는 칸을 차지하면서도 **대각선이 뚫려 있어** 그 너머가 보인다.
 *   감춰 버리면 경사 옆·아래에 **구멍**이 뚫린 것처럼 보인다(마인크래프트가 계단·반블록에 쓰는 규칙과 같다).
 */
export type PartShape = 'box' | 'slope' | 'slopeInv';

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
  /** 생김새. 미지정 = 상자(기존 파츠 전부 무변경) */
  shape?: PartShape;
}

/** 경사면이 내려가는 방향은 **+Z**(회전 0 기준). `R`로 네 방향을 만든다 */
const slope = (sx: number, sz: number, shape: PartShape): BrickPart => ({
  id: `${shape === 'slopeInv' ? 'si' : 's'}${sx}x${sz}` as PartId,
  label: `${shape === 'slopeInv' ? '역' : ''}${sx}×${sz}`,
  kind: 'slope', sx, sz, h: BRICK_CELLS_Y, shape,
});

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

  s1x2: slope(1, 2, 'slope'), s2x2: slope(2, 2, 'slope'), si1x2: slope(1, 2, 'slopeInv'),

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
  { id: 'slope', label: '경사', note: '지붕·언덕 마감. R로 방향을 돌린다 · 돌기 없음' },
];

/** 이 파츠가 **이웃 면을 감추는가**. 경사는 대각선이 뚫려 있어 감추면 구멍처럼 보인다 */
export const occludes = (part: PartId): boolean => (PARTS[part].shape ?? 'box') === 'box';

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

/**
 * **기준 칸(꼭지점)** 이 회전 후 AABB 안 어디에 오는가 — 셀 단위 오프셋 `[dx, dz]`.
 *
 * ★ 이게 없으면 긴 브릭이 **항상 +X/+Z 쪽으로만 자란다.** 앵커가 늘 최소 모서리라서다.
 *   게다가 `extentOf`는 회전 0·2가 같은 값이라, 1×3 브릭은 R을 눌러도 **두 방향밖에 안 나온다.**
 *   기준 칸을 회전과 함께 돌리면 겨눈 칸이 제자리에 붙어 있고 나머지가 **위→오른쪽→아래→왼쪽**으로 돈다.
 *
 * 로컬 칸 (0,0)이 회전 후 가는 모서리:
 *   rot 0 → 최소(0,0) · rot 1 → (ex−1, 0) · rot 2 → (ex−1, ez−1) · rot 3 → (0, ez−1)
 */
export function pivotOffset(part: BrickPart, rot: Rot): [number, number] {
  const e = extentOf(part, rot);
  switch (rot) {
    case 1: return [e.ex - 1, 0];
    case 2: return [e.ex - 1, e.ez - 1];
    case 3: return [0, e.ez - 1];
    default: return [0, 0];
  }
}
