// 데모 방 — 기준: doc/BRICK_PLAN.md §23
//
// ★ 왜 있나: 이 프로젝트는 **한 바퀴를 완주해 본 적이 없다** — 짓고 · 들어가 보고 · 판단하는 흐름.
//   기능은 쌓였는데 "그래서 이게 좋은가"를 볼 완성된 장면이 하나도 없었다.
//   그래서 **방 하나를 통째로 만들어 주는 버튼**을 둔다. 걷기(§6)와 짝이다.
//
// ★ 여기는 **순수 함수뿐**이다 — 좌표만 낸다. 월드에 넣는 건 스토어가 한다.

import { BRICK_CELLS_Y } from './grid';
import type { MatClass, PartId } from './parts';
import { bricksOfProp, type PropId } from './props';
import { unitsOf } from './units';

export interface RoomBrick {
  part: PartId;
  x: number; y: number; z: number;
  rot: 0 | 1 | 2 | 3;
  color: string;
  mat: MatClass;
  tex: number;
}

const B = BRICK_CELLS_Y; // 브릭 한 장 = 3칸

// 색·재료
const FLOOR = '#8a5a2b';   const TEX_WOOD = 5;
const WALL = '#e8e0d0';    const TEX_PLAIN = 0;
const TRIM = '#7a6a55';    const TEX_STONE_BRICK = 11;
const GLASS = '#cfe8f3';   const TEX_GLASS = 8;

/**
 * 방 크기(칸). 0.5m 격자이므로 **12 × 16칸 = 6m × 8m**, 높이 4장 = 2.4m.
 *
 * ★ 처음엔 더 작게 잡았다가 늘렸다: 키가 1.6m인데 천장이 1.8m면 **관 속 같다.**
 *   마인크래프트 실내가 넉넉해 보이는 건 블록이 1m라 3블록만 쌓아도 3m이기 때문이다.
 *   우리 브릭은 0.6m라 **4장은 쌓아야** 사람이 선 느낌이 난다.
 */
export const ROOM_W = 12;
export const ROOM_D = 16;
const WALL_COURSES = 4;
const ROOM_H = WALL_COURSES * B; // 12칸 = 2.4m

/** 문 — 남쪽 벽(+Z) 가운데. 폭 2칸(1m) · 높이 3장(1.8m) */
const DOOR_W = 2;
const DOOR_H = 3 * B;
/** 창 — 동쪽 벽. 바닥에서 2장 위, 높이 1장 */
const WIN_Y0 = 2 * B;
const WIN_H = B;

/**
 * 방 하나를 만든다. `(ox, oy, oz)`는 **바닥의 최소 모서리 칸**.
 *
 * 구성: 나무 바닥 → 벽 4면(문 하나 · 창 둘) → 문틀·창틀 → 가구(소품).
 */
export function demoRoom(ox: number, oy: number, oz: number): RoomBrick[] {
  const out: RoomBrick[] = [];
  const put = (part: PartId, x: number, y: number, z: number, color: string, tex: number, mat: MatClass = 'opaque') => {
    for (const u of unitsOf(part, ox + x, oy + y, oz + z, 0)) {
      out.push({ part: u.part, x: u.x, y: u.y, z: u.z, rot: 0, color, mat, tex });
    }
  };

  // ── 바닥 (플레이트 한 겹) ───────────────────────────────────────────────
  for (let x = 0; x < ROOM_W; x++) for (let z = 0; z < ROOM_D; z++) {
    put('p1x1', x, 0, z, FLOOR, TEX_WOOD);
  }

  // ── 벽 ────────────────────────────────────────────────────────────────
  // 바닥 플레이트(1칸) 위에서 시작한다
  const y0 = 1;
  const doorX0 = Math.floor((ROOM_W - DOOR_W) / 2);
  /** 남쪽 벽(z = ROOM_D-1)의 문 구멍인가 */
  const isDoor = (x: number, z: number, y: number) =>
    z === ROOM_D - 1 && x >= doorX0 && x < doorX0 + DOOR_W && y < DOOR_H;
  /** 동쪽 벽(x = ROOM_W-1)의 창 구멍인가 — 두 짝 */
  const isWindow = (x: number, z: number, y: number) =>
    x === ROOM_W - 1 && y >= WIN_Y0 && y < WIN_Y0 + WIN_H
    && ((z >= 3 && z < 6) || (z >= 10 && z < 13));

  for (let y = 0; y < ROOM_H; y += B) {
    for (let x = 0; x < ROOM_W; x++) for (let z = 0; z < ROOM_D; z++) {
      const edge = x === 0 || z === 0 || x === ROOM_W - 1 || z === ROOM_D - 1;
      if (!edge) continue;
      if (isDoor(x, z, y)) continue;
      if (isWindow(x, z, y)) { put('w1x1', x, y0 + y, z, GLASS, TEX_GLASS, 'transparent'); continue; }
      // 맨 아랫단은 굽도리처럼 돌벽돌 — 벽이 통짜 흰색이면 실내가 밋밋하다
      const isBase = y === 0;
      put('b1x1', x, y0 + y, z, isBase ? TRIM : WALL, isBase ? TEX_STONE_BRICK : TEX_PLAIN);
    }
  }

  // ── 가구 ──────────────────────────────────────────────────────────────
  // ★ 소품(§22)을 그대로 쓴다 — 여기서 가구를 또 정의하면 두 벌이 되어 반드시 갈라진다.
  const prop = (id: PropId, x: number, z: number, rot: 0 | 1 | 2 | 3) => {
    for (const b of bricksOfProp(id, ox + x, oy + 1, oz + z, rot)) {
      out.push({ part: b.part, x: b.x, y: b.y, z: b.z, rot: b.rot as 0 | 1 | 2 | 3, color: b.color, mat: b.mat, tex: b.tex });
    }
  };

  prop('bed', 1, 1, 0);        // 북서 구석, 머리를 북쪽(−Z)으로
  prop('desk', 8, 2, 0);       // 창 쪽 책상
  prop('chair', 8, 4, 2);      // 책상을 마주 보게(뒤로 돈 방향)
  prop('lamp', 1, ROOM_D - 3, 0); // 문 옆 조명 — **발광이라 실내가 안 캄캄하다**

  return out;
}

/** 방 안에서 사람이 설 자리(월드 칸) — 걷기를 여기서 시작한다 */
export function roomSpawn(ox: number, oy: number, oz: number): [number, number, number] {
  return [ox + Math.floor(ROOM_W / 2), oy + 1, oz + ROOM_D - 3];
}
