// 브릭 월드 자료구조 — 기준: doc/BRICK_SYSTEM.md §3.2
//
// ★ 셀 배열이 아니라 **브릭 레코드 리스트**다.
//   마인크래프트는 "1셀 = 1블록"이라 셀 배열이 자연스럽지만, 브릭은 여러 셀에 걸친다
//   (2×4 브릭 하나가 2×3×4 = 24셀). 셀마다 저장하면 24배 낭비다.
//   → 저장은 레코드, "이 칸 비었나" 조회는 파생 점유 격자(occ).

import {
  cellKey, chunkCoordOf, chunkKey, colKey, colKeyX, colKeyZ,
  COL_STEP_X, COL_STEP_Z, DIRS, regionKeyOf, Y_MAX, Y_MIN, type ChunkCoord, type Rot,
} from './grid';
import { extentOf, occludes, PARTS, type MatClass, type PartId } from './parts';

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
  /** 무늬(재료) 칸 번호 — 0 = 민짜. `textures.ts`의 `BRICK_TEXTURES` 참고 */
  tex: number;
}

export class BrickWorld {
  readonly bricks = new Map<number, Brick>();
  /** cellKey → brickId. 레코드에서 파생되며 저장하지 않는다 */
  private readonly occ = new Map<number, number>();
  /** colKey → 그 기둥에서 가장 높은 점유 칸 + 1 (= 그 위에 얹힐 수 있는 첫 칸). 비었으면 항목 없음 */
  private readonly colTop = new Map<number, number>();
  private nextId = 1;

  /**
   * 다음에 발급될 brickId. **되돌리기가 "이 호출이 무엇을 새로 만들었나"를 알아내는 데 쓴다.**
   * (예: 지형을 파면 `deepenAround`가 아래를 채우며 브릭을 여러 개 만든다 — 그것도 함께 되돌려야 한다)
   */
  get nextBrickId(): number {
    return this.nextId;
  }

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
  /** 이 브릭을 그리는가 — 완전히 파묻히면 false (테스트·디버깅용) */
  isVisible(id: number): boolean { return this.visible.has(id); }

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

  place(part: PartId, x: number, y: number, z: number, rot: Rot, color: string, mat: MatClass, tex = 0): number | null {
    if (!this.canPlace(part, x, y, z, rot)) return null;
    const b: Brick = { id: this.nextId++, part, x, y, z, rot, color, mat, tex };
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
    this.solidBelow.clear();
    this.visible.clear();
    this.studless.clear();
    this.byChunk.clear();
    for (const k of this.regionBricks.keys()) this.bumpRegion(k); // 렌더러가 비워진 걸 알도록
    this.regionBricks.clear();
    this.pendingFast.length = 0;
    this.light.clear();
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
    // 빠지는 브릭에 가려져 있던 이웃은 다시 보여야 한다 — 지우기 전에 모아 둔다
    const nbrs = new Set<number>();
    for (const id of [...ids]) {
      const b = this.bricks.get(id);
      if (!b) continue;
      this.forEachFaceCell(b, (cx, cy, cz) => {
        const nid = this.occ.get(cellKey(cx, cy, cz));
        if (nid !== undefined && !ids.has(nid)) nbrs.add(nid);
      });
      this.forEachCell(b, (cx, cy, cz) => this.occ.delete(cellKey(cx, cy, cz)));
      this.bricks.delete(id);
      if (this.visible.has(id)) this.setRegionMember(b, false);
      this.visible.delete(id);
      this.studless.delete(id);
      this.forEachColumn(b, (cx, cz) => this.recomputeColumn(cx, cz));
    }
    for (const id of nbrs) {
      const b = this.bricks.get(id);
      if (b) this.refresh(b);
    }
    this.byChunk.delete(key);
    this.chunkCoord.delete(key);
    return n;
  }

  hasChunk(key: number): boolean { return this.byChunk.has(key); }

  loadedChunkKeys(): number[] { return [...this.byChunk.keys()]; }

  /**
   * 지금 메모리에 올라와 있는 청크의 **키와 좌표**.
   *
   * ★ 언로드 판정은 **반드시 이걸로** 해야 한다. 저장소 목록(`chunkIndex`)으로 하면
   *   **생성한 지형이 영원히 안 내려간다** — 손 안 댄 지형은 저장하지 않으므로
   *   저장소 목록에 없고, 그래서 판정에서 통째로 건너뛰어졌다.
   *   실측: 걸어 다니다 보니 로드 8,215청크 / 브릭 525,760개(정상은 약 169청크).
   */
  loadedChunks(): { key: number; coord: ChunkCoord }[] {
    const out: { key: number; coord: ChunkCoord }[] = [];
    for (const key of this.byChunk.keys()) {
      const coord = this.chunkCoord.get(key);
      if (coord) out.push({ key, coord });
    }
    return out;
  }

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

  // ★ 기둥 높이는 **음수도 다뤄야 한다** — 바닥을 파면 지형이 지면(y=0) 아래에 남는다.
  //   예전엔 0을 바닥으로 가정해 `?? 0` / `top > 0`으로 잘랐는데, 그러면 판 구멍 안에 브릭이
  //   못 얹히고 지면 높이에 떠 버린다.

  private raiseColumns(b: Brick): void {
    const top = b.y + extentOf(PARTS[b.part], b.rot).ey;
    this.forEachColumn(b, (cx, cz) => {
      const k = colKey(cx, cz);
      const cur = this.colTop.get(k);
      if (cur === undefined || top > cur) this.colTop.set(k, top);
    });
  }

  /** 현재 높이에서 아래로 훑어 실제 꼭대기를 다시 찾는다(위에 뭐가 남아 있으면 즉시 멈춤) */
  private recomputeColumn(x: number, z: number): void {
    const k = colKey(x, z);
    const cur = this.colTop.get(k);
    if (cur === undefined) return;
    let top = cur;
    while (top > Y_MIN && !this.occ.has(cellKey(x, top - 1, z))) top--;
    if (top <= Y_MIN) this.colTop.delete(k); // 이 기둥엔 아무것도 없다
    else this.colTop.set(k, top);
  }

  /** 그 기둥 꼭대기 = 얹힐 수 있는 첫 칸. 아무것도 없으면 지면(0) */
  topOfColumn(x: number, z: number): number {
    return this.colTop.get(colKey(x, z)) ?? 0;
  }

  /**
   * 이 발자국이 내려앉을 높이. 발밑에서 **가장 높은** 기둥 위에 얹힌다.
   * → 겹침이 구조적으로 불가능해지고, 일부만 걸쳐도(오버행) 그 높이로 올라간다.
   */
  restY(part: PartId, x: number, z: number, rot: Rot): number {
    const e = extentOf(PARTS[part], rot);
    let top = -Infinity;
    for (let dx = 0; dx < e.ex; dx++)
      for (let dz = 0; dz < e.ez; dz++) {
        const t = this.topOfColumn(x + dx, z + dz); // 파낸 구멍 안이면 음수
        if (t > top) top = t;
      }
    return top === -Infinity ? 0 : top;
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

  /**
   * 이 칸이 시야를 **막는가**.
   *
   * ★ 차 있다고 다 막는 게 아니다 — **경사는 대각선이 뚫려 있다.**
   *   경사를 '막힘'으로 치면 그 너머 브릭이 안 그려지고, 뚫린 쪽으로 **구멍**이 보인다.
   *   (마인크래프트가 계단·반블록을 non-occluding으로 두는 것과 같은 이유)
   */
  private blocks(cx: number, cy: number, cz: number): boolean {
    const id = this.occ.get(cellKey(cx, cy, cz));
    if (id === undefined) return false;
    const nb = this.bricks.get(id);
    return nb !== undefined && occludes(nb.part);
  }

  /** 표면에 맞닿은 칸이 하나라도 비어 있으면 보인다 (자기 몸통이 채운 칸도 '막힘'으로 친다) */
  private isBuried(b: Brick): boolean {
    let buried = true;
    this.forEachCell(b, (cx, cy, cz) => {
      if (!buried) return;
      for (const [ox, oy, oz] of DIRS) {
        if (!this.blocks(cx + ox, cy + oy, cz + oz)) { buried = false; return; }
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

  // ── 빛 ────────────────────────────────────────────────────────────────
  // 마인크래프트처럼 **구운 빛**으로 입체감을 낸다. 실시간 그림자는 쓰지 않는다
  // (12만 브릭 실측: 그림자 패스가 프레임의 절반인 10.3ms를 먹었다).
  // 최종 면 밝기 = **하늘빛 전파(BFS)** × **면 방향 고정 배율(FACE_TONE)**.

  /** 완전한 암흑은 만들지 않는다 — 실내가 새까매지면 아무것도 안 보인다 */
  private static readonly SKY_MIN = 0.16;

  /**
   * 면 방향 고정 배율 [+x, -x, +y, -y, +z, -z] — **마인크래프트가 입체감을 내는 방식**.
   *
   * ★ 마인크래프트엔 **태양 방향이 없다.** 블록을 쌓아도 다른 블록에 그림자가 지지 않고,
   *   카메라를 돌려도 면 밝기가 변하지 않는다. 면이 어느 쪽을 보는지에 따라
   *   **고정된 배율**(윗면 1.0 · 남북 0.8 · 동서 0.6 · 밑면 0.5)을 곱할 뿐이다.
   *   실시간 방향광을 쓰면 그 위에 **움직이는 음영**이 겹쳐, 어떤 면은 직사광선처럼
   *   번쩍이고 어떤 면은 죽는다(사용자 피드백). 그래서 방향광 대신 이 표를 쓴다.
   */
  private static readonly FACE_TONE = [0.6, 0.6, 1.0, 0.5, 0.8, 0.8] as const;

  // ── 빛 전파 (BFS) ─────────────────────────────────────────────────────
  // 하늘빛이 문틈으로 새어 들어오고, 발광 브릭이 주변을 밝힌다.
  //
  // ★ 무한 맵인데 BFS가 폭발하지 않는 이유:
  //   **열린 하늘 칸은 아예 다루지 않는다.** `y >= colTop`이면 항상 최대 밝기라 O(1)로 답이 나오고,
  //   저장할 필요도 전파할 필요도 없다. BFS는 **그늘진 공기**(구조물 안쪽)만 훑으므로
  //   탐색 범위가 사용자가 지은 만큼으로 자연히 한정된다.

  // 전파 거리(칸). 짧으면 실내가 급격히 어두워진다 — 20으로 줄였더니 "그림자가 심하다"는
  // 피드백이 나와 되돌렸다. 비용은 씨앗 탐색이 지배하므로 이 값과 거의 무관하다.
  private static readonly LIGHT_MAX = 30;
  /** 병적인 구조(거대한 밀폐 공간)에서 멈추도록 하는 상한 */
  private static readonly LIGHT_BUDGET = 400_000;

  /** cellKey → 0..LIGHT_MAX. **그늘진 공기 칸만** 담는다(열린 하늘은 계산으로 답한다) */
  private readonly light = new Map<number, number>();

  /**
   * colKey → 이 y **미만은 아직 파내지 않은 땅속**. 빛이 통하지 않는다.
   *
   * ★ 없으면 빛 BFS가 폭발한다: 지형은 한 겹뿐이고 그 아래는 빈 칸이라,
   *   지형 가장자리에서 들어온 빛이 **땅 밑 전체를 훑는다**(실측 35만 칸 · 510ms).
   *   땅 밑은 공기가 아니라 안 판 땅이므로 막아야 한다. (지형 모듈이 채울 때마다 알려준다)
   */
  private readonly solidBelow = new Map<number, number>();

  /** 지형이 "이 기둥은 y 아래로 안 판 땅"이라고 알려준다 */
  markSolidBelow(x: number, z: number, y: number): void {
    const k = colKey(x, z);
    const cur = this.solidBelow.get(k);
    if (cur === undefined || y < cur) this.solidBelow.set(k, y);
  }

  private isUnminedGround(x: number, y: number, z: number): boolean {
    const b = this.solidBelow.get(colKey(x, z));
    return b !== undefined && y < b;
  }
  /** 마지막 계산 통계 — 성능 확인용 */
  lightStats = { cells: 0, ms: 0 };

  /**
   * 위가 뻥 뚫린 칸인가 (colTop 정의상 이런 칸은 비어 있다).
   *
   * ★ **아무것도 없는 기둥은 `Y_MIN` 기준** — 즉 통째로 열린 하늘로 본다.
   *   `topOfColumn`처럼 0을 기본값으로 쓰면, 지형이 없는 기둥의 `y<0`이 전부 "그늘진 공기"가 되어
   *   **BFS가 지형 가장자리에서 무한한 빈 지하로 흘러넘친다**(실측 43만 칸 · 485ms).
   *   땅이 아예 없는 곳은 지하가 아니라 허공이므로 탐색 대상이 아니다.
   *   (배치용 `topOfColumn`은 지면(0) 기본값을 유지 — 빈 곳에 놓으면 지면 높이에 놓여야 하므로)
   */
  private isOpenSky(x: number, y: number, z: number): boolean {
    return y >= (this.colTop.get(colKey(x, z)) ?? Y_MIN);
  }

  /** 이 칸의 최종 밝기 0..1 */
  lightAt(x: number, y: number, z: number): number {
    if (this.isOpenSky(x, y, z)) return 1;
    if (this.occ.has(cellKey(x, y, z)) || this.isUnminedGround(x, y, z)) return BrickWorld.SKY_MIN; // 막힌 칸 · 안 판 땅속
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
   *
   * ★ 다시 구운 값은 **리전을 올려야 화면에 닿는다.** 렌더러(`Region`)는 리전 리비전이
   *   바뀔 때만 인스턴스 버퍼를 다시 쓴다. 예전엔 여기서 리비전을 안 올려서,
   *   빛 지도는 맞는데 **화면은 옛 값 그대로**였다 — 다른 이유로 리빌드된 리전만
   *   우연히 새 값을 받아 "어떤 브릭은 바뀌고 어떤 브릭은 안 바뀐다"로 보였다.
   *
   *   게다가 배치 순간 리빌드되는 리전은 **빛 재계산 전**이라 틀린 값으로 구워진다
   *   (`colTop`은 즉시 오르는데 빛 지도는 140ms 뒤 갱신 → 그 아래 칸이 잠깐 SKY_MIN).
   *   리비전을 올리면 그 오값도 여기서 덮인다.
   */
  recomputeLight(): void {
    this.bakeLight();
    for (const k of this.regionBricks.keys()) this.bumpRegion(k);
  }

  /** 실제 굽기 — 예산 초과로 중간에 나가는 길이 있어 리전 올리기와 분리했다 */
  private bakeLight(): void {
    const t0 = performance.now();
    this.light.clear();
    const MAX = BrickWorld.LIGHT_MAX;
    const buckets: number[][] = Array.from({ length: MAX + 1 }, () => []);

    const seed = (x: number, y: number, z: number, level: number): void => {
      if (level <= 1) return;
      if (this.isOpenSky(x, y, z)) return;              // 열린 하늘은 계산으로 답한다
      const k = cellKey(x, y, z);
      if (this.occ.has(k) || this.isUnminedGround(x, y, z)) return; // 브릭·안 판 땅속은 빛을 막는다
      if ((this.light.get(k) ?? 0) >= level) return;    // 이미 더 밝음
      this.light.set(k, level);
      buckets[level].push(x, y, z);
    };

    // ① 하늘빛 씨앗 — **하늘과 그늘이 만나는 자리**만 훑는다.
    //
    //    ★ 그런 자리는 **옆에만** 있다. 그늘 칸의 정의가 `y < colTop`이므로,
    //      바로 위 칸(`y+1 >= colTop`)이 열린 하늘이려면 그 칸은 기둥 꼭대기 = **브릭**이다.
    //      아래도 마찬가지. 즉 **하늘빛은 항상 옆(4방향)에서 들어온다.**
    //    → 기둥마다 "이웃 기둥이 낮아서 옆이 트인 높이 구간"만 보면 된다.
    //      평평한 지형은 이웃 높이가 같아 구간이 비므로 **비용이 0**이다.
    //
    //    예전엔 브릭 표면 칸을 전부 훑었다(브릭당 32칸). 평평한 지형에서도
    //    "씨앗이 없다"는 사실을 증명하는 데만 94ms가 들었다.
    //
    //    ※ 기둥이 수만 개라 **루프 안의 할당·좌표 복원이 실측으로 드러난다**(43k 기둥에서 36ms).
    //      이웃 키는 더하기로 얻고(`COL_STEP_*`), 좌표 복원은 실제로 씨앗이 있을 때만 한다.
    this.colTop.forEach((top, ck) => {
      const floor = this.solidBelow.get(ck) ?? Y_MIN; // 안 판 땅속은 볼 필요 없다
      let x = 0, z = 0, gotXZ = false;
      for (let d = 0; d < 4; d++) {
        const nk = d === 0 ? ck + COL_STEP_X : d === 1 ? ck - COL_STEP_X
          : d === 2 ? ck + COL_STEP_Z : ck - COL_STEP_Z;
        const nTop = this.colTop.get(nk) ?? Y_MIN;
        let y = nTop > floor ? nTop : floor;
        if (y >= top) continue;                       // 이웃이 낮지 않다 = 트인 구간 없음
        if (!gotXZ) { x = colKeyX(ck); z = colKeyZ(ck); gotXZ = true; }
        for (; y < top; y++) seed(x, y, z, MAX - 1);
      }
    });

    // ② 발광 브릭 — 스스로 광원이므로 맞닿은 칸을 직접 밝힌다(보이는 것만).
    for (const id of this.visible) {
      const b = this.bricks.get(id);
      if (!b || b.mat !== 'emissive') continue;
      this.forEachFaceCell(b, (cx, cy, cz) => seed(cx, cy, cz, MAX));
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
   * **꼭짓점 여덟 개의 밝기** — 부드러운 조명(정점 단위)의 재료.
   *
   * ★ 면 하나에 값 하나면 **면 전체가 통짜로 같은 밝기**라, 벽 모서리·구덩이 안이 계단처럼 각져 보인다.
   *   꼭짓점마다 값을 주면 래스터라이저가 면 안에서 **알아서 보간**해 부드러워진다(복셀 엔진 표준).
   *
   * 값 = 그 꼭짓점에 닿는 **여덟 칸**의 평균. 면 평균과 같은 규칙으로 **막힌 칸은 뺀다** —
   * 가려져 안 보이는 부분이 보이는 부분의 밝기를 끌어내리면 안 된다.
   *
   * ⚠️ **면 배율(FACE_TONE)은 곱하지 않는다.** 한 꼭짓점을 세 면이 공유하는데 면마다 배율이 다르므로,
   *   배율은 셰이더가 **그 면의 월드 법선**을 보고 곱한다.
   *
   * 순서: `i + 2j + 4k` (i=+x, j=+y, k=+z 쪽이면 1) — **월드 기준**.
   *   회전한 브릭은 렌더러가 로컬 슬롯으로 옮겨 담는다(`CORNER_MAP`).
   */
  cornerLight(b: Brick, out: Float32Array): void {
    const e = extentOf(PARTS[b.part], b.rot);
    const x0 = b.x, y0 = b.y, z0 = b.z;
    const x1 = x0 + e.ex - 1, y1 = y0 + e.ey - 1, z1 = z0 + e.ez - 1;

    for (let k = 0; k < 2; k++) {
      // 그 꼭짓점에 닿는 두 칸(안쪽 한 칸 + 바깥 한 칸)
      const zs = k === 0 ? [z0 - 1, z0] : [z1, z1 + 1];
      for (let j = 0; j < 2; j++) {
        const ys = j === 0 ? [y0 - 1, y0] : [y1, y1 + 1];
        for (let i = 0; i < 2; i++) {
          const xs = i === 0 ? [x0 - 1, x0] : [x1, x1 + 1];
          let sum = 0, n = 0, blocked = 0;
          for (const cx of xs) for (const cy of ys) for (const cz of zs) {
            const solid = this.occ.has(cellKey(cx, cy, cz)) || this.isUnminedGround(cx, cy, cz);
            // 자기 몸은 자기 꼭짓점을 가리지 않는다 — 축마다 안쪽 좌표 하나씩이라 딱 한 칸이다
            const own = cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1 && cz >= z0 && cz <= z1;
            if (solid && !own) blocked++;
            if (this.occ.has(cellKey(cx, cy, cz))) continue; // 가려진 쪽은 안 보인다
            sum += this.lightAt(cx, cy, cz); n++;
          }
          const sky = n === 0 ? BrickWorld.SKY_MIN : sum / n;
          out[i + 2 * j + 4 * k] = sky * BrickWorld.cornerAO(blocked);
        }
      }
    }
  }

  /**
   * **구석 그늘(AO)** — 꼭짓점에 닿는 바깥 일곱 칸 중 막힌 칸 수로 깎는다.
   *
   * ★ 기준은 `FLAT`(=3)이다. 평평한 면의 꼭짓점은 **항상 이웃 세 칸이 막혀 있다**
   *   (같은 평면의 이웃 셋). 거기서 더 막힌 만큼만 깎으므로:
   *   - 평평한 바닥·벽, 볼록한 모서리 → **1.0, 지금 룩 그대로**
   *   - 벽과 바닥이 만나는 안쪽 구석 → 어두워진다
   *   즉 **밝아지는 곳은 없고 오목한 자리만 어두워진다.** 전역 밝기가 흔들리지 않는다.
   *
   * `blocked`를 세는 데 안 판 땅속도 포함한다 — 실제로 빛을 막으므로 구덩이 벽·바닥에도 그늘이 진다.
   */
  //
  // ★ **응답은 선형이 아니라 `√`다** — 마인크래프트의 "밑동에 지는 진한 접촉 그늘"이 이 모양이다.
  //   첫 접촉(막힌 칸 하나)에서 확 떨어지고 그 뒤론 완만하다. 선형으로 깎으면 둘 중 하나가 된다:
  //   세기를 낮추면 **밑동이 안 보이고**, 올리면 **깊은 구석이 새까매져 얼룩**이 된다(둘 다 실제로 겪었다).
  //
  //     막힌 칸  평면 1.00 · 벽 하나 0.70 · ㄱ자 구석 0.58 · 깊은 구석 0.40
  //
  // ※ 번지는 폭(= 파츠 한 칸)은 못 줄이지만 **줄일 필요도 없다** — 지형 타일이 1m라
  //   마인크래프트 블록(1m)과 폭이 같다. 예전에 "넓다"고 본 건 폭이 아니라 세기 문제였다.
  // ⚠️ **셰이더의 `SHADE_CURVE`와 한 쌍이다.** 여기 값은 **곡선을 먹기 전의 원값**이라
  //   화면보다 어둡게 잡혀 있다(접촉 0.40 → 화면 0.56). 한쪽만 바꾸면 접촉 그늘이 무너진다.
  private static readonly AO_STRENGTH = 1.2;
  private static readonly AO_MIN = 0.25;     // 하한 — 더 깊은 구석은 여기서 포화한다(화면 0.37)
  private static cornerAO(blocked: number): number {
    const FLAT = 3, OUTSIDE = 7;
    const over = blocked - FLAT;
    if (over <= 0) return 1;
    const ao = 1 - BrickWorld.AO_STRENGTH * Math.sqrt(over / (OUTSIDE - FLAT));
    return ao < BrickWorld.AO_MIN ? BrickWorld.AO_MIN : ao;
  }

  /** 전량 재계산 — **월드 전체**를 다시 굽는다. 첫 로드·스트레스 테스트에만 쓸 것 */
  recomputeAll(): void {
    this.visible.clear();
    this.studless.clear();
    for (const k of this.regionBricks.keys()) this.bumpRegion(k);
    this.regionBricks.clear();
    this.pendingFast.length = 0;
    // refresh가 wasVisible=false로 보고 리전 멤버십을 새로 채운다
    for (const b of this.bricks.values()) this.refresh(b);
  }

  /** `placeFast`로 넣어 아직 가시성을 안 잡은 브릭들 */
  private pendingFast: number[] = [];

  /**
   * **방금 넣은 브릭 주변만** 가시성을 다시 잡는다.
   *
   * ★ `recomputeAll`은 로드된 브릭 전부를 훑고 **모든 리전을 갱신 대상으로 표시**해
   *   렌더러가 인스턴스 버퍼를 통째로 다시 만든다 — 실측 24~33ms(지형 1만 블록).
   *   스트리밍 한 걸음마다, 땅 한 번 팔 때마다 그걸 하면 그대로 끊김이 된다.
   *   새 브릭이 바꿀 수 있는 건 **자기 자신과 맞닿은 브릭의 가시성**뿐이므로 그만 훑는다.
   */
  refreshPending(): void {
    if (this.pendingFast.length === 0) return;
    // 들어온 양이 월드의 상당 부분이면(첫 로드) **전량이 더 싸다** —
    // 주변 훑기는 브릭마다 면 칸 32개를 보므로 대량일 땐 오히려 비싸다(실측 100ms vs 28ms).
    if (this.pendingFast.length * 3 >= this.bricks.size) { this.recomputeAll(); return; }
    const seen = new Set<number>();
    const touch = (id: number): void => {
      if (seen.has(id)) return;
      const b = this.bricks.get(id);
      if (!b) return;
      seen.add(id);
      this.refresh(b);
    };
    for (const id of this.pendingFast) {
      const b = this.bricks.get(id);
      if (!b) continue;
      touch(id);
      // 새 브릭이 이웃을 덮으면 그 이웃이 숨겨지거나 돌기가 없어진다
      this.forEachFaceCell(b, (cx, cy, cz) => {
        const nid = this.occ.get(cellKey(cx, cy, cz));
        if (nid !== undefined) touch(nid);
      });
    }
    this.pendingFast.length = 0;
  }

  /** 대량 생성용 — 가시성 계산을 미룬다. 끝나면 `refreshPending()`을 부를 것 */
  placeFast(part: PartId, x: number, y: number, z: number, rot: Rot, color: string, mat: MatClass, tex = 0): number | null {
    if (!this.canPlace(part, x, y, z, rot)) return null;
    const b: Brick = { id: this.nextId++, part, x, y, z, rot, color, mat, tex };
    this.bricks.set(b.id, b);
    this.forEachCell(b, (cx, cy, cz) => this.occ.set(cellKey(cx, cy, cz), b.id));
    this.raiseColumns(b); // 기둥 높이는 즉시 반영 — 드롭 계산이 항상 최신이어야 한다
    this.indexChunk(b);
    this.pendingFast.push(b.id);
    return b.id;
  }
}
