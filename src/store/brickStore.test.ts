// 실행: npx tsx src/store/brickStore.test.ts
//
// 저장 ↔ 스트리밍 ↔ 지형 생성이 맞물리는 지점만 잠근다.
// 이 경로는 **틀려도 에러가 안 난다** — 땅이 조용히 사라지거나 판 구덩이가 도로 메워질 뿐이라,
// 새로고침을 해봐야 알 수 있다(실제로 그렇게 뒤늦게 발견됐다).

import { SURFACE_Y } from '@/lib/brick/terrain';
import { chunkCoordOf, type ChunkCoord } from '@/lib/brick/grid';
import { encodeChunk } from '@/lib/brick/serialize';
import { PARTS, unitOf } from '@/lib/brick/parts';
import { bricksOfProp } from '@/lib/brick/props';
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
    // ★ 1×4는 **단위 b1x1 네 개**로 놓인다(§20). 방향은 단위마다 그대로 전달돼야 한다
    ok(store().world.bricks.get(id!)?.part === 'b1x1', '1×4가 1×1 단위로 놓인다');
    ok(store().world.bricks.get(id!)?.rot === 6, '놓은 직후 방향이 6이다');
    await store().flush();

    await reload(api);
    const back = store().world.bricks.get(store().world.at(0, 0, 0)!);
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
    //    ★ 여기는 **되돌리기 자체**를 보는 곳이라 파츠를 1×1로 고정한다(개수가 1:1이라 읽기 쉽다).
    //      큰 파츠가 여러 개로 갈라지는 것은 아래 ⑧에서 따로 잠근다.
    s().setPart('b1x1');
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
    s().setPart('b1x1');
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
    s().setPart('b1x1'); // 지우기는 **브릭 하나씩**이므로 1:1로 세는 편이 읽기 쉽다
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

  // ── ⑧ ★★ 큰 파츠는 **1×1 단위 여러 개**로 놓인다 (BRICK_PLAN.md §20) ──────
  //    사용자 지시: "2×4는 하나의 브릭으로 보이는데 1개씩 따로 떨어진 것으로 보였으면.
  //    사용자 편의로 1개짜리 브릭이 2×4로 하나처럼 쌓게 하는 거지. 지우는 건 1×1 하나씩."
  {
    const { api } = memoryStorage();
    await reload(api);
    const s = store;
    const Y = SURFACE_Y + 3;

    s().setPart('b2x4');
    s().setRot(0);
    s().setTex(0);
    s().setColor('#22aa44');
    const before = s().world.count;

    s().beginBatch();
    const id = s().place(0, Y, 0);
    s().endBatch();
    ok(id !== null, '2×4를 놓는다');
    ok(s().world.count === before + 8, `★★ 2×4 한 번 = 브릭 8개 — 지금 ${s().world.count - before}개`);

    // 레코드는 **단위만** 남는다 — 2×4라는 레코드는 월드에 존재하지 않는다
    const placed = [...s().world.bricks.values()].filter((b) => b.y === Y);
    ok(placed.length === 8 && placed.every((b) => b.part === 'b1x1'),
      `★★ 전부 b1x1 레코드다 — ${[...new Set(placed.map((b) => b.part))].join(',')}`);
    // 칸을 빈틈없이 채웠는가 (2칸 × 4칸)
    let filled = 0;
    for (let x = 0; x < 2; x++) for (let z = 0; z < 4; z++) if (s().world.at(x, Y, z) !== undefined) filled++;
    ok(filled === 8, `★ 2×4 자리가 빈틈없이 찬다 — ${filled}/8`);

    // ★ 한 번의 클릭은 **되돌리기 한 번**이다 — 여덟 번 눌러야 하면 못 쓴다
    s().undo();
    ok(s().world.count === before, `★★ Ctrl+Z 한 번에 여덟 개가 전부 사라진다 — 남은 ${s().world.count - before}개`);
    s().redo();
    ok(s().world.count === before + 8, '★ 다시 실행하면 여덟 개가 되살아난다');

    // ★★ 지우기는 **한 칸씩** — 이게 이번 변경의 핵심이다
    const one = s().world.at(1, Y, 2)!;
    s().removeBrick(one);
    ok(s().world.at(1, Y, 2) === undefined, '★★ 겨눈 한 칸만 지워진다');
    ok(s().world.count === before + 7, `★★ 나머지 일곱 칸은 그대로 남는다 — 지금 ${s().world.count - before}개`);
    ok(s().world.at(0, Y, 0) !== undefined && s().world.at(1, Y, 3) !== undefined, '★ 이웃 칸이 안 딸려간다');

    // 왕복 — 새로고침해도 단위·색이 그대로여야 한다(B-4)
    await s().flush();
    await reload(api);
    let left = 0;
    for (let x = 0; x < 2; x++) for (let z = 0; z < 4; z++) if (store().world.at(x, Y, z) !== undefined) left++;
    ok(left === 7, `★ 새로고침해도 일곱 칸이다(판 자리가 안 메워진다) — ${left}`);
    const back = store().world.bricks.get(store().world.at(0, Y, 0)!);
    ok(back?.part === 'b1x1', '새로고침해도 단위 레코드다');
    ok(back?.color.toLowerCase() === '#22aa44', `색도 그대로 — 지금 ${back?.color}`);
  }

  // ── ⑨ ★★ **옛 저장물**의 큰 파츠는 불러올 때 단위로 갈라진다 (§20 지연 마이그레이션) ──
  //    빠뜨리면 옛 월드만 안 쪼개진 채 남는다 — 에러도 안 나고 화면도 그럴듯해서
  //    **한참 뒤에 "예전에 지은 벽만 한 덩어리로 지워진다"로 발견된다**(B-4와 같은 계열).
  {
    const { api, chunks } = memoryStorage();
    const Y = 0;
    // 옛 버전이 저장했을 법한 청크를 손으로 만든다 — `b2x4` 레코드 하나
    const c = chunkCoordOf(0, Y, 0);
    chunks.set(`${c.cx},${c.cy},${c.cz}`, {
      coord: c,
      data: encodeChunk([{ part: 'b2x4', x: 0, y: Y, z: 0, rot: 0, color: '#d01012', mat: 'opaque', tex: 6 }],
        c.cx, c.cy, c.cz),
    });

    await reload(api);
    const cells: number[] = [];
    for (let x = 0; x < 2; x++) for (let z = 0; z < 4; z++) {
      const bid = store().world.at(x, Y, z);
      if (bid !== undefined) cells.push(bid);
    }
    ok(cells.length === 8, `옛 2×4가 여덟 칸을 채운다 — ${cells.length}/8`);
    ok(new Set(cells).size === 8, `★★ 여덟 칸이 **서로 다른 브릭**이다(갈라졌다) — 지금 ${new Set(cells).size}개`);
    const one = store().world.bricks.get(cells[0]);
    ok(one?.part === 'b1x1', `★ 단위 레코드로 갈라진다 — 지금 ${one?.part}`);
    ok(one?.tex === 6 && one?.color.toLowerCase() === '#d01012', '갈라져도 무늬·색이 그대로 따라온다');

    // 한 칸만 지워지는지 — 옛 월드에서도 새 규칙이 먹어야 한다
    store().removeBrick(cells[0]);
    let left = 0;
    for (let x = 0; x < 2; x++) for (let z = 0; z < 4; z++) if (store().world.at(x, Y, z) !== undefined) left++;
    ok(left === 7, `★★ 옛 월드에서도 한 칸씩 지워진다 — 남은 ${left}/8`);
  }

  // ── ⑩ ★★ **삭제된 경사** — 지어 둔 지붕이 불러올 때 평범한 블록이 된다 (사용자 지시 2026-08-05) ──
  //    경사 파츠는 지웠지만 **id는 `PART_ORDER`에 남겨야** 한다(빼면 뒤 파츠가 밀려 저장물이 깨진다 — B-2).
  //    그래서 "읽히긴 하는데 월드엔 경사가 안 들어간다"를 잠근다.
  {
    const { api, chunks } = memoryStorage();
    const Y = 0;
    const c = chunkCoordOf(0, Y, 0);
    chunks.set(`${c.cx},${c.cy},${c.cz}`, {
      coord: c,
      data: encodeChunk([{ part: 's1x2', x: 0, y: Y, z: 0, rot: 0, color: '#a0a5a9', mat: 'opaque', tex: 0 }],
        c.cx, c.cy, c.cz),
    });

    await reload(api);
    const a = store().world.bricks.get(store().world.at(0, Y, 0)!);
    const b = store().world.bricks.get(store().world.at(0, Y, 1)!);
    ok(a?.part === 'b1x1' && b?.part === 'b1x1', `★★ 옛 지붕이 평범한 블록 둘이 된다 — 지금 ${a?.part}, ${b?.part}`);
    ok(a?.id !== b?.id, '두 칸은 서로 다른 브릭이다(한 칸씩 지워진다)');
    ok(a?.color.toLowerCase() === '#a0a5a9', '색이 그대로 따라온다');

    // ★ 경사 레코드가 월드에 **하나도** 안 남는다 — 남으면 그리는 쪽이 조용히 상자로 떨어진다
    const slopeLeft = [...store().world.bricks.values()].filter((br) => PARTS[br.part].kind === 'slope').length;
    ok(slopeLeft === 0, `★ 경사 레코드가 안 남는다 — 남은 ${slopeLeft}개`);
  }

  // ── ⑪ ★★ 소품 — 클릭 한 번에 통째로, 되돌리기 한 번 (BRICK_PLAN.md §22) ──
  {
    const { api } = memoryStorage();
    await reload(api);
    const s = store;
    const Y = SURFACE_Y + 3;

    s().setProp('chair');
    s().setColor('#00ff00'); // ★ 소품은 자기 색을 쓴다 — 이 색이 묻으면 안 된다
    const before = s().world.count;
    const want = bricksOfProp('chair', 0, Y, 0, 0).length;

    s().beginBatch();
    const id = s().place(0, Y, 0);
    s().endBatch();
    ok(id !== null, '소품이 놓인다');
    ok(s().world.count === before + want, `★★ 의자 한 번 = 브릭 ${want}개 — 지금 ${s().world.count - before}개`);

    const placed = [...s().world.bricks.values()].filter((b) => b.y >= Y);
    ok(placed.every((b) => b.color.toLowerCase() !== '#00ff00'),
      '★★ 소품은 자기 색을 쓴다(팔레트 색이 안 묻는다)');
    ok(placed.every((b) => unitOf(b.part) === b.part), '★ 소품도 1×1 단위로만 놓인다');

    // ★ 클릭 한 번 = 되돌리기 한 번
    s().undo();
    ok(s().world.count === before, `★★ Ctrl+Z 한 번에 의자가 통째로 사라진다 — 남은 ${s().world.count - before}개`);
    s().redo();
    ok(s().world.count === before + want, '★ 다시 실행하면 의자가 돌아온다');

    // 놓고 나면 그냥 브릭이다 — 한 칸만 지워진다
    const one = placed[0] && s().world.at(placed[0].x, placed[0].y, placed[0].z);
    if (one !== undefined && one !== null) {
      s().removeBrick(one);
      ok(s().world.count === before + want - 1, `★★ 놓은 뒤엔 한 칸씩 지워진다 — 지금 ${s().world.count - before}개`);
    }

    // 왕복 — 저장하고 새로고침해도 남는다(소품은 저장 포맷을 안 건드린다)
    await s().flush();
    await reload(api);
    const left = [...store().world.bricks.values()].filter((b) => b.y >= Y).length;
    ok(left === want - 1, `★ 새로고침해도 그대로다 — ${left}/${want - 1}`);

    store().setProp(null);
    store().setColor('#ffffff');
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
