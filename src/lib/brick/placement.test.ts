// 실행: npx tsx src/lib/brick/placement.test.ts
//
// 고정하려는 불변식 (드롭 모델의 핵심 두 가지):
//   ① 겹치지 않는다      — restY에 놓으면 항상 배치 가능하다
//   ② 딱 그 위에 얹힌다  — 한 칸이라도 더 낮으면 반드시 막힌다 (공중에 뜨지 않는다)
//
// 2026-07-29: 배치 기준을 **포인터(점) → 고스트(발자국)** 로 바꾸면서 생긴 규칙이다.
// 점 하나로 높이를 정하던 시절엔 포인터가 안 짚은 칸이 다른 브릭을 파고들었다(겹침).

import { anchorFromPointer, centerOffset } from './placement';
import { extentOf, PARTS, type PartId } from './parts';
import { CELL_X, CELL_Z, type Rot } from './grid';
import { BrickWorld } from './world';

let pass = 0;
const fails: string[] = [];
const ok = (cond: boolean, label: string) => { if (cond) pass++; else fails.push(label); };

const PART_IDS: PartId[] = ['b1x1', 'b1x2', 'b2x2', 'b2x4'];
const ROTS: Rot[] = [0, 1, 2, 3];

/** 재현 가능한 난수 (테스트가 매번 같은 월드를 만들도록) */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

// ── 무작위 월드에서 불변식 전수 확인 ──────────────────────────────────────
{
  const rand = rng(20260729);
  const w = new BrickWorld();

  // 어수선한 지형을 만든다 — 겹겹이 쌓이고, 오버행도 생기고, 빈 곳도 남게
  for (let i = 0; i < 400; i++) {
    const p = PART_IDS[Math.floor(rand() * PART_IDS.length)];
    const r = ROTS[Math.floor(rand() * ROTS.length)];
    const x = Math.floor(rand() * 14) - 7;
    const z = Math.floor(rand() * 14) - 7;
    w.place(p, x, w.restY(p, x, z, r), z, r, '#ffffff', 'opaque');
  }
  ok(w.count > 200, `지형이 충분히 쌓였는가 (${w.count}개)`);

  // 모든 파츠 × 회전 × 격자 전역에서 두 불변식 확인
  for (const p of PART_IDS) {
    for (const r of ROTS) {
      const e = extentOf(PARTS[p], r);
      for (let x = -9; x <= 9; x++) {
        for (let z = -9; z <= 9; z++) {
          const y = w.restY(p, x, z, r);

          ok(w.canPlace(p, x, y, z, r),
            `① 겹침: ${p}/r${r} @(${x},${y},${z}) — restY인데 배치 불가`);

          if (y > 0) {
            ok(!w.canPlace(p, x, y - 1, z, r),
              `② 공중: ${p}/r${r} @(${x},${y},${z}) — 한 칸 아래도 비어 있음(더 내려가야 함)`);
          }

          // ey는 restY와 무관해야 한다(세로 길이가 낙하 높이를 바꾸면 안 됨)
          ok(e.ey === 3, `파츠 높이 3칸 가정: ${p}/r${r}`);
        }
      }
    }
  }
}

// ── 신고된 증상 재현 ─────────────────────────────────────────────────────
{
  const w = new BrickWorld();
  // 바닥에 2×4 하나 (x:0..1, z:0..3, y:0..2)
  w.place('b2x4', 0, 0, 0, 0, '#ffffff', 'opaque');

  // (가) 끝에 한 칸만 걸쳐도 그 위로 올라간다 ← "브릭 끝에 못 쌓는다"
  ok(w.restY('b2x4', 0, 3, 0) === 3, '끝에 한 칸 걸침(z=3) → 위로 올라가야 함');
  ok(w.restY('b2x4', 0, -3, 0) === 3, '반대쪽 끝(z=-3)도 위로 올라가야 함');

  // (나) 완전히 벗어나면 바닥에 남는다
  ok(w.restY('b2x4', 0, 4, 0) === 0, '아예 안 닿는 자리(z=4)는 바닥(0)');
  ok(w.restY('b2x4', 0, -4, 0) === 0, '아예 안 닿는 자리(z=-4)도 바닥(0)');

  // (다) 겹침이 나오던 자리 — 파고들지 않고 위로 얹힌다 ← "초록 고스트가 겹친다"
  for (let z = -3; z <= 3; z++) {
    const y = w.restY('b2x4', 0, z, 0);
    ok(w.canPlace('b2x4', 0, y, z, 0), `겹침 없음 z=${z} (y=${y})`);
  }
}

// ── 포인터 → 앵커: XZ는 커서 중심, Y는 발자국이 정한다 ────────────────────
{
  const w = new BrickWorld();
  w.place('b2x4', 0, 0, 0, 0, '#ffffff', 'opaque');

  // 브릭 한가운데를 가리켰을 때(월드 좌표) — 그 위로 올라가야 한다
  const mid = anchorFromPointer(w, (0 + 1) * CELL_X, (0 + 2) * CELL_Z, 'b2x4', 0);
  ok(mid.y === 3, `브릭 위를 가리키면 그 위(y=3)에 얹힌다 — got ${mid.y}`);

  // 멀리 빈 바닥 — 바닥에 놓인다
  const far = anchorFromPointer(w, 20 * CELL_X, 20 * CELL_Z, 'b2x4', 0);
  ok(far.y === 0, `빈 바닥은 y=0 — got ${far.y}`);

  // 커서를 중심으로 잡는다
  const e = extentOf(PARTS.b2x4, 0);
  ok(far.x === 20 - centerOffset(e.ex) && far.z === 20 - centerOffset(e.ez), 'XZ는 커서를 중심으로');
}

// ── 지우면 높이가 되돌아온다 (기둥 캐시 정합성) ──────────────────────────
{
  const w = new BrickWorld();
  const a = w.place('b2x2', 0, 0, 0, 0, '#fff', 'opaque')!;
  const b = w.place('b2x2', 0, 3, 0, 0, '#fff', 'opaque')!;
  ok(w.restY('b2x2', 0, 0, 0) === 6, '두 개 쌓으면 다음은 y=6');
  w.remove(b);
  ok(w.restY('b2x2', 0, 0, 0) === 3, '위엣것을 지우면 y=3으로 복귀');
  w.remove(a);
  ok(w.restY('b2x2', 0, 0, 0) === 0, '전부 지우면 y=0으로 복귀');

  // 가운데를 지워도 위에 남은 게 있으면 꼭대기는 그대로여야 한다
  const c1 = w.place('b2x2', 5, 0, 5, 0, '#fff', 'opaque')!;
  w.place('b2x2', 5, 3, 5, 0, '#fff', 'opaque');
  w.remove(c1);
  ok(w.restY('b2x2', 5, 5, 0) === 6, '아래를 지워도 위에 남은 게 있으면 꼭대기 유지(y=6)');
}

// ── 높이 고정 모드 ───────────────────────────────────────────────────────
// 드롭 모델은 받쳐줄 게 없는 자리(천장·2층 바닥·다리 상판)에 못 놓는다. 그걸 메우는 보조 모드.
{
  const w = new BrickWorld();
  // 기둥 두 개를 세우고 그 사이를 비워 둔다 — 천장을 깔아야 하는 상황
  w.place('b2x2', 0, 0, 0, 0, '#fff', 'opaque');
  w.place('b2x2', 0, 3, 0, 0, '#fff', 'opaque');   // 왼쪽 기둥: y 0..5
  w.place('b2x2', 0, 0, 10, 0, '#fff', 'opaque');
  w.place('b2x2', 0, 3, 10, 0, '#fff', 'opaque');  // 오른쪽 기둥: y 0..5

  const midX = 0 * CELL_X, midZ = 5 * CELL_Z;      // 두 기둥 사이 빈 공간

  // 드롭 모드 — 발밑이 비었으니 바닥으로 떨어진다(그래서 천장을 못 깐다)
  const dropped = anchorFromPointer(w, midX, midZ, 'b2x4', 0, null);
  ok(dropped.y === 0, `드롭 모드는 빈 공간에서 바닥으로 — got ${dropped.y}`);

  // 고정 모드 — 발밑을 무시하고 그 높이에 그대로 둔다
  const held = anchorFromPointer(w, midX, midZ, 'b2x4', 0, 6);
  ok(held.y === 6, `고정 모드는 지정 높이 유지 — got ${held.y}`);
  ok(held.x === dropped.x && held.z === dropped.z, '고정 모드가 XZ를 바꾸지 않는다');
  ok(w.canPlace('b2x4', held.x, held.y, held.z, 0), '기둥 위 높이(6)의 빈 공간에 놓을 수 있다');

  // 고정 높이가 기존 브릭과 겹치면 막혀야 한다(빨간 고스트)
  const clash = anchorFromPointer(w, 0 * CELL_X, 0 * CELL_Z, 'b2x2', 0, 0);
  ok(!w.canPlace('b2x2', clash.x, clash.y, clash.z, 0), '고정 높이가 기존 브릭과 겹치면 배치 불가');

  // 지형이 어떻든 고정 높이는 그대로 (드롭과 달리 발밑에 영향받지 않는다)
  for (const z of [0, 5, 10, 30]) {
    const a = anchorFromPointer(w, 0, z * CELL_Z, 'b2x4', 0, 9);
    ok(a.y === 9, `고정 높이는 지형 무관 (z=${z}) — got ${a.y}`);
  }
}

console.log(`\n브릭 배치(드롭 + 높이 고정) 테스트: ${pass}/${pass + fails.length} 통과`);
if (fails.length) {
  console.log('\n실패:');
  for (const f of fails.slice(0, 12)) console.log('  ✗ ' + f);
  if (fails.length > 12) console.log(`  … 외 ${fails.length - 12}건`);
  process.exit(1);
}
