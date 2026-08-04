// 칸 단위 조명 볼륨 — 기준: doc/BRICK_PLAN.md §18 2단계
//
// ★★ 왜 필요한가: 지금 밝기 값은 **브릭의 여덟 모서리**뿐이라 조명 해상도가 브릭 단위다.
//   `2×4` 브릭의 면은 2m짜리 그라데이션 한 장이 된다 — 마인크래프트는 면이 1m를 안 넘는다(D-9).
//   밝기를 **칸 모서리마다** 구워 두고 셰이더가 월드 좌표로 찾아 쓰면 해상도가 칸(0.5m)이 된다.
//
// ★ **리전 단위로 굽는다.** 카메라 주변 창 하나로 하면 편집 한 번에 전체를 다시 구워야 하는데,
//   리전은 이미 "바뀐 것만 다시 그린다"는 구조(`regionRev`)가 있어 **바뀐 리전만** 다시 구우면 된다.
//
// ★ 담는 값은 **하늘빛과 그늘 두 채널**이다. 합치면 접촉-그늘 곡선이 하늘빛까지 밝혀
//   실내·나무 밑 그늘이 사라진다(§18 1단계에서 이미 갈라 놨다).

import { REGION_X, REGION_Y, REGION_Z } from './grid';
import type { Brick, BrickWorld } from './world';

/**
 * 리전 하나의 **꼭짓점 격자** 크기. 칸이 N개면 모서리는 N+1개다.
 *
 * ⚠️ 이 `+1`을 빼먹으면 리전 경계의 마지막 한 줄이 옆 리전 값으로 이어지지 않아
 *   **경계마다 명암이 끊긴다**(리전 크기 32m마다 줄이 보인다).
 */
/**
 * ★★ **리전 밖으로 넉넉히 물린 여백(칸).**
 *
 * 리전 소유권은 **앵커** 기준이라 브릭이 경계를 넘어갈 수 있다(가장 긴 파츠가 8칸).
 * 볼륨을 리전에 딱 맞추면 걸친 브릭의 바깥쪽 끝이 **볼륨 밖을 읽어** 가장자리 값으로 눌린다
 * → **32m마다 경계선이 보인다.** 가장 긴 파츠만큼 물려 두면 그런 일이 없다.
 */
export const VOL_MARGIN = 8;

export const VOL_X = REGION_X + 1 + VOL_MARGIN;
export const VOL_Y = REGION_Y + 1 + VOL_MARGIN;
export const VOL_Z = REGION_Z + 1 + VOL_MARGIN;
export const VOL_TEXELS = VOL_X * VOL_Y * VOL_Z;

/** 채널 수 — R=하늘빛, G=그늘 */
export const VOL_CHANNELS = 2;

/**
 * 꼭짓점 격자 좌표 → 텍셀 번호.
 *
 * ★ 순서는 **x가 가장 빠르고 z가 가장 느리다** — 3D 텍스처 업로드가 기대하는 순서와 같아야
 *   행/열이 뒤바뀌지 않는다. 뒤바뀌면 그늘이 엉뚱한 축으로 밀린다(에러는 안 난다).
 */
export const volIndex = (lx: number, ly: number, lz: number): number =>
  (lz * VOL_Y + ly) * VOL_X + lx;

/**
 * 리전 하나의 빛 볼륨.
 *
 * `origin*`은 이 볼륨의 `(0,0,0)` 꼭짓점이 **어느 셀 좌표**인지다.
 * 셰이더는 월드 좌표를 이 원점 기준으로 바꿔서 조회한다 — 그 변환이 **반 칸만 어긋나도
 * 그늘이 통째로 밀리므로**, 변환식은 `volCoord`/`volUVW` 한 곳에만 둔다.
 */
export class RegionLightVolume {
  readonly data = new Uint8Array(VOL_TEXELS * VOL_CHANNELS);
  /** 이번 굽기에서 이미 계산한 꼭짓점 — 이웃 브릭끼리 모서리를 공유하므로 중복 제거가 크게 먹는다 */
  private readonly done = new Uint8Array(VOL_TEXELS);
  private stamp = 0;

  constructor(readonly originX: number, readonly originY: number, readonly originZ: number) {}

  /** 굽기 통계 — 성능 확인용(F-5: 숫자를 봐야 안다) */
  stats = { corners: 0, ms: 0 };

  /**
   * 표면 근처만 채운다.
   *
   * ⚠️ **부피 전체를 계산하면 못 쓴다** — 리전 하나가 꼭짓점 54만 개고, 하나당 여덟 칸을 조회한다.
   *   실제로 값이 필요한 곳은 **보이는 브릭의 표면 근처**뿐이라 거기만 계산한다.
   *   나머지는 "트인 하늘, 그늘 없음"(255,255)이 정답이다.
   */
  bake(world: BrickWorld, brickIds: Iterable<number>): void {
    const t0 = performance.now();
    this.data.fill(255);
    this.stamp++;
    if (this.stamp > 250) { this.done.fill(0); this.stamp = 1; } // 8비트 스탬프가 돌기 전에 초기화
    const pair = new Float32Array(2);
    let corners = 0;

    for (const id of brickIds) {
      const b = world.bricks.get(id);
      if (!b) continue;
      const e = world.extentOfBrick(b);
      // 브릭이 차지한 칸의 모서리 — 가장자리 한 겹까지 넉넉히(이웃 면이 이 값을 쓴다)
      const x0 = b.x - this.originX - 1, y0 = b.y - this.originY - 1, z0 = b.z - this.originZ - 1;
      for (let lz = z0; lz <= z0 + e.ez + 2; lz++) {
        if (lz < 0 || lz >= VOL_Z) continue;
        for (let ly = y0; ly <= y0 + e.ey + 2; ly++) {
          if (ly < 0 || ly >= VOL_Y) continue;
          for (let lx = x0; lx <= x0 + e.ex + 2; lx++) {
            if (lx < 0 || lx >= VOL_X) continue;
            const t = volIndex(lx, ly, lz);
            if (this.done[t] === this.stamp) continue; // 이웃과 공유하는 모서리 — 이미 했다
            this.done[t] = this.stamp;
            world.cornerValueAt(lx + this.originX, ly + this.originY, lz + this.originZ, pair);
            this.data[t * 2] = Math.round(pair[0] * 255);
            this.data[t * 2 + 1] = Math.round(pair[1] * 255);
            corners++;
          }
        }
      }
    }
    this.stats = { corners, ms: performance.now() - t0 };
  }

  /**
   * ★★★ **브릭 하나 둘레만 다시 굽는다** — 편집할 때 쓰는 길이다.
   *
   * 🔴 실측: 리전을 통째로 다시 구우면 **35~70ms**다. 그런데 브릭 하나를 놓으면 그 리전이
   *   다시 만들어지므로 **놓을 때마다** 그 값이 든다 — 드래그로 벽을 깔면 조작감이 무너진다.
   *   실제로 바뀌는 건 **그 브릭 둘레 꼭짓점 몇십 개**뿐이라 거기만 고친다(전체의 1/1500).
   *
   * ★★ **범위는 브릭의 칸 모서리까지, 딱 거기까지다** — `b.x` 부터 `b.x + ex` 까지 **양끝 포함**.
   *
   *   한 겹 더 넓게 잡을 뻔했는데(그렇게 썼다가 재보고 고쳤다) **필요 없다**:
   *   꼭짓점 하나는 자기를 둘러싼 여덟 칸만 본다. 브릭 범위에서 한 칸 밖 꼭짓점의 여덟 칸에는
   *   **그 브릭이 들어가지 않는다.** 넓게 잡으면 계산량이 4배가 되고 얻는 건 없다(150개 → 36개).
   *
   *   반대로 **양끝을 포함하지 않으면 안 된다.** `b.x + ex` 꼭짓점의 여덟 칸에는 브릭의 마지막 칸이
   *   들어 있어서, 빼면 브릭 한쪽 모서리의 그늘이 **옛 값으로 남는다**(테스트가 잡는다).
   *
   * 반환: 다시 계산한 꼭짓점 수(0이면 이 리전 밖이라 할 일이 없었다는 뜻)
   */
  bakeAround(world: BrickWorld, b: Brick): number {
    const e = world.extentOfBrick(b);
    const pair = new Float32Array(2);
    let n = 0;
    const x0 = b.x - this.originX, y0 = b.y - this.originY, z0 = b.z - this.originZ;
    for (let lz = z0; lz <= z0 + e.ez; lz++) {
      if (lz < 0 || lz >= VOL_Z) continue;
      for (let ly = y0; ly <= y0 + e.ey; ly++) {
        if (ly < 0 || ly >= VOL_Y) continue;
        for (let lx = x0; lx <= x0 + e.ex; lx++) {
          if (lx < 0 || lx >= VOL_X) continue;
          const t = volIndex(lx, ly, lz);
          world.cornerValueAt(lx + this.originX, ly + this.originY, lz + this.originZ, pair);
          this.data[t * 2] = Math.round(pair[0] * 255);
          this.data[t * 2 + 1] = Math.round(pair[1] * 255);
          this.done[t] = this.stamp; // 전량 굽기와 섞여도 되도록 스탬프도 찍어 둔다
          n++;
        }
      }
    }
    return n;
  }

  /** 이 볼륨이 담고 있는 값(테스트·디버깅용) — `[하늘빛, 그늘]` 0~1 */
  read(lx: number, ly: number, lz: number): [number, number] {
    const t = volIndex(lx, ly, lz);
    return [this.data[t * 2] / 255, this.data[t * 2 + 1] / 255];
  }
}

/**
 * ★★★ **월드 좌표(m) → 볼륨 격자 좌표.** 셰이더와 CPU가 **반드시 같은 식**을 써야 한다.
 *
 * 밝기 값은 **칸의 모서리**에 있다. 셀 `n`의 최소 모서리가 월드 `n * CELL`이므로,
 * 월드 좌표를 칸 크기로 나눈 값이 곧 격자 좌표다 — **반 칸 더하거나 빼면 안 된다.**
 * (반 칸 어긋나면 그늘이 통째로 밀리는데 에러는 안 난다 → §18의 최대 위험)
 */
export function volCoord(
  worldX: number, worldY: number, worldZ: number,
  cellX: number, cellY: number, cellZ: number,
  origin: readonly [number, number, number],
): [number, number, number] {
  return [
    worldX / cellX - origin[0],
    worldY / cellY - origin[1],
    worldZ / cellZ - origin[2],
  ];
}

/**
 * 격자 좌표 → 텍스처 좌표(0~1). **텍셀 중심**을 겨눠야 선형 보간이 맞는다.
 *
 * ⚠️ `g / VOL`이 아니라 `(g + 0.5) / VOL`이다. 반 텍셀을 빼먹으면 전체가 반 칸 밀린다 —
 *   화면에서는 "그늘이 브릭에서 살짝 떨어져 있다"로 보이고, 원인을 찾기 매우 어렵다.
 */
export function volUVW(g: readonly [number, number, number]): [number, number, number] {
  return [(g[0] + 0.5) / VOL_X, (g[1] + 0.5) / VOL_Y, (g[2] + 0.5) / VOL_Z];
}
