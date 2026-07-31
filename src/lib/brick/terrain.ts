// 지형(바닥) — 기준: doc/BRICK_SYSTEM.md §3.4 "가상 바닥"
//
// 마인크래프트처럼 **바닥도 블록**이라 파낼 수 있다. 다만 무한 맵의 바닥을 전부 저장할 순 없으므로:
//
//   ① 청크가 스트리밍으로 올라올 때 **표면 한 겹**을 생성한다 (2×2 격자, y = -3..-1)
//   ② 그 순간부터 **평범한 브릭 데이터**가 된다 → 파기는 그냥 삭제, 저장은 기존 청크 저장 그대로
//   ③ 파면 그 주변 기둥을 **아래로 연장**한다 (구덩이에 벽과 바닥이 생기도록)
//
// ★ 이 방식의 핵심: 지형을 특별 취급하지 않는다. 한 번 생성되면 그냥 브릭이라
//   삭제·저장·조명·컬링·스트리밍이 **이미 있는 코드로 전부 처리된다.**

import { CHUNK_X, CHUNK_Z, chunkOriginX, chunkOriginZ, Y_MIN, BRICK_CELLS_Y, type ChunkCoord } from './grid';
import { TERRAIN_STEP } from './parts';
import type { BrickWorld } from './world';

/** 지형 표면의 윗면이 y=0이 되도록 — 블록은 y = -3 .. -1을 차지한다 */
export const SURFACE_Y = -BRICK_CELLS_Y;

/** 팔 때 그 아래로 미리 확보하는 깊이(층) */
const DIG_DEPTH_LAYERS = 8;

/**
 * ★ 파낸 자리 주변을 **대각선까지** 채워야 한다.
 *   상하좌우만 채우면 정확히 **45° 시선으로 땅속이 비쳐 보인다**(대각선 기둥이 비어 있어서).
 *   3×3 = 자기 기둥 + 8방향.
 */
const DIG_RING = 1;

/** 층별 색 — 위는 흙, 아래로 갈수록 돌 */
function layerColor(layer: number): string {
  if (layer <= 0) return '#6b5233'; // 흙
  if (layer < 3) return '#5a4a3a';  // 굳은 흙
  return '#565659';                 // 돌
}

const colK = (x: number, z: number) => `${x},${z}`;

/**
 * "이 기둥은 y 아래로 아직 안 판 땅"을 월드에 알린다 — 빛이 그리로 새지 않게.
 * 지형은 한 겹뿐이고 그 아래는 빈 칸이라, 안 막으면 BFS가 땅 밑 전체를 훑는다.
 * 지형 블록은 2×2 스터드이므로 **네 개 열 전부** 표시해야 한다.
 */
function markSolid(world: BrickWorld, gx: number, gz: number, bottomY: number): void {
  for (let dx = 0; dx < TERRAIN_STEP; dx++)
    for (let dz = 0; dz < TERRAIN_STEP; dz++)
      world.markSolidBelow(gx + dx, gz + dz, bottomY);
}

/**
 * 기둥별로 **어디까지 채웠는지**(가장 아래 블록의 y).
 *
 * ★ 이 기록이 없으면 "판 자리를 다시 채우는" 문제가 생긴다.
 *   빈 칸을 보고 채우면 방금 판 구멍이 되살아나므로, **채운 끝에서 아래로만 연장**한다.
 */
const filledTo = new Map<string, number>();

/** 저장소를 바꾸거나 월드를 비울 때 — 기록도 함께 초기화 */
export function resetTerrainState(): void {
  filledTo.clear();
}

/**
 * 청크를 메모리에서 내릴 때 — **그 기둥들의 기록을 잊는다.**
 *
 * ★ 안 잊으면 두 가지가 터진다:
 *   ① `filledTo`가 기둥마다 남아 **걸어 다닌 만큼 무한히 커진다**
 *   ② 되돌아왔을 때 "이미 채웠다"고 기억해 지형을 다시 안 깐다
 *   (판 자리는 저장소에 남아 있고, 다시 로드될 때 `noteLoadedTerrain`이 학습한다)
 */
export function forgetTerrainChunk(c: ChunkCoord): void {
  const ox = chunkOriginX(c.cx), oz = chunkOriginZ(c.cz);
  for (let dx = 0; dx < CHUNK_X; dx++)
    for (let dz = 0; dz < CHUNK_Z; dz++)
      filledTo.delete(colK(ox + dx, oz + dz));
}

/** 불러온 지형에서 기둥별 최하단을 학습 — 그래야 이어서 팔 때 되살아나지 않는다 */
export function noteLoadedTerrain(world: BrickWorld, x: number, y: number, z: number): void {
  const k = colK(x, z);
  const cur = filledTo.get(k);
  if (cur === undefined || y < cur) { filledTo.set(k, y); markSolid(world, x, z, y); }
}

/** 이 청크에 지형을 이미 깔았는지 — 다 파낸 청크가 되살아나지 않게 한다 */
export type TerrainGenerated = Set<string>;
export const terrainKey = (cx: number, cz: number) => `${cx},${cz}`;

/** 청크 표면 한 겹 생성. 이미 생성된 청크면 아무 것도 안 한다 */
export function generateSurface(world: BrickWorld, c: ChunkCoord, done: TerrainGenerated): number {
  const key = terrainKey(c.cx, c.cz);
  if (done.has(key)) return 0;
  done.add(key);

  const ox = chunkOriginX(c.cx), oz = chunkOriginZ(c.cz);
  let n = 0;
  for (let dx = 0; dx < CHUNK_X; dx += TERRAIN_STEP) {
    for (let dz = 0; dz < CHUNK_Z; dz += TERRAIN_STEP) {
      const x = ox + dx, z = oz + dz;
      if (world.placeFast('terrain', x, SURFACE_Y, z, 0, layerColor(0), 'opaque') !== null) {
        filledTo.set(colK(x, z), SURFACE_Y);
        markSolid(world, x, z, SURFACE_Y);
        n++;
      }
    }
  }
  return n;
}

/** 한 기둥을 targetY까지 **아래로 연장**. 이미 채운 구간은 건드리지 않는다(판 자리 보존) */
function extendColumn(world: BrickWorld, gx: number, gz: number, targetY: number): number {
  const k = colK(gx, gz);
  let bottom = filledTo.get(k);
  let n = 0;
  if (bottom === undefined) {
    // 아직 표면도 없는 기둥(청크 경계 밖 등) — 표면부터 만든다
    if (world.placeFast('terrain', gx, SURFACE_Y, gz, 0, layerColor(0), 'opaque') !== null) n++;
    bottom = SURFACE_Y;
  }
  let layer = Math.round((SURFACE_Y - bottom) / BRICK_CELLS_Y);
  while (bottom > targetY && bottom - BRICK_CELLS_Y >= Y_MIN) {
    bottom -= BRICK_CELLS_Y;
    layer++;
    if (world.placeFast('terrain', gx, bottom, gz, 0, layerColor(layer), 'opaque') !== null) n++;
  }
  filledTo.set(k, bottom);
  markSolid(world, gx, gz, bottom);
  return n;
}

/**
 * 파낸 자리 주변을 미리 확보한다 — 구덩이에 **벽·바닥**이 생기도록.
 * **대각선 포함 3×3**을 채운다(상하좌우만 하면 45° 시선으로 땅속이 비친다).
 */
export function deepenAround(world: BrickWorld, x: number, y: number, z: number): number {
  const gx = Math.floor(x / TERRAIN_STEP) * TERRAIN_STEP;
  const gz = Math.floor(z / TERRAIN_STEP) * TERRAIN_STEP;
  const target = y - DIG_DEPTH_LAYERS * BRICK_CELLS_Y;
  let n = 0;
  for (let dx = -DIG_RING; dx <= DIG_RING; dx++) {
    for (let dz = -DIG_RING; dz <= DIG_RING; dz++) {
      n += extendColumn(world, gx + dx * TERRAIN_STEP, gz + dz * TERRAIN_STEP, target);
    }
  }
  return n;
}
