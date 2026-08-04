// 실행: npx tsx src/store/brickStore.test.ts
//
// 저장 ↔ 스트리밍 ↔ 지형 생성이 맞물리는 지점만 잠근다.
// 이 경로는 **틀려도 에러가 안 난다** — 땅이 조용히 사라지거나 판 구덩이가 도로 메워질 뿐이라,
// 새로고침을 해봐야 알 수 있다(실제로 그렇게 뒤늦게 발견됐다).

import { SURFACE_Y } from '@/lib/brick/terrain';
import type { ChunkCoord } from '@/lib/brick/grid';
import type { BrickSettings, BrickStorage, ChunkBlob, ChunkWrite } from '@/lib/brick/storage';
import { setBrickStorage, useBrickStore } from './brickStore';

let pass = 0;
const fails: string[] = [];
const ok = (cond: boolean, label: string) => { if (cond) pass++; else fails.push(label); };

/** 메모리 저장소 — 진짜 어댑터와 같은 규칙(data가 null이면 삭제)을 지킨다 */
function memoryStorage() {
  const chunks = new Map<string, { coord: ChunkCoord; data: Uint8Array }>();
  let settings: BrickSettings = {};
  const k = (c: ChunkCoord) => `${c.cx},${c.cy},${c.cz}`;
  const api: BrickStorage = {
    listChunks: async () => [...chunks.values()].map((v) => v.coord),
    loadChunk: async (c) => chunks.get(k(c))?.data ?? null,
    loadAll: async (): Promise<ChunkBlob[]> => [...chunks.values()],
    save: async (writes: ChunkWrite[]) => {
      for (const w of writes) {
        if (w.data === null) chunks.delete(k(w.coord));
        else chunks.set(k(w.coord), { coord: w.coord, data: w.data });
      }
    },
    loadSettings: async () => settings,
    saveSettings: async (s) => { settings = { ...settings, ...s }; },
    clear: async () => { chunks.clear(); },
  };
  return { api, chunks };
}

const store = () => useBrickStore.getState();
/** 새로고침 — 저장소는 그대로 두고 메모리 상태만 처음으로 되돌린 뒤 다시 읽는다 */
async function reload(s: BrickStorage): Promise<void> {
  setBrickStorage(s);
  await store().loadWorld();
}

async function main(): Promise<void> {
  // ── ★ 브릭 하나 놓고 새로고침 → 그 주변 땅이 남아 있어야 한다 ────────────
  // 청크는 세로로도 나뉜다. 지형은 y −3..−1(cy=1), 지면에 놓은 브릭은 y 0..2(cy=2).
  // "브릭만 든 청크"를 읽고 지형을 깔았다고 착각하면 그 기둥(8m×8m) 흙이 통째로 안 생긴다.
  {
    const { api } = memoryStorage();
    await reload(api);

    const before = store().world.at(0, SURFACE_Y, 0);
    ok(before !== undefined, '빈 월드를 열면 지형이 깔린다');

    // 지면에 브릭 하나
    const placed = store().place(0, 0, 0);
    ok(placed !== null, '지면에 브릭이 놓인다');
    await store().flush();

    await reload(api);
    ok(store().world.at(0, 0, 0) !== undefined, '새로고침해도 놓은 브릭이 남는다');
    ok(store().world.at(0, SURFACE_Y, 0) !== undefined, '★ 새로고침해도 브릭 주변 땅이 안 패인다');

    // 브릭에서 떨어진 같은 청크 안쪽도 (기둥 통째로 사라지는 버그였다)
    ok(store().world.at(8, SURFACE_Y, 8) !== undefined, '같은 청크의 다른 자리도 땅이 있다');
  }

  // ── ★★ 새로고침해도 **무늬(재료)** 가 살아 있어야 한다 ────────────────────
  //
  // 실제로 터진 버그(2026-08-02): 저장·디코드는 멀쩡한데 **불러올 때 `tex`를 안 넘겨서**
  // `placeFast`의 기본값 0(민짜)이 들어갔다. → 새로고침하면 **모든 브릭이 하얗게** 변한다.
  // 색은 넘기고 무늬만 빠뜨렸기 때문에 코드를 봐도 눈에 안 띄었고, 에러도 안 났다.
  // 놓은 직후엔 멀쩡해 보여서 **새로고침을 해봐야만** 드러난다 — 그래서 여기서 잠근다.
  {
    const { api } = memoryStorage();
    await reload(api);

    store().setTex(6);            // 벽돌
    store().setColor('#3355ff');  // 무늬와 색은 따로 저장된다 — 둘 다 확인한다
    const id = store().place(0, 0, 0);
    ok(id !== null, '무늬를 고르고 브릭을 놓는다');
    ok(store().world.bricks.get(id!)?.tex === 6, '놓은 직후 무늬가 6(벽돌)이다');
    await store().flush();

    await reload(api);
    const back = [...store().world.bricks.values()].find((b) => b.x === 0 && b.y === 0 && b.z === 0);
    ok(back !== undefined, '새로고침해도 브릭이 남는다');
    ok(back?.tex === 6, `★★ 새로고침해도 무늬가 살아 있다 — 지금 ${back?.tex}`);
    ok(back?.color.toLowerCase() === '#3355ff', `색도 살아 있다 — 지금 ${back?.color}`);
  }

  // ── ★★ 새로고침해도 **세운 방향(24방향)** 이 살아 있어야 한다 ──────────────
  //
  // 무늬(위)와 정확히 같은 계열의 함정이다(B-4). 읽는 쪽이 `rot & 3`으로 자르고 있었으므로,
  // 세우기를 붙이면서 마스크를 안 넓혔다면 **세운 브릭이 새로고침 때 조용히 눕는다.**
  // 인코딩만 보는 테스트는 이 결함을 영원히 통과시킨다 — 그래서 **왕복**으로 잠근다.
  {
    const { api } = memoryStorage();
    await reload(api);

    store().setPart('b1x4');
    store().setRot(6); // 눕히기 1(+X가 위) × 제자리 2 — 눕히기 0 밖의 값이라야 마스크를 검사한다
    const id = store().place(0, 0, 0);
    ok(id !== null, '세운 브릭이 놓인다');
    ok(store().world.bricks.get(id!)?.rot === 6, '놓은 직후 방향이 6이다');
    await store().flush();

    await reload(api);
    const back = [...store().world.bricks.values()].find((b) => b.part === 'b1x4');
    ok(back !== undefined, '새로고침해도 세운 브릭이 남는다');
    ok(back?.rot === 6, `★★ 새로고침해도 세운 방향이 살아 있다 — 지금 ${back?.rot}`);

    store().setPart('b2x4');
    store().setRot(0);
  }

  // ── 판 구덩이는 새로고침해도 메워지지 않는다 ─────────────────────────────
  {
    const { api } = memoryStorage();
    await reload(api);

    const dug = store().world.at(0, SURFACE_Y, 0)!;
    store().removeBrick(dug);
    ok(store().world.at(0, SURFACE_Y, 0) === undefined, '판 자리가 비었다');
    await store().flush();

    await reload(api);
    ok(store().world.at(0, SURFACE_Y, 0) === undefined, '★ 새로고침해도 판 구덩이가 안 메워진다');
    ok(store().world.at(8, SURFACE_Y, 8) !== undefined, '안 판 자리는 그대로 있다');
  }

  // ── 지면 청크를 통째로 비워도 되메워지지 않는다 (빈 청크 삭제 함정) ───────
  // 비었다고 저장소에서 지우면 다음 로드에서 읽을 게 없어 "다 파냈다"는 사실이 사라진다.
  {
    const { api, chunks } = memoryStorage();
    await reload(api);

    // 원점 지면 청크를 **정말로** 비운다.
    //   ★ 표면만 파면 `deepenAround`가 아래를 채워 청크가 안 비고, 그러면 이 테스트가
    //     버그를 못 잡는다(실제로 처음엔 사보타주가 통과해 버렸다).
    //     지면층(cy=1)이 덮는 y 범위를 전부 훑어 지운다.
    for (let y = -1; y >= -32; y--) {
      for (let x = 0; x < 16; x++) {
        for (let z = 0; z < 16; z++) {
          const id = store().world.at(x, y, z);
          if (id !== undefined) store().removeBrick(id);
        }
      }
    }
    ok(store().world.at(0, SURFACE_Y, 0) === undefined, '지면 청크를 비웠다');
    await store().flush();
    ok([...chunks.values()].some((c) => c.coord.cx === 0 && c.coord.cz === 0 && c.coord.cy === 1),
      '비워진 지면 청크도 저장소에 남는다(지우면 되메워진다)');

    await reload(api);
    let left = 0;
    for (let x = 0; x < 16; x += 2) for (let z = 0; z < 16; z += 2) if (store().world.at(x, SURFACE_Y, z)) left++;
    ok(left === 0, `★ 통째로 판 지면 청크가 되메워지지 않는다 — 남은 지형 ${left}`);
  }

  // ── 전체 지우기는 **처음 상태로** 되돌린다 (판 구덩이 유지와 헷갈리면 안 된다) ──
  // ★ 지면층을 "비어도 남기는" 규칙 때문에, 지우기가 저장소를 안 비우면
  //   그 빈 청크가 "다 파냈다"로 읽혀 새로고침 후 **바닥이 영영 안 깔린다**.
  {
    const { api, chunks } = memoryStorage();
    await reload(api);
    store().place(0, 0, 0);
    await store().flush();

    await store().clear();
    ok(chunks.size === 0, `지우기가 저장소를 비운다 — 남은 청크 ${chunks.size}`);
    ok(store().world.at(0, SURFACE_Y, 0) !== undefined, '지우기 직후 바로 바닥이 다시 깔린다(새로고침 없이)');
    ok(store().world.at(0, 0, 0) === undefined, '놓았던 브릭은 사라진다');

    await reload(api);
    ok(store().world.at(0, SURFACE_Y, 0) !== undefined, '★ 지우고 새로고침해도 바닥이 있다');
    ok(store().world.at(0, 0, 0) === undefined, '지운 브릭은 새로고침해도 안 돌아온다');
  }
  // ── ★★ 멀리 걸어도 로드된 청크가 무한히 쌓이지 않는다 ────────────────────
  // 🐛 언로드 판정을 **저장소 목록**으로 하고 있었다. 생성한 지형은 저장하지 않으므로
  //    그 목록에 없고 → `if (!c) continue`로 전부 빠져나가 **하나도 안 내려갔다.**
  //    실측(사용자): 로드 8,215청크 / 브릭 525,760개. 정상은 약 169청크.
  //    FPS는 리전 컬링이 버텨 줘서 안 죽었고, **메모리만 조용히 무한 증가**했다.
  {
    const { api } = memoryStorage();
    await reload(api);

    // 한 방향으로 멀리 걸어간다 (청크 8m × 40걸음 ≈ 320m)
    for (let i = 1; i <= 40; i++) await store().streamAround(i * 8, 0);

    const loaded = store().world.chunkCount;
    // 로드 반경 6 → 13×13 = 169, 언로드 반경 9 → 19×19 = 361이 이론 상한
    ok(loaded <= 400, `★ 멀리 걸어도 로드 청크가 상한 안 — ${loaded}개 (상한 400)`);
    ok(store().world.count < 30_000, `★ 브릭도 무한히 안 쌓인다 — ${store().world.count}개`);

    // 되돌아오면 땅이 다시 있어야 한다 (언로드하며 지형 기록을 잊으므로)
    await store().streamAround(0, 0);
    ok(store().world.at(0, SURFACE_Y, 0) !== undefined, '★ 되돌아오면 지형이 다시 깔린다');
  }

  // ── 되돌아왔을 때 **판 구덩이는 그대로** (기록을 잊어도 저장분이 이긴다) ──
  {
    const { api } = memoryStorage();
    await reload(api);
    const dug = store().world.at(0, SURFACE_Y, 0)!;
    store().removeBrick(dug);
    await store().flush();

    for (let i = 1; i <= 40; i++) await store().streamAround(i * 8, 0); // 멀리 갔다가
    await store().streamAround(0, 0);                                   // 돌아온다
    ok(store().world.at(0, SURFACE_Y, 0) === undefined, '★ 멀리 갔다 와도 판 구덩이가 유지된다');
    ok(store().world.at(8, SURFACE_Y, 8) !== undefined, '안 판 자리는 다시 깔린다');
  }

  // ── 되돌리기 ────────────────────────────────────────────────────────────
  // 브릭 편집은 결국 "추가/삭제"뿐이라 명령만 쌓으면 정확히 되돌아가야 한다.
  //   ⚠️ id는 되살릴 때마다 새로 발급된다 — 그 갱신이 틀리면 **다시 실행(redo)이 엉뚱한 브릭을 지운다.**
  {
    const { api } = memoryStorage();
    await reload(api);
    const s = store;

    // ① 놓기 → 되돌리기 → 사라짐 → 다시 실행 → 되살아남
    const before = s().world.count;
    s().beginBatch();
    const id = s().place(0, SURFACE_Y + 3, 0);
    s().endBatch();
    ok(id !== null, '놓기 성공');
    ok(s().world.count === before + 1, '놓으면 하나 늘어난다');
    s().undo();
    ok(s().world.count === before, '★ 되돌리면 방금 놓은 브릭이 사라진다');
    s().redo();
    ok(s().world.count === before + 1, '★ 다시 실행하면 되살아난다');
    ok(s().world.at(0, SURFACE_Y + 3, 0) !== undefined, '되살아난 자리가 원래 자리다');
    s().undo(); // 정리
  }

  // ② 지우기 → 되돌리기 = 되살아남 (지형은 아래를 채운 것까지 함께 되돌린다)
  {
    const { api } = memoryStorage();
    await reload(api);
    const s = store;
    const dug = s().world.at(0, SURFACE_Y, 0)!;
    const before = s().world.count;
    s().removeBrick(dug);
    ok(s().world.at(0, SURFACE_Y, 0) === undefined, '지형이 파였다');
    s().undo();
    ok(s().world.at(0, SURFACE_Y, 0) !== undefined, '★ 되돌리면 판 지형이 되살아난다');
    ok(s().world.count === before, `★ 파며 채운 브릭까지 함께 되돌아간다 — ${s().world.count} vs ${before}`);
  }

  // ③ 연속 놓기 한 획 = **되돌리기 한 번** (BRICK_PLAN.md §1-b)
  //    바닥 한 층을 드래그로 깔았는데 Ctrl+Z를 열 번 눌러야 한다면 쓸 수 없다.
  {
    const { api } = memoryStorage();
    await reload(api);
    const s = store;
    const Y = SURFACE_Y + 3;
    const before = s().world.count;
    s().beginBatch();
    for (let i = 0; i < 6; i++) s().place(i * 2, Y, 0); // 드래그로 6칸 깔았다고 치고
    s().endBatch();
    ok(s().world.count === before + 6, '한 획으로 6개가 놓인다');
    s().undo();
    ok(s().world.count === before, '★ 연속 놓기 한 획이 되돌리기 한 번');
    ok(s().world.at(0, Y, 0) === undefined && s().world.at(10, Y, 0) === undefined, '★ 처음도 끝도 남지 않는다');
    s().redo();
    ok(s().world.count === before + 6, '★ 다시 실행하면 6개가 다시 놓인다');
  }

  // ④ 새 편집이 생기면 '다시 실행'은 사라진다 (분기된 미래를 남기지 않는다)
  {
    const { api } = memoryStorage();
    await reload(api);
    const s = store;
    s().beginBatch(); s().place(0, SURFACE_Y + 3, 0); s().endBatch();
    s().undo();
    ok(s().redoDepth === 1, '되돌린 뒤엔 다시 실행이 있다');
    s().beginBatch(); s().place(2, SURFACE_Y + 3, 2); s().endBatch();
    ok(s().redoDepth === 0, '★ 새로 놓으면 다시 실행이 버려진다');
  }

  // ⑤ 전체 지우기는 되돌릴 수 없다 — 되돌릴 수 있는 척하면 안 된다
  {
    const { api } = memoryStorage();
    await reload(api);
    const s = store;
    s().beginBatch(); s().place(0, SURFACE_Y + 3, 0); s().endBatch();
    ok(s().undoDepth > 0, '편집이 쌓여 있다');
    await s().clear();
    ok(s().undoDepth === 0 && s().redoDepth === 0, '★ 전체 지우기 뒤엔 되돌리기 스택이 비어 있다');
  }

  // ⑥ 되돌릴 것이 없을 때 호출해도 안전(빈 스택에서 터지지 않는다)
  {
    const { api } = memoryStorage();
    await reload(api);
    const s = store;
    const n = s().world.count;
    s().undo(); s().undo(); s().redo();
    ok(s().world.count === n, '빈 스택에서 undo/redo 해도 월드가 안 변한다');
  }

  // ⑦ 지우기 드래그 한 획 = 되돌리기 한 번 (BRICK_PLAN.md §1)
  //    벽을 드래그로 허물었는데 Ctrl+Z를 20번 눌러야 한다면 쓸 수 없다.
  {
    const { api } = memoryStorage();
    await reload(api);
    const s = store;
    // 브릭 20개를 미리 쌓는다(한 획으로 지울 대상)
    const ids: number[] = [];
    s().beginBatch();
    for (let i = 0; i < 20; i++) {
      const id = s().place(i * 2, SURFACE_Y + 3, 0);
      if (id !== null) ids.push(id);
    }
    s().endBatch();
    ok(ids.length === 20, `지울 브릭 20개 준비 — ${ids.length}개`);
    const before = s().world.count;

    // 한 획으로 전부 지운다(BrickBuilder의 pointerdown~up과 같은 순서)
    s().beginBatch();
    for (const id of ids) s().removeBrick(id);
    s().endBatch();
    ok(s().world.count === before - 20, '드래그 한 획으로 20개가 지워진다');

    s().undo();
    ok(s().world.count === before, '★ Ctrl+Z 한 번에 20개가 전부 돌아온다');
    ok(s().world.at(0, SURFACE_Y + 3, 0) !== undefined && s().world.at(38, SURFACE_Y + 3, 0) !== undefined,
      '★ 처음과 끝 브릭이 제자리에 돌아왔다');

    s().redo();
    ok(s().world.count === before - 20, '★ 다시 실행하면 다시 20개가 지워진다');
  }
}

void main().then(() => {
  console.log(`\n브릭 스토어(저장 ↔ 스트리밍 ↔ 지형) 테스트: ${pass}/${pass + fails.length} 통과`);
  if (fails.length) {
    console.log('\n실패:');
    for (const f of fails) console.log('  ✗ ' + f);
    process.exit(1);
  }
});
