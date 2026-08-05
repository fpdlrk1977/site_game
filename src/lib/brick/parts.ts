// 브릭 파츠 카탈로그 — 기준: doc/BRICK_SYSTEM.md §5
//
// 파츠(형태) · 재질군 · 색은 서로 직교한다. 마인크래프트는 형태×재질이 곱해진
// 카탈로그(돌블록/돌계단/돌반블록…)라 종류가 수백인데, 여기선 N+M 정의로 N×M 조합이 나온다.

import { BRICK_CELLS_Y, type Rot } from './grid';
import { ROT_COUNT, rotateExtent, rotatePivot } from './rotation';

export type BrickPartId =
  | 'b1x1' | 'b1x2' | 'b1x3' | 'b1x4' | 'b1x6' | 'b1x8'
  | 'b2x2' | 'b2x3' | 'b2x4' | 'b2x6' | 'b2x8';
export type PlatePartId = 'p1x1' | 'p1x2' | 'p2x2' | 'p2x4' | 'p2x6';
/**
 * 경사 — **삭제됨(2026-08-05, 사용자 지시).** id만 남는다.
 *
 * ★ 지우면 안 되는 이유: `PART_ORDER`는 **저장 인덱스**라, 중간에서 빼면 그 뒤 파츠가 전부 한 칸씩 밀려
 *   **이미 저장된 월드가 통째로 다른 파츠로 읽힌다**(B-2). 그래서 껍데기만 남긴다 —
 *   UI엔 안 나오고(`legacy`), 불러오면 `b1x1` 블록으로 바뀐다(`unit`).
 */
export type SlopePartId = 's1x1' | 'si1x1' | 's1x2' | 's2x2' | 'si1x2';
/**
 * 가는 파츠 — 칸은 차지하되 **그리는 모양만 얇다**. 가구·난간·창틀용.
 *   `c`=기둥(세로 봉) · `r`=가로봉 · `w`=패널(얇은 벽)
 */
export type ThinPartId = 'c1x1' | 'r1x1' | 'r1x2' | 'r1x4' | 'w1x1' | 'w1x2' | 'w1x4';
export type PartId = BrickPartId | PlatePartId | SlopePartId | ThinPartId | 'terrain';

/** 재질군 — 셰이더·렌더 패스가 갈리는 단위. 색은 이 안에서 인스턴스마다 자유 */
export type MatClass = 'opaque' | 'transparent' | 'emissive';

/** 파츠 갈래 — UI 분류용. 지형은 사용자가 못 고른다 */
export type PartKind = 'brick' | 'plate' | 'slope' | 'thin' | 'terrain';

/**
 * 브릭의 **생김새**. 점유 칸(AABB)은 그대로고 그리는 모양만 달라진다.
 *
 * ★ `thin`은 **이웃 면을 감추지 않는다**(non-occluding).
 *   가시성 규칙은 "표면에 닿은 칸이 전부 차 있으면 안 그린다"인데, 얇은 파츠는 칸을 차지하면서도
 *   **옆이 뚫려 있어** 그 너머가 보인다. 감춰 버리면 그 자리에 **구멍**이 뚫린 것처럼 보인다.
 */
export type PartShape = 'box' | 'thin';

/**
 * 가는 파츠가 **실제로 그려지는 크기**(m). 점유 칸은 그대로 두고 메시만 얇게 만든다.
 *
 * ★ 왜 칸을 안 줄이나: 가로 최소 단위가 **0.5m**라 그보다 얇은 칸은 만들 수 없다(A-5와 같은 이유).
 *   레고도 격자를 바꾸는 대신 **얇게 생긴 부품**을 늘린다. 칸은 그대로라 배치·저장·충돌이 전부 그대로다.
 */
export interface ThinSize {
  /** X 두께(m). 미지정 = 칸 전체 */
  x?: number;
  /** Y 두께(m). 미지정 = 칸 전체 */
  y?: number;
  /** Z 두께(m). 미지정 = 칸 전체 */
  z?: number;
}

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
  /** `shape: 'thin'`일 때 실제로 그리는 크기(m). 점유 칸은 `sx·h·sz` 그대로다 */
  thin?: ThinSize;
  /**
   * 이 파츠를 이루는 **1칸 단위**(`BRICK_PLAN.md` §20). 자기 자신이면 더 안 쪼개진다.
   *
   * ★ 큰 파츠는 **부품이 아니라 붓 크기(도장)** 다 — `2×4`를 놓으면 `b1x1` 여덟 개가 놓인다.
   *   그래야 칸마다 테두리가 보이고(마인크래프트처럼), **한 칸씩 지울 수** 있다.
   *   실제로 월드·저장소에 들어가는 레코드는 **단위뿐**이다(옛 저장물 제외).
   *
   * ⚠️ **id 접두어로 유추하지 말 것.** 새 파츠를 넣을 때 조용히 틀린다 — 여기 명시한다.
   */
  unit?: PartId;
  /**
   * 옛 저장물에만 남아 있는 파츠 — **UI에서 고를 수 없다**(새로 못 놓는다).
   * 카탈로그에는 남겨 둔다: 지워 버리면 이미 저장된 월드가 안 읽힌다.
   */
  legacy?: boolean;
}

/**
 * **삭제된 경사의 껍데기** (2026-08-05, 사용자 지시 *"경사는 삭제하고"*).
 *
 * 쐐기 메시·UI·배치 경로는 전부 지웠다. 여기 남는 건 **저장 인덱스를 붙잡아 두기 위한 id뿐**이다
 * (`SlopePartId` 주석 참고). 지어 둔 지붕은 불러올 때 `b1x1` 블록으로 바뀐다.
 */
const goneSlope = (id: SlopePartId, sx: number, sz: number): BrickPart => ({
  id, label: id, kind: 'slope', sx, sz, h: BRICK_CELLS_Y, unit: 'b1x1', legacy: true,
});

const brick = (sx: number, sz: number): BrickPart => ({
  id: `b${sx}x${sz}` as PartId, label: `${sx}×${sz}`, kind: 'brick', sx, sz, h: BRICK_CELLS_Y,
  unit: 'b1x1',
});
const plate = (sx: number, sz: number): BrickPart => ({
  id: `p${sx}x${sz}` as PartId, label: `${sx}×${sz}`, kind: 'plate', sx, sz, h: PLATE_CELLS_Y,
  unit: 'p1x1',
});

/** 가는 파츠 — 칸은 정수 그대로, 그리는 크기만 `thin`으로 준다 */
const thin = (
  id: ThinPartId, label: string, sx: number, h: number, sz: number, size: ThinSize, unit: PartId,
): BrickPart => ({ id, label, kind: 'thin', sx, sz, h, shape: 'thin', thin: size, unit });

/** 기둥·가로봉의 굵기(m) — 레고 봉(3.2mm/8mm ≈ 0.4칸)에 맞춰 0.2m */
const ROD = 0.2;
/** 패널 두께(m) — 유리 한 장 느낌. 너무 얇으면 비스듬히 볼 때 사라진다 */
const PANEL = 0.1;

export const PARTS: Record<PartId, BrickPart> = {
  b1x1: brick(1, 1), b1x2: brick(1, 2), b1x3: brick(1, 3), b1x4: brick(1, 4),
  b1x6: brick(1, 6), b1x8: brick(1, 8),
  b2x2: brick(2, 2), b2x3: brick(2, 3), b2x4: brick(2, 4), b2x6: brick(2, 6), b2x8: brick(2, 8),

  p1x1: plate(1, 1), p1x2: plate(1, 2), p2x2: plate(2, 2), p2x4: plate(2, 4), p2x6: plate(2, 6),

  // 경사 — **삭제됨.** id만 남아 옛 저장물을 읽고, 읽는 즉시 `b1x1`로 바뀐다
  s1x1: goneSlope('s1x1', 1, 1), si1x1: goneSlope('si1x1', 1, 1),
  s1x2: goneSlope('s1x2', 1, 2), s2x2: goneSlope('s2x2', 2, 2), si1x2: goneSlope('si1x2', 1, 2),

  // ── 가는 파츠 (2026-08-04) — 가구·난간·창틀. `BRICK_PLAN.md` §19 ──────────
  // 칸은 정수 그대로라 배치·저장·충돌이 전부 기존 코드로 처리된다. 얇은 건 **그리는 모양뿐**이다.
  c1x1: thin('c1x1', '기둥', 1, BRICK_CELLS_Y, 1, { x: ROD, z: ROD }, 'c1x1'),
  // 가로봉은 **눕힌 기둥**이다 — 회전으로는 격자에 안 맞아(A-5) 별도 파츠로 만든다(결정 ⑥)
  r1x1: thin('r1x1', '봉 1×1', 1, PLATE_CELLS_Y, 1, { x: ROD, y: ROD }, 'r1x1'),
  r1x2: thin('r1x2', '봉 1×2', 1, PLATE_CELLS_Y, 2, { x: ROD, y: ROD }, 'r1x1'),
  r1x4: thin('r1x4', '봉 1×4', 1, PLATE_CELLS_Y, 4, { x: ROD, y: ROD }, 'r1x1'),
  w1x1: thin('w1x1', '패널 1×1', 1, BRICK_CELLS_Y, 1, { x: PANEL }, 'w1x1'),
  w1x2: thin('w1x2', '패널 1×2', 1, BRICK_CELLS_Y, 2, { x: PANEL }, 'w1x1'),
  w1x4: thin('w1x4', '패널 1×4', 1, BRICK_CELLS_Y, 4, { x: PANEL }, 'w1x1'),

  // 지형(바닥) 블록 — 2×2 격자. 돌기가 없고, 파낼 수 있다.
  //   1×1로 깔면 블록 수가 4배라 2×2로 잡았다(1m × 0.6m × 1m).
  terrain: { id: 'terrain', label: '지형', kind: 'terrain', sx: 2, sz: 2, h: BRICK_CELLS_Y },
};

/**
 * 배치 가능한 파츠 전부 — 지형은 배치 대상이 아니라 제외.
 *
 * ⚠️ **`legacy`도 들어 있다.** 옛 저장물에 남아 있으므로 저장·조명·가시성 테스트는 이 목록을 전수로 돌아야 한다.
 *   사용자에게 보여줄 목록은 `partsOfKind`(= `legacy` 제외)를 쓸 것.
 */
export const PART_LIST: BrickPart[] = Object.values(PARTS).filter((p) => p.kind !== 'terrain');

/**
 * 이 파츠를 **균일하게 채우는 1칸 단위**. 자기 자신을 내면 그 방식으로는 안 쪼개진다(1칸 파츠 · 경사 · 지형).
 *
 * ⚠️ **"안 쪼개진다"와 뜻이 같지 않다.** 옛 2칸 경사는 균일 단위가 없어서 여기선 자기 자신을 내지만,
 *   `unitsOf`가 **계단꼴(브릭 + 1칸 경사)로 바꿔** 넣는다. 실제로 월드에 들어가는 레코드는 그쪽이 정답이다.
 */
export const unitOf = (part: PartId): PartId => PARTS[part].unit ?? part;

/** UI 분류 — 갈래별 목록 */
export const PART_KINDS: { id: Exclude<PartKind, 'terrain'>; label: string; note: string }[] = [
  { id: 'brick', label: '브릭', note: '높이 3칸 (0.6m) — 큰 것은 1×1을 한 번에 여러 개 놓는다' },
  { id: 'plate', label: '플레이트', note: '높이 1칸 (0.2m) — 브릭의 ⅓' },
  { id: 'thin', label: '가는것', note: '기둥·봉·패널 — 가구·난간·창틀용. 칸은 그대로 차지한다' },
];

/**
 * 이 파츠가 **이웃 면을 감추는가**.
 * 가는 파츠는 옆이 뚫려 있어 감추면 그 너머에 구멍이 뚫린 것처럼 보인다.
 */
export const occludes = (part: PartId): boolean => (PARTS[part].shape ?? 'box') === 'box';

/** UI 목록 — **옛 저장물 전용 파츠는 뺀다**(새로 놓을 수 없다) */
export const partsOfKind = (kind: PartKind): BrickPart[] =>
  PART_LIST.filter((p) => p.kind === kind && !p.legacy);

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
 * 앵커는 항상 회전 후 AABB의 **최소 모서리**라, 크기만 축을 바꿔 옮기면 된다.
 * → 점유 검사가 회전과 무관하게 단순해진다.
 *
 * ★ **세우면 높이가 바뀐다** — 1×4를 세우면 `ey`가 3이 아니라 4가 된다.
 *   예전엔 `ey`가 늘 `part.h`였다(Y축 회전뿐이라 세로가 안 변했다).
 *   높이를 `part.h`로 직접 읽는 코드를 새로 만들지 말 것 — 반드시 여기를 거친다.
 *
 * ⚠️ **돌려주는 객체는 캐시된 것이라 공유된다**(호출 지점이 많아 매번 새로 만들면 그게 다 쓰레기가 된다).
 *   그래서 얼려 두었다 — 값을 고쳐 쓰지 말고 필요하면 복사할 것.
 */
const EXTENT_CACHE = new Map<BrickPart, Extent[]>();

export function extentOf(part: BrickPart, rot: Rot): Extent {
  let byRot = EXTENT_CACHE.get(part);
  if (!byRot) { byRot = new Array<Extent>(ROT_COUNT); EXTENT_CACHE.set(part, byRot); }
  let e = byRot[rot];
  if (e === undefined) {
    const [ex, ey, ez] = rotateExtent([part.sx, part.h, part.sz], rot);
    e = Object.freeze({ ex, ey, ez });
    byRot[rot] = e;
  }
  return e;
}

/**
 * **기준 칸(꼭지점)** 이 회전 후 AABB 안 어디에 오는가 — 셀 단위 오프셋 `[dx, dy, dz]`.
 *
 * ★ 이게 없으면 긴 브릭이 **항상 +X/+Z 쪽으로만 자란다.** 앵커가 늘 최소 모서리라서다.
 *   기준 칸을 회전과 함께 돌리면 겨눈 칸이 제자리에 붙어 있고 브릭이 그 둘레로 돈다.
 *
 * ★ **세로(`dy`)가 생긴 이유**: 눕히면 기준 칸이 위아래로도 밀린다.
 *   눕히기 0(=rot 0~3)에서는 항상 0이라 **기존 동작은 그대로**다.
 */
const PIVOT_CACHE = new Map<BrickPart, (readonly [number, number, number])[]>();

export function pivotOffset(part: BrickPart, rot: Rot): readonly [number, number, number] {
  let byRot = PIVOT_CACHE.get(part);
  if (!byRot) { byRot = new Array<readonly [number, number, number]>(ROT_COUNT); PIVOT_CACHE.set(part, byRot); }
  let p = byRot[rot];
  if (p === undefined) {
    p = Object.freeze(rotatePivot([part.sx, part.h, part.sz], rot)) as readonly [number, number, number];
    byRot[rot] = p;
  }
  return p;
}
