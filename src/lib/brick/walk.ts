// 걷기 — 기준: doc/BRICK_PLAN.md §6
//
// ★ **물리 엔진을 안 쓴다.** 브릭 월드는 정렬된 격자라 캡슐-격자 충돌을 직접 푸는 편이
//   더 단순하고, **결정적이며, 테스트가 된다.** (Rapier는 2d 시절에 지웠고 되살릴 이유가 없다)
//
// ★ 여기는 **순수 함수뿐**이다 — 월드도 카메라도 모른다. "이 칸이 막혔나"만 물어본다.
//   그래야 캐릭터가 벽에 끼거나 바닥을 뚫는 고전 버그를 **화면 없이** 잠글 수 있다.

import { CELL_X, CELL_Y, CELL_Z, worldToCellX, worldToCellY, worldToCellZ, Y_MIN } from './grid';

/** 그 칸이 막혔는가 — 월드가 `at()`으로 답해 준다 */
export type Solid = (cx: number, cy: number, cz: number) => boolean;

export interface WalkState {
  x: number; y: number; z: number;
  /** 세로 속도(m/s). 떨어질 때 음수 */
  vy: number;
  onGround: boolean;
}

/**
 * 몸통 반지름(m). **반 칸(0.25m)보다 조금 작다** —
 * 딱 맞추면 한 칸짜리 문틈을 지날 때 양쪽에 동시에 닿아 못 지나간다.
 */
export const BODY_R = 0.22;
/** 키(m). 눈높이는 이보다 살짝 아래 */
export const BODY_H = 1.6;
export const EYE_H = 1.5;

/**
 * 자동으로 올라가는 높이(m) = **브릭 한 장**.
 *
 * ★ 계획서 초안은 "한 칸(0.2m)"이었는데 그러면 **브릭으로 만든 계단을 못 올라간다**(브릭이 0.6m다).
 *   마인크래프트도 0.6블록까지 자동으로 오른다 — 우리 브릭 한 장이 딱 그 높이다.
 *   플레이트(0.2m) 계단은 당연히 올라가고, 두 장(1.2m)은 못 올라간다.
 */
export const STEP_UP = 0.6;

const GRAVITY = 22;      // m/s² — 실제 중력보다 세게(굼뜨면 답답하다)
const MAX_FALL = 40;     // 종단 속도
/** 파고들기 방지 여유 — 0으로 두면 벽에 딱 붙었을 때 다음 프레임에 끼인다 */
const SKIN = 1e-4;

/** 몸통 상자가 막힌 칸과 겹치는가 */
export function blocked(solid: Solid, x: number, y: number, z: number): boolean {
  const x0 = worldToCellX(x - BODY_R + SKIN), x1 = worldToCellX(x + BODY_R - SKIN);
  const z0 = worldToCellZ(z - BODY_R + SKIN), z1 = worldToCellZ(z + BODY_R - SKIN);
  const y0 = worldToCellY(y + SKIN), y1 = worldToCellY(y + BODY_H - SKIN);
  for (let cy = y0; cy <= y1; cy++)
    for (let cx = x0; cx <= x1; cx++)
      for (let cz = z0; cz <= z1; cz++)
        if (solid(cx, cy, cz)) return true;
  return false;
}

/**
 * 한 축으로 밀어 본다. 막히면 **`STEP_UP`만큼 들어서 다시** 시도한다(계단 오르기).
 * 그래도 막히면 그 축은 안 움직인다 — **알아서 옆으로 미끄러뜨리지 않는다.**
 *
 * ★ 축을 하나씩 따로 푸는 것이 핵심이다. XZ를 한꺼번에 풀면 벽에 비스듬히 부딪혔을 때
 *   **완전히 멈춘다**(벽을 따라 미끄러지지 않는다). 축별로 풀면 한 축만 막히고 다른 축은 살아
 *   자연스럽게 벽을 따라 흐른다.
 */
function slide(
  solid: Solid, s: WalkState, axis: 'x' | 'z', d: number,
): void {
  if (d === 0) return;
  const nx = axis === 'x' ? s.x + d : s.x;
  const nz = axis === 'z' ? s.z + d : s.z;
  if (!blocked(solid, nx, s.y, nz)) { s.x = nx; s.z = nz; return; }

  // 계단 — 들어 올린 자리가 비었고, **머리도 안 닿아야** 오른다
  if (!s.onGround) return; // 공중에서는 계단을 못 오른다(벽을 타고 오르는 꼴이 된다)
  const up = s.y + STEP_UP;
  if (!blocked(solid, nx, up, nz) && !blocked(solid, s.x, up, s.z)) {
    s.x = nx; s.z = nz; s.y = up;
  }
}

/**
 * 한 프레임. `dx`·`dz`는 **이번 프레임에 가려는 거리**(m, 이미 속도×dt가 곱해진 값).
 *
 * ⚠️ **큰 `dt`에서 벽을 뚫지 않게** 호출부가 `dt`를 잘라야 한다(`stepWalk`가 대신 잘라 준다).
 */
export function stepWalk(solid: Solid, prev: WalkState, dx: number, dz: number, dt: number): WalkState {
  const s: WalkState = { ...prev };

  // 발밑이 막혔는지 먼저 본다 — 계단 판정이 이 값을 쓴다
  s.onGround = blocked(solid, s.x, s.y - SKIN * 10, s.z);

  slide(solid, s, 'x', dx);
  slide(solid, s, 'z', dz);

  // ── 세로 ──────────────────────────────────────────────────────────────
  s.vy = Math.max(-MAX_FALL, s.vy - GRAVITY * dt);
  const dy = s.vy * dt;
  const ny = s.y + dy;
  if (!blocked(solid, s.x, ny, s.z)) {
    s.y = ny;
    s.onGround = false;
  } else if (dy < 0) {
    // 떨어지다 바닥에 닿았다 — **칸 윗면에 정확히 올려놓는다**(조금씩 파고드는 것을 막는다)
    s.y = (worldToCellY(ny) + 1) * CELL_Y;
    s.vy = 0;
    s.onGround = true;
  } else {
    // 천장에 부딪혔다
    s.vy = 0;
  }
  return s;
}

/** 한 프레임의 안전한 최대 시간(s) */
const MAX_DT = 1 / 45;
/**
 * 한 조각에 갈 수 있는 최대 **거리**(m).
 *
 * ★★ **시간만 잘라서는 못 막는다.** 시간을 아무리 잘라도 속도가 크면 한 조각의 이동량이 커진다
 *   (실측: 60 m/s에서 조각당 1.33m → 벽을 그대로 통과해 x=15까지 갔다).
 *   막히는 판정은 **지금 있는 자리**를 보므로, 한 조각의 이동이 몸통 지름(0.44m)을 넘으면
 *   벽을 건너뛴다. 그래서 **거리로도** 자른다.
 */
const MAX_STEP_M = 0.15;

/**
 * `dt`가 길거나 빨라도 안전하게 — **여러 번 나눠** 돈다.
 *
 * ★ 탭이 뒤에 있다 돌아오면 `dt`가 수백 ms로 튄다. 그대로 적분하면 한 프레임에 몇 미터를 이동해
 *   **벽을 그냥 통과한다**(터널링). 시간과 거리 **둘 다** 잘라야 원리적으로 안 생긴다.
 */
export function walk(solid: Solid, prev: WalkState, speed: number, fx: number, fz: number, dt: number): WalkState {
  let s = prev;
  let left = Math.min(dt, 0.25); // 0.25s 이상은 버린다(창을 오래 떠났던 경우)
  let guard = 0;
  while (left > 0 && guard++ < 512) {
    // 가로는 speed, 세로는 낙하 속도 — **둘 중 빠른 쪽**으로 조각 길이를 정한다
    const v = Math.max(Math.abs(speed) * Math.hypot(fx, fz), Math.abs(s.vy), 1e-6);
    const step = Math.min(left, MAX_DT, MAX_STEP_M / v);
    s = stepWalk(solid, s, fx * speed * step, fz * speed * step, step);
    left -= step;
  }
  return s;
}

/** 발이 닿는 높이 — 그 기둥에서 이 XZ 아래로 처음 만나는 바닥 윗면 */
export function groundAt(solid: Solid, x: number, z: number, fromY: number): number {
  const cx = worldToCellX(x), cz = worldToCellZ(z);
  // ⚠️ 훑는 범위를 짧게 잡으면 **높은 데서 시작할 때 바닥을 못 찾고 0을 낸다**(실제로 그랬다).
  //    세로 범위 전체를 본다 — 기둥 하나라 비용은 무시할 만하다.
  for (let cy = worldToCellY(fromY); cy >= Y_MIN; cy--) {
    if (solid(cx, cy, cz)) return (cy + 1) * CELL_Y;
  }
  return 0;
}

/** 걷기를 시작할 때의 상태 — 그 자리 지면 위에 세운다 */
export function spawnAt(solid: Solid, x: number, z: number, fromY = 20): WalkState {
  return { x, y: groundAt(solid, x, z, fromY), z, vy: 0, onGround: true };
}

/** 셀 크기 재수출 — 테스트가 미터↔칸을 계산할 때 쓴다 */
export const CELL = { x: CELL_X, y: CELL_Y, z: CELL_Z } as const;
