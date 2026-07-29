// 브릭 월드 자료구조 — 기준: doc/BRICK_SYSTEM.md §3.2
//
// ★ 셀 배열이 아니라 **브릭 레코드 리스트**다.
//   마인크래프트는 "1셀 = 1블록"이라 셀 배열이 자연스럽지만, 브릭은 여러 셀에 걸친다
//   (2×4 브릭 하나가 2×3×4 = 24셀). 셀마다 저장하면 24배 낭비다.
//   → 저장은 레코드, "이 칸 비었나" 조회는 파생 점유 격자(occ).

import {
  BRICK_CELLS_Y, cellKey, chunkCoordOf, chunkKey, colKey, DIRS, regionKeyOf, Y_MAX, Y_MIN,
  type ChunkCoord, type Rot,
} from './grid';
import { extentOf, PARTS, type MatClass, type PartId } from './parts';

export interface Brick {
  id: number;
  part: PartId;
  /** 앵커 = 회전 후 AABB의 최소 모서리 셀 */
  x: number;
  y: number;
  z: number;
  rot: Rot;
  color: string;
  mat: MatClass;
}

export class BrickWorld {
  readonly bricks = new Map<number, Brick>();
  /** cellKey → brickId. 레코드에서 파생되며 저장하지 않는다 */
  private readonly occ = new Map<number, number>();
  /** colKey → 그 기둥에서 가장 높은 점유 칸 + 1 (= 그 위에 얹힐 수 있는 첫 칸). 비었으면 항목 없음 */
  private readonly colTop = new Map<number, number>();
  private nextId = 1;

  // ── 청크 인덱스 (P1 저장) ──────────────────────────────────────────────
  // 소유권은 **앵커 셀** 기준. 브릭이 경계를 넘어가도 앵커가 있는 청크가 갖는다.
  /** chunkKey → 그 청크가 소유한 brickId들 */
  private readonly byChunk = new Map<number, Set<number>>();
  private readonly chunkCoord = new Map<number, ChunkCoord>();
  /** 마지막 저장 이후 바뀐 청크 (빈 청크가 된 것도 포함 — 그건 지워야 하므로) */
  private readonly dirty = new Set<number>();

  // ── 리전 인덱스 (P2 렌더 배칭) ─────────────────────────────────────────
  // 렌더러가 리전 단위로 InstancedMesh를 만들어 프러스텀 컬링이 먹게 한다.
  /** regionKey → 그 리전의 **보이는** brickId들 (안 보이는 건 애초에 안 그리므로 제외) */
  private readonly regionBricks = new Map<number, Set<number>>();
  /** regionKey → 리비전. 이 값이 그대로면 렌더러가 인스턴스 버퍼를 다시 쓰지 않는다 */
  private readonly regionRev = new Map<number, number>();

  /** 렌더 대상 — 완전히 묻힌 브릭은 제외된다 */
  readonly visible = new Set<number>();
  /** 위가 완전히 덮여 스터드를 그릴 필요가 없는 브릭 */
  readonly studless = new Set<number>();

  get count(): number { return this.bricks.size; }
  get visibleCount(): number { return this.visible.size; }

  at(x: number, y: number, z: number): number | undefined {
    return this.occ.get(cellKey(x, y, z));
  }

  /** 브릭이 차지하는 셀을 순회 */
  forEachCell(b: Brick, fn: (x: number, y: number, z: number) => void): void {
    const e = extentOf(PARTS[b.part], b.rot);
    for (let dx = 0; dx < e.ex; dx++)
      for (let dy = 0; dy < e.ey; dy++)
        for (let dz = 0; dz < e.ez; dz++)
          fn(b.x + dx, b.y + dy, b.z + dz);
  }

  canPlace(part: PartId, x: number, y: number, z: number, rot: Rot): boolean {
    const e = extentOf(PARTS[part], rot);
    if (y < Y_MIN || y + e.ey - 1 > Y_MAX) return false;
    for (let dx = 0; dx < e.ex; dx++)
      for (let dy = 0; dy < e.ey; dy++)
        for (let dz = 0; dz < e.ez; dz++)
          if (this.occ.has(cellKey(x + dx, y + dy, z + dz))) return false;
    return true;
  }

  place(part: PartId, x: number, y: number, z: number, rot: Rot, color: string, mat: MatClass): number | null {
    if (!this.canPlace(part, x, y, z, rot)) return null;
    const b: Brick = { id: this.nextId++, part, x, y, z, rot, color, mat };
    this.bricks.set(b.id, b);
    this.forEachCell(b, (cx, cy, cz) => this.occ.set(cellKey(cx, cy, cz), b.id));
    this.raiseColumns(b);
    this.indexChunk(b);
    this.refreshAround(b);
    return b.id;
  }

  remove(id: number): boolean {
    const b = this.bricks.get(id);
    if (!b) return false;
    // 이웃을 먼저 모아둔다 — 지우고 나면 인접 관계를 못 찾는다
    const neighbors = this.neighborsOf(b);
    this.forEachCell(b, (cx, cy, cz) => this.occ.delete(cellKey(cx, cy, cz)));
    this.bricks.delete(id);
    if (this.visible.has(id)) this.setRegionMember(b, false); // 그리던 것이면 리전에서 빼고 리비전 올림
    this.visible.delete(id);
    this.studless.delete(id);
    this.unindexChunk(b);
    this.forEachColumn(b, (cx, cz) => this.recomputeColumn(cx, cz));
    this.refreshMany(neighbors);
    return true;
  }

  clear(): void {
    // 비워진 청크도 저장소에서 지워야 하므로 dirty로 남긴다
    for (const k of this.byChunk.keys()) this.dirty.add(k);
    this.bricks.clear();
    this.occ.clear();
    this.colTop.clear();
    this.visible.clear();
    this.studless.clear();
    this.byChunk.clear();
    for (const k of this.regionBricks.keys()) this.bumpRegion(k); // 렌더러가 비워진 걸 알도록
    this.regionBricks.clear();
    this.nextId = 1;
  }

  // ── 청크 인덱스 · 변경 추적 ────────────────────────────────────────────

  private indexChunk(b: Brick): void {
    const c = chunkCoordOf(b.x, b.y, b.z);
    const k = chunkKey(c.cx, c.cy, c.cz);
    let set = this.byChunk.get(k);
    if (!set) { set = new Set(); this.byChunk.set(k, set); this.chunkCoord.set(k, c); }
    set.add(b.id);
    this.dirty.add(k);
  }

  private unindexChunk(b: Brick): void {
    const c = chunkCoordOf(b.x, b.y, b.z);
    const k = chunkKey(c.cx, c.cy, c.cz);
    const set = this.byChunk.get(k);
    if (set) {
      set.delete(b.id);
      if (set.size === 0) this.byChunk.delete(k); // 좌표는 남겨둔다 — 저장소에서 지울 때 필요
    }
    this.dirty.add(k);
  }

  /**
   * 스트리밍 언로드 — 메모리에서만 내린다.
   * ★ **편집이 아니므로 dirty로 표시하지 않는다.** 표시하면 "빈 청크"로 저장돼 **데이터가 지워진다.**
   *   (호출 전에 반드시 dirty를 flush할 것 — 스토어가 그렇게 한다)
   */
  unloadChunk(key: number): number {
    const ids = this.byChunk.get(key);
    if (!ids) return 0;
    const n = ids.size;
    for (const id of [...ids]) {
      const b = this.bricks.get(id);
      if (!b) continue;
      this.forEachCell(b, (cx, cy, cz) => this.occ.delete(cellKey(cx, cy, cz)));
      this.bricks.delete(id);
      if (this.visible.has(id)) this.setRegionMember(b, false);
      this.visible.delete(id);
      this.studless.delete(id);
      this.forEachColumn(b, (cx, cz) => this.recomputeColumn(cx, cz));
    }
    this.byChunk.delete(key);
    this.chunkCoord.delete(key);
    return n;
  }

  hasChunk(key: number): boolean { return this.byChunk.has(key); }

  loadedChunkKeys(): number[] { return [...this.byChunk.keys()]; }

  /** 저장할 청크 목록 — 비어 있으면 bricks가 빈 배열(=저장소에서 삭제하라는 뜻) */
  dirtyChunks(): { coord: ChunkCoord; bricks: Brick[] }[] {
    const out: { coord: ChunkCoord; bricks: Brick[] }[] = [];
    for (const k of this.dirty) {
      const coord = this.chunkCoord.get(k);
      if (!coord) continue;
      const ids = this.byChunk.get(k);
      const bricks: Brick[] = [];
      if (ids) for (const id of ids) { const b = this.bricks.get(id); if (b) bricks.push(b); }
      out.push({ coord, bricks });
    }
    return out;
  }

  /** 저장이 끝난 뒤 호출 — 변경 표시를 지운다 */
  clearDirty(): void {
    this.dirty.clear();
    // 빈 청크의 좌표 기억도 이제 필요 없다
    for (const [k] of this.chunkCoord) if (!this.byChunk.has(k)) this.chunkCoord.delete(k);
  }

  get hasUnsaved(): boolean { return this.dirty.size > 0; }
  get chunkCount(): number { return this.byChunk.size; }

  // ── 얹힐 높이 (드롭 모델) ──────────────────────────────────────────────
  // 배치는 포인터(점 하나)가 아니라 **놓을 브릭의 발자국 전체**로 결정한다.
  // 점은 여러 칸짜리 브릭을 대표할 수 없어서, 포인터가 안 짚은 칸이 다른 브릭을
  // 파고드는 일이 생겼다. 발자국 아래를 전부 훑어 가장 높은 것 위에 얹는다.

  private forEachColumn(b: Brick, fn: (x: number, z: number) => void): void {
    const e = extentOf(PARTS[b.part], b.rot);
    for (let dx = 0; dx < e.ex; dx++)
      for (let dz = 0; dz < e.ez; dz++)
        fn(b.x + dx, b.z + dz);
  }

  private raiseColumns(b: Brick): void {
    const top = b.y + extentOf(PARTS[b.part], b.rot).ey;
    this.forEachColumn(b, (cx, cz) => {
      const k = colKey(cx, cz);
      const cur = this.colTop.get(k) ?? 0;
      if (top > cur) this.colTop.set(k, top);
    });
  }

  /** 현재 높이에서 아래로 훑어 실제 꼭대기를 다시 찾는다(위에 뭐가 남아 있으면 즉시 멈춤) */
  private recomputeColumn(x: number, z: number): void {
    const k = colKey(x, z);
    let top = this.colTop.get(k) ?? 0;
    while (top > 0 && !this.occ.has(cellKey(x, top - 1, z))) top--;
    if (top === 0) this.colTop.delete(k);
    else this.colTop.set(k, top);
  }

  /** 그 기둥 꼭대기 = 얹힐 수 있는 첫 칸 */
  topOfColumn(x: number, z: number): number {
    return this.colTop.get(colKey(x, z)) ?? 0;
  }

  /**
   * 이 발자국이 내려앉을 높이. 발밑에서 **가장 높은** 기둥 위에 얹힌다.
   * → 겹침이 구조적으로 불가능해지고, 일부만 걸쳐도(오버행) 그 높이로 올라간다.
   */
  restY(part: PartId, x: number, z: number, rot: Rot): number {
    const e = extentOf(PARTS[part], rot);
    let top = 0;
    for (let dx = 0; dx < e.ex; dx++)
      for (let dz = 0; dz < e.ez; dz++) {
        const t = this.topOfColumn(x + dx, z + dz);
        if (t > top) top = t;
      }
    return top;
  }

  // ── 가시성 ────────────────────────────────────────────────────────────
  // 6면이 전부 막힌 브릭은 인스턴스를 만들지 않는다.
  // 100×100×20 꽉 찬 덩어리 기준 200,000개 → 껍질 27,128개(86% 감소).

  /**
   * 브릭 하나의 가시성·스터드 상태를 갱신하고, **바뀐 경우에만** 리전 리비전을 올린다.
   * (매번 올리면 렌더러가 인스턴스 버퍼를 헛되이 다시 쓴다)
   */
  private refresh(b: Brick): void {
    const wasVisible = this.visible.has(b.id);
    const wasStudless = this.studless.has(b.id);
    const nowVisible = !this.isBuried(b);
    const nowStudless = this.isTopCovered(b);

    if (nowVisible) this.visible.add(b.id); else this.visible.delete(b.id);
    if (nowStudless) this.studless.add(b.id); else this.studless.delete(b.id);

    if (nowVisible !== wasVisible) {
      this.setRegionMember(b, nowVisible);
    } else if (nowVisible && nowStudless !== wasStudless) {
      this.bumpRegion(regionKeyOf(b.x, b.y, b.z)); // 그리는 메시가 바뀐다(스터드 有↔無)
    }
  }

  private setRegionMember(b: Brick, member: boolean): void {
    const k = regionKeyOf(b.x, b.y, b.z);
    let set = this.regionBricks.get(k);
    if (member) {
      if (!set) { set = new Set(); this.regionBricks.set(k, set); }
      set.add(b.id);
    } else if (set) {
      set.delete(b.id);
      if (set.size === 0) this.regionBricks.delete(k);
    }
    this.bumpRegion(k);
  }

  private bumpRegion(k: number): void {
    this.regionRev.set(k, (this.regionRev.get(k) ?? 0) + 1);
  }

  /** 렌더러용 — 리전 목록과 리비전. 리비전이 그대로면 그 리전은 다시 안 그려도 된다 */
  regionSnapshot(): { key: number; rev: number }[] {
    const out: { key: number; rev: number }[] = [];
    for (const k of this.regionBricks.keys()) out.push({ key: k, rev: this.regionRev.get(k) ?? 0 });
    return out;
  }

  regionBrickIds(key: number): Set<number> | undefined {
    return this.regionBricks.get(key);
  }

  private refreshAround(b: Brick): void {
    this.refresh(b);
    this.refreshMany(this.neighborsOf(b));
  }

  private refreshMany(ids: Iterable<number>): void {
    for (const id of ids) {
      const n = this.bricks.get(id);
      if (n) this.refresh(n);
    }
  }

  /** 이 브릭의 표면에 맞닿은 다른 브릭들 */
  private neighborsOf(b: Brick): Set<number> {
    const out = new Set<number>();
    this.forEachCell(b, (cx, cy, cz) => {
      for (const [ox, oy, oz] of DIRS) {
        const id = this.occ.get(cellKey(cx + ox, cy + oy, cz + oz));
        if (id !== undefined && id !== b.id) out.add(id);
      }
    });
    return out;
  }

  /** 표면에 맞닿은 칸이 하나라도 비어 있으면 보인다 (자기 몸통이 채운 칸도 '막힘'으로 친다) */
  private isBuried(b: Brick): boolean {
    let buried = true;
    this.forEachCell(b, (cx, cy, cz) => {
      if (!buried) return;
      for (const [ox, oy, oz] of DIRS) {
        if (!this.occ.has(cellKey(cx + ox, cy + oy, cz + oz))) { buried = false; return; }
      }
    });
    return buried;
  }

  /** 윗면 전체가 다른 브릭에 덮였는가 (스터드 컬링 판정) */
  private isTopCovered(b: Brick): boolean {
    const e = extentOf(PARTS[b.part], b.rot);
    const topY = b.y + e.ey;
    for (let dx = 0; dx < e.ex; dx++)
      for (let dz = 0; dz < e.ez; dz++)
        if (!this.occ.has(cellKey(b.x + dx, topY, b.z + dz))) return false;
    return true;
  }

  // ── 하늘빛 (P3-a) ─────────────────────────────────────────────────────
  // 마인크래프트처럼 **구운 빛**으로 입체감을 낸다. 실시간 그림자를 대신하는 것이다
  // (12만 브릭 실측: 그림자 패스가 프레임의 절반을 먹었다).
  //
  // ★ P3-a는 **깊이 기반 감쇠**다 — 그 칸이 하늘에서 얼마나 파묻혔는지만 본다(O(1)).
  //   문·창으로 빛이 옆에서 새어 들어오는 건 **진짜 flood fill이 필요**하고 P3-b로 미룬다.
  //   지금 모델로는 창문 있는 방도 균일하게 어둡다.

  /** 하늘까지 파묻힌 깊이가 이만큼(셀)이면 가장 어두워진다. 브릭 15개 높이 */
  private static readonly SKY_FALLOFF = BRICK_CELLS_Y * 15;
  /** 완전한 암흑은 만들지 않는다 — 실내가 새까매지면 아무것도 안 보인다 */
  private static readonly SKY_MIN = 0.16;

  /** 이 칸이 받는 하늘빛 0..1. 열린 하늘이면 1, 깊이 파묻힐수록 어두워진다 */
  skyFactor(x: number, y: number, z: number): number {
    const depth = this.topOfColumn(x, z) - y;
    if (depth <= 0) return 1; // 위가 뻥 뚫림
    const t = 1 - depth / BrickWorld.SKY_FALLOFF;
    return t <= BrickWorld.SKY_MIN ? BrickWorld.SKY_MIN : t;
  }

  // ── 빛 전파 (P3-b) ────────────────────────────────────────────────────
  // P3-a의 깊이 감쇠는 **옆에서 들어오는 빛을 표현하지 못했다**(창문 있는 방도 균일하게 어두움).
  // 여기서 마인크래프트식 BFS를 넣는다 — 하늘빛이 문틈으로 새어 들어오고, 발광 브릭이 주변을 밝힌다.
  //
  // ★ 무한 맵인데 BFS가 폭발하지 않는 이유:
  //   **열린 하늘 칸은 아예 다루지 않는다.** `y >= colTop`이면 항상 최대 밝기라 O(1)로 답이 나오고,
  //   저장할 필요도 전파할 필요도 없다. BFS는 **그늘진 공기**(구조물 안쪽)만 훑으므로
  //   탐색 범위가 사용자가 지은 만큼으로 자연히 한정된다.

  private static readonly LIGHT_MAX = 30;
  /** 병적인 구조(거대한 밀폐 공간)에서 멈추도록 하는 상한 */
  private static readonly LIGHT_BUDGET = 400_000;

  /** cellKey → 0..LIGHT_MAX. **그늘진 공기 칸만** 담는다(열린 하늘은 계산으로 답한다) */
  private readonly light = new Map<number, number>();
  /** 마지막 계산 통계 — 성능 확인용 */
  lightStats = { cells: 0, ms: 0 };

  /** 위가 뻥 뚫린 칸인가 (colTop 정의상 이런 칸은 비어 있다) */
  private isOpenSky(x: number, y: number, z: number): boolean {
    return y >= this.topOfColumn(x, z);
  }

  /** 이 칸의 최종 밝기 0..1 */
  lightAt(x: number, y: number, z: number): number {
    if (this.isOpenSky(x, y, z)) return 1;
    if (this.occ.has(cellKey(x, y, z))) return BrickWorld.SKY_MIN; // 막힌 칸
    const lv = this.light.get(cellKey(x, y, z));
    if (lv === undefined) return BrickWorld.SKY_MIN;
    const t = lv / BrickWorld.LIGHT_MAX;
    return t <= BrickWorld.SKY_MIN ? BrickWorld.SKY_MIN : t;
  }

  /** 브릭 6면에 맞닿은 바깥 칸들 */
  private forEachFaceCell(b: Brick, fn: (x: number, y: number, z: number) => void): void {
    const e = extentOf(PARTS[b.part], b.rot);
    const x0 = b.x, y0 = b.y, z0 = b.z;
    const x1 = x0 + e.ex - 1, y1 = y0 + e.ey - 1, z1 = z0 + e.ez - 1;
    for (let cy = y0; cy <= y1; cy++)
      for (let cz = z0; cz <= z1; cz++) { fn(x1 + 1, cy, cz); fn(x0 - 1, cy, cz); }
    for (let cx = x0; cx <= x1; cx++)
      for (let cz = z0; cz <= z1; cz++) { fn(cx, y1 + 1, cz); fn(cx, y0 - 1, cz); }
    for (let cx = x0; cx <= x1; cx++)
      for (let cy = y0; cy <= y1; cy++) { fn(cx, cy, z1 + 1); fn(cx, cy, z0 - 1); }
  }

  /**
   * 빛 재계산. 편집마다 부르면 무거우므로 **스토어가 디바운스**해서 호출한다.
   * 레벨별 버킷 큐라 각 칸을 사실상 한 번만 확정한다(가중치가 균일한 BFS).
   */
  recomputeLight(): void {
    const t0 = performance.now();
    this.light.clear();
    const MAX = BrickWorld.LIGHT_MAX;
    const buckets: number[][] = Array.from({ length: MAX + 1 }, () => []);

    const seed = (x: number, y: number, z: number, level: number): void => {
      if (level <= 1) return;
      if (this.isOpenSky(x, y, z)) return;              // 열린 하늘은 계산으로 답한다
      const k = cellKey(x, y, z);
      if (this.occ.has(k)) return;                      // 브릭은 빛을 막는다
      if ((this.light.get(k) ?? 0) >= level) return;    // 이미 더 밝음
      this.light.set(k, level);
      buckets[level].push(x, y, z);
    };

    // ① 씨앗 — 브릭에 맞닿은 그늘 칸. 열린 하늘과 닿아 있으면 하늘빛이 새어 들어오고,
    //    발광 브릭 옆이면 그 자체가 광원이다.
    for (const id of this.visible) {
      const b = this.bricks.get(id);
      if (!b) continue;
      const emissive = b.mat === 'emissive';
      this.forEachFaceCell(b, (cx, cy, cz) => {
        if (this.isOpenSky(cx, cy, cz) || this.occ.has(cellKey(cx, cy, cz))) return;
        if (emissive) seed(cx, cy, cz, MAX);
        for (const [ox, oy, oz] of DIRS) {
          if (this.isOpenSky(cx + ox, cy + oy, cz + oz)) { seed(cx, cy, cz, MAX - 1); break; }
        }
      });
    }

    // ② 밝은 버킷부터 퍼뜨린다. seed는 항상 더 낮은 버킷에 넣으므로 순회 중 커지지 않는다.
    let processed = 0;
    for (let lv = MAX; lv > 1; lv--) {
      const arr = buckets[lv];
      for (let i = 0; i < arr.length; i += 3) {
        const x = arr[i], y = arr[i + 1], z = arr[i + 2];
        if (this.light.get(cellKey(x, y, z)) !== lv) continue; // 더 밝게 갱신된 항목
        if (++processed > BrickWorld.LIGHT_BUDGET) {
          this.lightStats = { cells: this.light.size, ms: performance.now() - t0 };
          return;
        }
        for (const [ox, oy, oz] of DIRS) seed(x + ox, y + oy, z + oz, lv - 1);
      }
    }
    this.lightStats = { cells: this.light.size, ms: performance.now() - t0 };
  }

  /**
   * 브릭 6면의 밝기 — **면 바로 바깥 칸**이 받는 하늘빛의 평균.
   * 반환 순서는 월드 기준 [+x, -x, +y, -y, +z, -z] (회전은 렌더러가 슬롯을 돌려 맞춘다).
   */
  faceLight(b: Brick, out: Float32Array): void {
    const e = extentOf(PARTS[b.part], b.rot);
    const x0 = b.x, y0 = b.y, z0 = b.z;
    const x1 = x0 + e.ex - 1, y1 = y0 + e.ey - 1, z1 = z0 + e.ez - 1;

    // 면마다 바로 바깥 칸들의 밝기를 평균. `lightAt`이 열린하늘·전파된 빛·막힘을 모두 처리한다.
    const avg = (
      ax: number, bx: number, ay: number, by: number, az: number, bz: number,
    ): number => {
      let sum = 0, n = 0;
      for (let cx = ax; cx <= bx; cx++)
        for (let cy = ay; cy <= by; cy++)
          for (let cz = az; cz <= bz; cz++) { sum += this.lightAt(cx, cy, cz); n++; }
      return n === 0 ? 1 : sum / n;
    };

    out[0] = avg(x1 + 1, x1 + 1, y0, y1, z0, z1); // +x
    out[1] = avg(x0 - 1, x0 - 1, y0, y1, z0, z1); // -x
    out[2] = avg(x0, x1, y1 + 1, y1 + 1, z0, z1); // +y
    out[3] = avg(x0, x1, y0 - 1, y0 - 1, z0, z1); // -y
    out[4] = avg(x0, x1, y0, y1, z1 + 1, z1 + 1); // +z
    out[5] = avg(x0, x1, y0, y1, z0 - 1, z0 - 1); // -z
  }

  /** 전량 재계산 — 대량 생성(불러오기·스트레스) 직후에만 쓴다 */
  recomputeAll(): void {
    this.visible.clear();
    this.studless.clear();
    for (const k of this.regionBricks.keys()) this.bumpRegion(k);
    this.regionBricks.clear();
    // refresh가 wasVisible=false로 보고 리전 멤버십을 새로 채운다
    for (const b of this.bricks.values()) this.refresh(b);
  }

  /** 대량 생성용 — 가시성 계산을 건너뛰고 넣는다. 끝나면 recomputeAll()을 불러야 한다 */
  placeFast(part: PartId, x: number, y: number, z: number, rot: Rot, color: string, mat: MatClass): number | null {
    if (!this.canPlace(part, x, y, z, rot)) return null;
    const b: Brick = { id: this.nextId++, part, x, y, z, rot, color, mat };
    this.bricks.set(b.id, b);
    this.forEachCell(b, (cx, cy, cz) => this.occ.set(cellKey(cx, cy, cz), b.id));
    this.raiseColumns(b); // 기둥 높이는 즉시 반영 — 드롭 계산이 항상 최신이어야 한다
    this.indexChunk(b);
    return b.id;
  }
}
