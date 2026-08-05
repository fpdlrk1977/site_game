// 실행: npx tsx src/lib/brick/units.test.ts
//
// 1×1 단위 펼치기(`BRICK_PLAN.md` §20)를 잠근다.
//
// ★ 이 파일이 지키는 핵심은 하나다: **펼친 단위들이 원래 파츠의 칸을 정확히 채운다.**
//   한 칸이라도 남거나 겹치면 벽에 틈이 뜨거나 배치가 막히는데, **에러는 안 난다.**
//   그리고 회전 기준이 둘이라(D-6) 축을 손으로 돌리면 조용히 틀리므로, 전 회전을 전수로 돈다.

import type { Rot } from './grid';
import { extentOf, PART_KINDS, PART_LIST, PARTS, partsOfKind, unitOf, type PartId } from './parts';
import { ROT_COUNT } from './rotation';
import { unitsOf } from './units';

/** 삭제된 경사 — id만 남아 옛 저장물을 읽는다 */
const SLOPE_IDS = ['s1x1', 'si1x1', 's1x2', 's2x2', 'si1x2'] as PartId[];

let pass = 0;
const fails: string[] = [];
const ok = (cond: boolean, label: string) => { if (cond) pass++; else fails.push(label); };

/** 그 파츠가 앵커 (x,y,z)에서 차지하는 칸들 */
function cellsOf(part: PartId, x: number, y: number, z: number, rot: Rot): Set<string> {
  const e = extentOf(PARTS[part], rot);
  const out = new Set<string>();
  for (let dx = 0; dx < e.ex; dx++)
    for (let dy = 0; dy < e.ey; dy++)
      for (let dz = 0; dz < e.ez; dz++) out.add(`${x + dx},${y + dy},${z + dz}`);
  return out;
}

const sameSet = (a: Set<string>, b: Set<string>): boolean =>
  a.size === b.size && [...a].every((k) => b.has(k));

// ── ★★ 단위가 원래 파츠의 칸을 **빈틈없이·겹침없이** 채운다 ────────────────
// 앵커를 원점이 아닌 곳에 두는 것도 함께 본다(오프셋을 안 더하는 실수를 잡는다).
{
  let bad = 0;
  let overlapped = 0;
  for (const p of PART_LIST) {
    for (let rot = 0 as Rot; rot < ROT_COUNT; rot = (rot + 1) as Rot) {
      const [ax, ay, az] = [-3, 7, 11]; // 음수·양수를 섞어 둔다(A-4)
      const units = unitsOf(p.id, ax, ay, az, rot);

      const covered = new Set<string>();
      let dup = 0;
      for (const u of units) {
        for (const k of cellsOf(u.part, u.x, u.y, u.z, u.rot)) {
          if (covered.has(k)) dup++;
          covered.add(k);
        }
      }
      if (dup > 0) overlapped++;
      if (!sameSet(covered, cellsOf(p.id, ax, ay, az, rot))) bad++;
    }
  }
  ok(bad === 0, `★★ 단위가 원래 파츠의 칸과 정확히 일치한다 — 어긋난 조합 ${bad}개`);
  ok(overlapped === 0, `★★ 단위끼리 겹치지 않는다 — 겹친 조합 ${overlapped}개`);
}

// ── 방향(rot)이 단위에 그대로 전달된다 ───────────────────────────────────
// 안 넘기면 뒤집은 브릭의 돌기가 도로 위를 보고, 얇은 파츠의 두께 축이 틀어진다.
{
  let bad = 0;
  for (const p of PART_LIST) {
    for (let rot = 0 as Rot; rot < ROT_COUNT; rot = (rot + 1) as Rot) {
      if (unitsOf(p.id, 0, 0, 0, rot).some((u) => u.rot !== rot)) bad++;
    }
  }
  ok(bad === 0, `단위의 방향이 원래 방향과 같다 — 다른 조합 ${bad}개`);
}

// ── 단위는 더 안 쪼개진다 (멱등) ─────────────────────────────────────────
// 불러오기가 확장을 두 번 타도 안전해야 한다.
{
  let bad = 0;
  for (const p of PART_LIST) {
    const units = unitsOf(p.id, 0, 0, 0, 0);
    for (const u of units) {
      const again = unitsOf(u.part, u.x, u.y, u.z, u.rot);
      if (again.length !== 1 || again[0].part !== u.part) bad++;
    }
  }
  ok(bad === 0, `★ 단위를 다시 펼쳐도 그대로다(멱등) — 어긋난 것 ${bad}개`);
}

// ── 갈래별 단위 지정이 의도대로인가 ──────────────────────────────────────
{
  ok(unitOf('b2x4') === 'b1x1', '브릭의 단위는 b1x1');
  ok(unitOf('p2x6') === 'p1x1', '플레이트의 단위는 p1x1');
  ok(unitOf('r1x4') === 'r1x1', '봉의 단위는 r1x1');
  ok(unitOf('w1x4') === 'w1x1', '패널의 단위는 w1x1');
  ok(unitOf('c1x1') === 'c1x1', '기둥은 이미 1칸이라 자기 자신');
  ok(unitOf('terrain') === 'terrain', '★ 지형은 안 쪼갠다 — 2×2가 곧 마인크래프트 블록 크기다');

  // ★ 경사는 **삭제됐다**(2026-08-05). id만 남아 옛 저장물을 읽고, 읽는 즉시 평범한 블록이 된다.
  for (const id of SLOPE_IDS) ok(unitOf(id) === 'b1x1', `★ 삭제된 경사 ${id}의 단위는 b1x1`);
}

// ── ★★ 삭제된 경사 — 지어 둔 지붕이 **평범한 블록**으로 바뀐다 ───────────────
{
  const kinds = (id: PartId, rot: Rot) => unitsOf(id, 0, 0, 0, rot).map((u) => u.part);

  ok(kinds('s1x2', 0).join(',') === 'b1x1,b1x1', `★ 옛 경사 1×2 = 블록 둘 — ${kinds('s1x2', 0)}`);
  ok(kinds('s2x2', 0).length === 4 && kinds('s2x2', 0).every((p) => p === 'b1x1'),
    `★ 옛 경사 2×2 = 블록 넷 — ${kinds('s2x2', 0)}`);
  ok(kinds('s1x1', 0).join(',') === 'b1x1', `★ 1칸 경사도 블록 하나 — ${kinds('s1x1', 0)}`);

  // ★★ 경사 레코드는 결과에 **하나도 남지 않는다**(전 파츠 × 전 회전).
  //   하나라도 남으면 그리는 쪽이 쐐기 메시를 찾다가 **상자로 떨어져** 조용히 다른 모양이 된다.
  let leftover = 0;
  for (const id of SLOPE_IDS) {
    for (let rot = 0 as Rot; rot < ROT_COUNT; rot = (rot + 1) as Rot) {
      if (unitsOf(id, 0, 0, 0, rot).some((u) => PARTS[u.part].kind === 'slope')) leftover++;
    }
  }
  ok(leftover === 0, `★★ 바꾼 결과에 경사가 안 남는다 — 남은 조합 ${leftover}개`);

  // UI에서도 사라졌다 — 고를 수가 없어야 "삭제"다
  ok(PART_KINDS.every((k) => k.id !== 'slope'), '★ 도구 패널에 경사 갈래가 없다');
  ok(partsOfKind('slope').length === 0, '★ 경사 갈래를 물어봐도 고를 것이 없다');
}

// ── 개수 (눈으로 확인할 수 있는 값) ──────────────────────────────────────
{
  const n = (id: PartId) => unitsOf(id, 0, 0, 0, 0).length;
  ok(n('b1x1') === 1, '1×1은 하나 그대로');
  ok(n('b2x4') === 8, `★ 2×4는 여덟 개 — 지금 ${n('b2x4')}`);
  ok(n('b2x8') === 16, `2×8은 열여섯 개 — 지금 ${n('b2x8')}`);
  ok(n('b1x8') === 8, '1×8은 여덟 개');
  ok(n('p2x6') === 12, `플레이트 2×6은 열두 개 — 지금 ${n('p2x6')}`);
  ok(n('r1x4') === 4, '봉 1×4는 네 개');
  ok(n('w1x2') === 2, '패널 1×2는 두 개');
  ok(n('s1x2') === 2, `옛 경사 1×2는 블록 둘 — 지금 ${n('s1x2')}`);
  ok(n('s2x2') === 4, `옛 경사 2×2는 블록 넷 — 지금 ${n('s2x2')}`);
}

// ── 단위 자신은 발자국이 1칸이다 ─────────────────────────────────────────
// (단위가 1칸이 아니면 "1×1이 기본"이라는 약속이 깨진다. 높이는 갈래마다 다르므로 안 본다)
{
  let bad = 0;
  for (const p of PART_LIST) {
    const u = PARTS[unitOf(p.id)];
    if (u.sx !== 1 || u.sz !== 1) bad++;
  }
  ok(bad === 0, `★ 모든 파츠의 단위는 발자국이 1×1이다 — 어긋난 것 ${bad}개`);
}

// ── 삭제된 파츠는 UI에 없지만 카탈로그엔 남아 있다 ───────────────────────
{
  const legacy = PART_LIST.filter((p) => p.legacy).map((p) => p.id);
  ok(legacy.length === SLOPE_IDS.length,
    `삭제된 파츠는 경사 ${SLOPE_IDS.length}종뿐 — 지금 ${legacy.join(',')}`);
  // ★★ 카탈로그에서 **지우면 안 된다** — `PART_ORDER`가 저장 인덱스라, 빼면 그 뒤 파츠가
  //   한 칸씩 밀려 **이미 저장된 월드가 통째로 다른 파츠로 읽힌다**(B-2).
  for (const id of SLOPE_IDS) {
    ok(PARTS[id] !== undefined, `★★ 삭제된 경사 ${id}의 id는 카탈로그에 남아 있다(저장 인덱스)`);
  }
}

console.log(`\n1×1 단위 펼치기 테스트: ${pass}/${pass + fails.length} 통과`);
if (fails.length) {
  console.log('\n실패:');
  for (const f of fails) console.log('  ✗ ' + f);
  process.exit(1);
}
