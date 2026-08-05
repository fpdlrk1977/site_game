// 소품 라이브러리 — 기준: doc/BRICK_PLAN.md §22
//
// ★ 소품은 **미리 짜 둔 브릭 묶음**이다. 클릭 한 번에 통째로 놓이고, 놓고 나면 **그냥 브릭**이다
//   (묶음이라는 표시가 남지 않고 한 칸씩 지워진다 — §20과 같은 규칙).
//
// ★ 소품은 **자기 색·재료를 갖는다.** 팔레트에서 고른 색은 무시한다 —
//   그래야 "소품"이지 "붓"이 아니다(책상은 나무색, 침대 이불은 빨강).
//
// ★ 저장 포맷은 **아무것도 안 바뀐다.** 저장되는 건 결과 브릭뿐이라 소품은 순수 편집 도구다.

import { BRICK_CELLS_Y, type Rot } from './grid';
import { extentOf, PARTS, PLATE_CELLS_Y, type BrickPart, type MatClass, type PartId } from './parts';
import { rotMatrixVisual, spinOf } from './rotation';
import { unitsOf } from './units';

/** 소품 한 조각 — 좌표는 **로컬 칸**(회전 0 기준, 최소 모서리) */
export interface PropBrick {
  dx: number; dy: number; dz: number;
  part: PartId;
  /** 로컬 방향. 제자리회전(0~3)만 쓴다 */
  rot?: Rot;
  color: string;
  mat?: MatClass;
  /** 무늬(재료) 칸 번호 — `textures.ts`의 `BRICK_TEXTURES` */
  tex?: number;
}

export interface Prop {
  id: PropId;
  label: string;
  /** 바깥 상자(칸) — 놓을 자리 판정·표시가 이걸 쓴다 */
  sx: number; h: number; sz: number;
  bricks: PropBrick[];
}

export type PropId =
  | 'chair' | 'desk' | 'bed' | 'door' | 'window' | 'fence' | 'lamp';

/** 놓인 결과 — 월드에 그대로 넣을 수 있는 형태 */
export interface PropPlacement {
  part: PartId;
  x: number; y: number; z: number;
  rot: Rot;
  color: string;
  mat: MatClass;
  tex: number;
}

// ── 색 (소품이 들고 다니는 값) ────────────────────────────────────────────
const WOOD = '#8a5a2b';
const DARK_WOOD = '#5a3a1c';
const CLOTH = '#c0392b';
const WHITE = '#ffffff';
const METAL = '#a0a5a9';
const GLASS = '#cfe8f3';
const LAMP = '#ffe6a0';

// 무늬(재료) 칸 번호 — `textures.ts` 참고
const TEX_WOOD = 5;   // 나무
const TEX_LOG = 10;   // 원목
const TEX_GLASS = 8;  // 유리
const TEX_METAL = 19; // 금속판

const B = BRICK_CELLS_Y;  // 브릭 높이 3칸
const P = PLATE_CELLS_Y;  // 플레이트 높이 1칸

/**
 * 소품 카탈로그.
 *
 * ★ 세로 좌표는 **칸**이다: 브릭 한 장 = 3칸(0.6m) · 플레이트 = 1칸(0.2m).
 *   가로는 한 칸 0.5m라, 마인크래프트 블록(1m) 하나가 우리 2칸이다.
 *
 * ⚠️ 가는 파츠(기둥·봉·패널)는 **칸 가운데에 그려진다.** 그래서 "칸의 가장자리에 붙은 판"은 못 만든다 —
 *   등받이·머리판은 **좌판 뒤 칸**에 세워서 표현한다.
 */
export const PROPS: Record<PropId, Prop> = {
  // 의자 — 다리 한 대 위에 좌판, 뒤 칸에 등받이. 앞뒤가 있어 **회전 검증의 기준**이 된다
  chair: {
    id: 'chair', label: '의자', sx: 1, h: B + P + B, sz: 2,
    bricks: [
      { dx: 0, dy: 0, dz: 0, part: 'c1x1', color: DARK_WOOD, tex: TEX_LOG },       // 다리
      { dx: 0, dy: B, dz: 0, part: 'p1x1', color: WOOD, tex: TEX_WOOD },           // 좌판
      { dx: 0, dy: B + P, dz: 1, part: 'w1x1', rot: 1, color: WOOD, tex: TEX_WOOD }, // 등받이(뒤 칸)
    ],
  },

  // 책상 — 다리 둘에 상판 둘
  desk: {
    id: 'desk', label: '책상', sx: 2, h: B + P, sz: 1,
    bricks: [
      { dx: 0, dy: 0, dz: 0, part: 'c1x1', color: DARK_WOOD, tex: TEX_LOG },
      { dx: 1, dy: 0, dz: 0, part: 'c1x1', color: DARK_WOOD, tex: TEX_LOG },
      { dx: 0, dy: B, dz: 0, part: 'p1x1', color: WOOD, tex: TEX_WOOD },
      { dx: 1, dy: B, dz: 0, part: 'p1x1', color: WOOD, tex: TEX_WOOD },
    ],
  },

  // 침대 — 2×4칸(1m × 2m, 마인크래프트 침대와 같은 크기). 머리 쪽이 −Z
  bed: {
    id: 'bed', label: '침대', sx: 2, h: P * 2 + B, sz: 4,
    bricks: [
      // 프레임(아래 한 겹)
      ...gridPlates(2, 4, 0, DARK_WOOD, TEX_LOG),
      // 이불(위 한 겹) — 머리 쪽 한 줄만 흰 베개
      ...gridPlates(2, 3, P, CLOTH, 0, 1),
      { dx: 0, dy: P, dz: 0, part: 'p1x1', color: WHITE },
      { dx: 1, dy: P, dz: 0, part: 'p1x1', color: WHITE },
      // 머리판
      { dx: 0, dy: P * 2, dz: 0, part: 'w1x1', rot: 1, color: DARK_WOOD, tex: TEX_LOG },
      { dx: 1, dy: P * 2, dz: 0, part: 'w1x1', rot: 1, color: DARK_WOOD, tex: TEX_LOG },
    ],
  },

  // 문 — 패널 세 장을 쌓아 1.8m
  door: {
    id: 'door', label: '문', sx: 1, h: B * 3, sz: 1,
    bricks: [
      { dx: 0, dy: 0, dz: 0, part: 'w1x1', color: WOOD, tex: TEX_WOOD },
      { dx: 0, dy: B, dz: 0, part: 'w1x1', color: WOOD, tex: TEX_WOOD },
      { dx: 0, dy: B * 2, dz: 0, part: 'w1x1', color: WOOD, tex: TEX_WOOD },
    ],
  },

  // 창문 — 반투명 유리 패널 2×2칸(1m × 1.2m)
  window: {
    id: 'window', label: '창문', sx: 2, h: B * 2, sz: 1,
    bricks: [
      { dx: 0, dy: 0, dz: 0, part: 'w1x1', color: GLASS, mat: 'transparent', tex: TEX_GLASS },
      { dx: 1, dy: 0, dz: 0, part: 'w1x1', color: GLASS, mat: 'transparent', tex: TEX_GLASS },
      { dx: 0, dy: B, dz: 0, part: 'w1x1', color: GLASS, mat: 'transparent', tex: TEX_GLASS },
      { dx: 1, dy: B, dz: 0, part: 'w1x1', color: GLASS, mat: 'transparent', tex: TEX_GLASS },
    ],
  },

  // 울타리 — 기둥 둘 **사이 칸**에 가로봉 둘(위·아래).
  //   ⚠️ 기둥은 칸을 통째로(높이 3칸) 차지하므로 봉을 같은 칸에 못 넣는다 → 가운데 칸을 비워 둔다
  fence: {
    id: 'fence', label: '울타리', sx: 1, h: B, sz: 3,
    bricks: [
      { dx: 0, dy: 0, dz: 0, part: 'c1x1', color: WOOD, tex: TEX_LOG },
      { dx: 0, dy: 0, dz: 2, part: 'c1x1', color: WOOD, tex: TEX_LOG },
      { dx: 0, dy: 0, dz: 1, part: 'r1x1', color: WOOD, tex: TEX_WOOD }, // 아래 가로대
      { dx: 0, dy: 2, dz: 1, part: 'r1x1', color: WOOD, tex: TEX_WOOD }, // 위 가로대
    ],
  },

  // 가로등 — 기둥 위에 발광 블록. **발광 재질**이라 주변이 실제로 밝아진다
  lamp: {
    id: 'lamp', label: '가로등', sx: 1, h: B * 3 + B, sz: 1,
    bricks: [
      { dx: 0, dy: 0, dz: 0, part: 'c1x1', color: METAL, tex: TEX_METAL },
      { dx: 0, dy: B, dz: 0, part: 'c1x1', color: METAL, tex: TEX_METAL },
      { dx: 0, dy: B * 2, dz: 0, part: 'c1x1', color: METAL, tex: TEX_METAL },
      { dx: 0, dy: B * 3, dz: 0, part: 'b1x1', color: LAMP, mat: 'emissive' },
    ],
  },
};

/** 플레이트를 직사각형으로 깐다 — 침대처럼 넓은 면을 적을 때 */
function gridPlates(
  sx: number, sz: number, dy: number, color: string, tex = 0, z0 = 0,
): PropBrick[] {
  const out: PropBrick[] = [];
  for (let x = 0; x < sx; x++) for (let z = 0; z < sz; z++) {
    out.push({ dx: x, dy, dz: z0 + z, part: 'p1x1', color, tex });
  }
  return out;
}

export const PROP_LIST: Prop[] = Object.values(PROPS);

/**
 * 소품의 **바깥 상자**를 파츠처럼 다루기 위한 껍데기.
 *
 * ★ 배치·고스트·막힘 판정은 전부 `BrickPart`를 받게 통일해 뒀다. 소품은 카탈로그(`PARTS`)에 없고
 *   저장 인덱스도 없으므로, 여기서 즉석으로 만들어 넘긴다. **`PARTS`에 넣으면 안 된다** —
 *   `PART_ORDER`(저장 인덱스)와 길이가 어긋나고, 소품은 애초에 저장되는 물건이 아니다.
 */
const BOX_CACHE = new Map<PropId, BrickPart>();

export function propBox(id: PropId): BrickPart {
  let box = BOX_CACHE.get(id);
  if (!box) {
    const p = PROPS[id];
    box = { id: 'b1x1', label: p.label, kind: 'brick', sx: p.sx, sz: p.sz, h: p.h };
    BOX_CACHE.set(id, box);
  }
  return box;
}

/**
 * 소품을 **월드에 놓을 브릭들**로 펼친다. 앵커 `(x,y,z)`는 회전 후 바깥 상자의 최소 모서리다.
 *
 * ⚠️⚠️ **안쪽 배치는 화면 기준(`rotMatrixVisual`)으로 돌린다 — 여기가 D-6 함정 자리다.**
 *   메시는 화면 기준으로 도는데 배치를 배치 기준으로 하면 **좌우가 거울처럼 뒤집힌다**:
 *   의자 등받이가 반대쪽에 붙고, **에러는 안 난다.**
 *   두 기준은 **축이 같고 부호만** 다르므로(`BRICK_PITFALLS.md` D-6), 바깥 상자 크기는
 *   `extentOf`(배치 기준) 그대로 쓰고 **부호만** 여기서 화면 기준으로 가져온다.
 *
 * ★ 자식 방향은 `(로컬 방향 + 제자리회전) % 4`. 제자리회전끼리의 합성은 **두 기준에서 같은 식**이라
 *   여기엔 부호 문제가 없다(`spinYVisual(a)·spinYVisual(b) = spinYVisual(a+b)`, 배치 기준도 마찬가지).
 *
 * ★ 나온 브릭은 **`unitsOf`를 한 번 더 태운다** → 월드에는 1×1 단위만 들어간다(§20 규칙).
 */
export function bricksOfProp(id: PropId, x: number, y: number, z: number, rot: Rot): PropPlacement[] {
  const p = PROPS[id];
  const spin = spinOf(rot) as Rot;
  const local = [p.sx, p.h, p.sz];

  // 월드 축마다 [로컬 축, 부호] — **화면 기준**
  const m = rotMatrixVisual(spin);
  const map: [number, number][] = [];
  for (let w = 0; w < 3; w++) {
    for (let a = 0; a < 3; a++) {
      if (m[w * 3 + a] !== 0) { map.push([a, m[w * 3 + a]]); break; }
    }
  }

  const out: PropPlacement[] = [];
  for (const b of p.bricks) {
    const childRot = (((b.rot ?? 0) + spin) % 4) as Rot;
    const lo = [b.dx, b.dy, b.dz];
    const size = extentOf(PARTS[b.part], (b.rot ?? 0) as Rot); // 로컬 방향에서의 크기
    const c = [size.ex, size.ey, size.ez];

    // 월드 좌표: 부호가 −면 **구간째로 뒤집는다**(점이 아니라 상자라 크기를 빼야 한다)
    const at = [0, 0, 0];
    for (let w = 0; w < 3; w++) {
      const [a, s] = map[w];
      at[w] = s > 0 ? lo[a] : local[a] - lo[a] - c[a];
    }

    for (const u of unitsOf(b.part, x + at[0], y + at[1], z + at[2], childRot)) {
      out.push({
        part: u.part, x: u.x, y: u.y, z: u.z, rot: u.rot,
        color: b.color, mat: b.mat ?? 'opaque', tex: b.tex ?? 0,
      });
    }
  }
  return out;
}
