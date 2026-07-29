// 브릭 배치 — 기준: doc/BRICK_SYSTEM.md §4.3~4.4
//
// ★ 배치는 **놓을 브릭(고스트) 기준**이다. 포인터 기준이 아니다.
//
//   포인터는 점 하나인데 놓는 것은 여러 칸짜리 덩어리다. 점 하나로 높이까지 정하면
//   포인터가 안 짚은 칸이 다른 브릭을 파고들고(겹침), 브릭이 갈 수 있는 자리를
//   포인터가 갈 수 있는 자리가 잘라먹는다(끝에 못 쌓음).
//
//   → 포인터는 **가로 위치(XZ)만** 정하고,
//     높이(Y)는 **발자국 아래를 전부 훑어서**(BrickWorld.restY) 정한다.
//     레고를 손에 들고 옮기면 아래 있는 것 위로 타고 올라가는 것과 같다.

import { CELL_X, CELL_Y, CELL_Z, worldToCellX, worldToCellZ, type Rot } from './grid';
import { extentOf, PARTS, type PartId } from './parts';
import type { BrickWorld } from './world';

export interface Anchor { x: number; y: number; z: number }

/** 가리킨 칸 → 앵커 보정량. 자유 축은 커서를 **중심**에 둔다(커서 아래에 브릭이 놓이는 느낌) */
export function centerOffset(ext: number): number {
  return Math.floor((ext - 1) / 2);
}

/**
 * 포인터가 가리킨 월드 지점 → 놓일 자리.
 *
 * XZ는 커서를 중심으로 격자에 맞춘다. Y는 두 가지 중 하나:
 *   - `lockY === null` (기본, 드롭 모드) — 발자국이 내려앉는 높이(`restY`).
 *     브릭 위를 가리키든 빈 바닥을 가리키든 규칙이 하나라 면 판정이 필요 없다.
 *   - `lockY`가 숫자 (높이 고정 모드) — 발밑을 무시하고 그 높이에 그대로 둔다.
 *     받쳐줄 게 없는 자리(천장·2층 바닥·다리 상판)를 놓기 위한 보조 모드.
 */
export function anchorFromPointer(
  world: BrickWorld,
  px: number, pz: number,
  part: PartId, rot: Rot,
  lockY: number | null = null,
): Anchor {
  const e = extentOf(PARTS[part], rot);
  const x = worldToCellX(px) - centerOffset(e.ex);
  const z = worldToCellZ(pz) - centerOffset(e.ez);
  return { x, y: lockY ?? world.restY(part, x, z, rot), z };
}

/** 앵커 → 인스턴스 배치용 월드 중심 좌표 */
export function anchorCenterWorld(a: Anchor, part: PartId, rot: Rot): [number, number, number] {
  const e = extentOf(PARTS[part], rot);
  return [
    (a.x + e.ex / 2) * CELL_X,
    (a.y + e.ey / 2) * CELL_Y,
    (a.z + e.ez / 2) * CELL_Z,
  ];
}
