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
}

void main().then(() => {
  console.log(`\n브릭 스토어(저장 ↔ 스트리밍 ↔ 지형) 테스트: ${pass}/${pass + fails.length} 통과`);
  if (fails.length) {
    console.log('\n실패:');
    for (const f of fails) console.log('  ✗ ' + f);
    process.exit(1);
  }
});
