// 실행: npx tsx src/lib/brick/placement.test.ts
//
// ★★ 잠그는 규칙은 하나다: **겨눈 칸의 옆 칸에 놓는다. 자동 보정은 없다.**
//
//   ① 겨눈 칸은 **표면의 칸**이다 (커서가 있는 칸, 브릭 범위 안으로 자름)
//   ② 새 브릭의 첫 칸 = 겨눈 칸의 **옆 칸** — 면 축만 한 칸 비켜난다
//   ③ **파츠 크기가 달라도 첫 칸은 같다** (크기에 따라 몰래 밀지 않는다)
//   ④ **막히면 막혔다고 보고한다** — 알아서 옮기지 않는다
//   ⑤ 드래그는 고정 축을 안 건드린다
//
// 2026-07-30: 자동 보정(커서 중앙 맞춤·걸리면 밀어내기)을 **전부 걷어내면서** 생긴 규칙이다.
// 그 보정들이 "겨눈 자리와 놓인 자리가 다르다"의 원인이었다 — 내가 사용자 조준을 고쳐서 놓고 있었다.

import { anchorFromFace, faceOf, slideAnchor, type Face, type FaceAxis } from './placement';
import { extentOf, PART_LIST, PARTS, type PartId } from './parts';
import { CELL_X, CELL_Y, CELL_Z, type Rot } from './grid';
import { BrickWorld } from './world';

let pass = 0;
const fails: string[] = [];
const ok = (cond: boolean, label: string) => { if (cond) pass++; else fails.push(label); };

const PART_IDS: PartId[] = PART_LIST.map((p) => p.id);
const ROTS: Rot[] = [0, 1, 2, 3];
const FACES: Face[] = [
  { axis: 0, dir: 1 }, { axis: 0, dir: -1 },
  { axis: 1, dir: 1 }, { axis: 1, dir: -1 },
  { axis: 2, dir: 1 }, { axis: 2, dir: -1 },
];

// ── ①②③ 전수: 겨눈 칸 → 옆 칸. 크기와 무관하게 첫 칸이 같다 ─────────────
{
  let cellBad = 0, adjBad = 0, sizeBad = 0, total = 0;

  for (const target of PART_IDS) {
    for (const tRot of ROTS) {
      const w = new BrickWorld();
      const tid = w.place(target, 0, 30, 0, tRot, '#fff', 'opaque')!;
      const te = extentOf(PARTS[target], tRot);
      const tLo = [0, 30, 0];
      const tHi = [te.ex - 1, 30 + te.ey - 1, te.ez - 1];

      for (const face of FACES) {
        // 면 위의 모든 칸을 하나씩 겨눈다 (칸 한가운데를 짚는다)
        for (let u = 0; u < te.ex; u++) {
          for (let v = 0; v < te.ez; v++) {
            for (let h = 0; h < te.ey; h++) {
              const pt = [(u + 0.5) * CELL_X, (30 + h + 0.5) * CELL_Y, (v + 0.5) * CELL_Z];
              // 겨눈 칸의 기대값 — 면 축은 표면 칸으로 고정된다
              const want = [tLo[0] + u, tLo[1] + h, tLo[2] + v];
              want[face.axis] = face.dir > 0 ? tHi[face.axis] : tLo[face.axis];

              const firstCells: string[] = [];
              for (const part of PART_IDS) {
                for (const rot of ROTS) {
                  total++;
                  const fp = anchorFromFace(w, tid, face, pt[0], pt[1], pt[2], part, rot)!;
                  const e = extentOf(PARTS[part], rot);
                  const ext = [e.ex, e.ey, e.ez];
                  const a = [fp.anchor.x, fp.anchor.y, fp.anchor.z];

                  // ① 겨눈 칸이 기대한 표면 칸인가
                  if (fp.cell[0] !== want[0] || fp.cell[1] !== want[1] || fp.cell[2] !== want[2]) cellBad++;

                  // ② 면 축은 겨눈 칸 바로 옆 (아래쪽 면이면 두께만큼 비켜난다)
                  const ax = face.axis;
                  const wantAx = face.dir > 0 ? fp.cell[ax] + 1 : fp.cell[ax] - ext[ax];
                  if (a[ax] !== wantAx) adjBad++;

                  // 나머지 두 축은 겨눈 칸 그대로 — 크기가 끼어들 자리가 없다
                  for (let k = 0; k < 3; k++) if (k !== ax && a[k] !== fp.cell[k]) adjBad++;

                  firstCells.push(`${a[ax === 0 ? 1 : 0]},${a[ax === 2 ? 1 : 2]}`);
                }
              }
              // ③ 같은 칸을 겨눴으면 **어떤 파츠·회전이든 첫 칸이 같다**
              if (new Set(firstCells).size !== 1) sizeBad++;
            }
          }
        }
      }
    }
  }
  ok(total > 10000, `전수 조합이 충분한가 (${total})`);
  ok(cellBad === 0, `① 겨눈 칸 = 표면의 그 칸 — 위반 ${cellBad}/${total}`);
  ok(adjBad === 0, `② 첫 칸 = 겨눈 칸의 옆 칸 (보정 없음) — 위반 ${adjBad}/${total}`);
  ok(sizeBad === 0, `★③ 파츠 크기가 달라도 첫 칸이 같다 — 위반 ${sizeBad}`);
}

// ── ④ 막히면 막혔다고 보고한다 (몰래 옮기지 않는다) ──────────────────────
{
  const w = new BrickWorld();
  const a = w.place('b1x1', 0, 30, 0, 0, '#fff', 'opaque')!;
  w.place('b1x1', 0, 33, 0, 0, '#fff', 'opaque'); // 위를 막아 둔다

  const fp = anchorFromFace(w, a, { axis: 1, dir: 1 }, 0.25, 30.5 * CELL_Y, 0.25, 'b1x1', 0)!;
  ok(fp.anchor.y === 33, `막혀 있어도 자리를 옮기지 않는다 — got y=${fp.anchor.y}, want 33`);
  ok(!w.canPlace('b1x1', fp.anchor.x, fp.anchor.y, fp.anchor.z, 0), '막힌 것을 canPlace가 false로 알려준다');

  // 옆은 비어 있으니 그쪽은 놓을 수 있다
  const side = anchorFromFace(w, a, { axis: 0, dir: 1 }, 1 * CELL_X, 30.5 * CELL_Y, 0.25, 'b1x1', 0)!;
  ok(w.canPlace('b1x1', side.anchor.x, side.anchor.y, side.anchor.z, 0), '빈 옆면은 놓을 수 있다');
  ok(side.anchor.x === 1 && side.anchor.y === 30, `옆면은 겨눈 칸 옆 같은 높이 — got ${side.anchor.x},${side.anchor.y}`);
}

// ── ⑤ 드래그: 고정 축은 절대 안 변한다 ──────────────────────────────────
{
  const w = new BrickWorld();
  const tid = w.place('b2x2', 0, 30, 0, 0, '#fff', 'opaque')!;
  let bad = 0, n = 0;

  for (const face of FACES) {
    for (const part of PART_IDS) {
      for (const rot of ROTS) {
        const fp = anchorFromFace(w, tid, face, 0.5 * CELL_X, 30.5 * CELL_Y, 0.5 * CELL_Z, part, rot)!;
        const fixed = ([0, 1, 2] as FaceAxis[]).filter((x) => !fp.slide.includes(x));
        for (const d of [-40, -7, -1, 0, 1, 7, 40]) {
          const moved = slideAnchor(fp, d * CELL_X, d * CELL_Y, d * CELL_Z);
          const got = [moved.x, moved.y, moved.z];
          const base = [fp.anchor.x, fp.anchor.y, fp.anchor.z];
          n++;
          for (const x of fixed) if (got[x] !== base[x]) bad++;
        }
      }
    }
  }
  ok(bad === 0, `⑤ 고정 축은 드래그해도 안 변한다 — 위반 ${bad}/${n}`);

  let sideBad = 0;
  for (const face of FACES) {
    const fp = anchorFromFace(w, tid, face, 0.5 * CELL_X, 30.5 * CELL_Y, 0.5 * CELL_Z, 'b1x1', 0)!;
    if (face.axis === 1) {
      if (fp.slide.length !== 2 || fp.slide.includes(1)) sideBad++;
    } else if (fp.slide.length !== 1 || fp.slide.includes(1)) sideBad++;
  }
  ok(sideBad === 0, `수평면=2축 · 옆면=수평 1축, 높이는 어느 쪽도 안 미끄러진다 — 위반 ${sideBad}`);

  // 자유 축은 커서가 있는 칸을 그대로 따른다(보정 없음)
  const top = anchorFromFace(w, tid, { axis: 1, dir: 1 }, 0.5 * CELL_X, 30.5 * CELL_Y, 0.5 * CELL_Z, 'b2x4', 0)!;
  const far = slideAnchor(top, 9.7 * CELL_X, 0, 4.2 * CELL_Z);
  ok(far.x === 9 && far.z === 4, `드래그도 커서가 있는 칸 그대로 — got ${far.x},${far.z}`);
}

// ── ★★ 미끄러짐 평면은 **브릭이 닿는 표면**이어야 한다 ────────────────────
// 평면이 표면보다 떠 있으면 비스듬히 볼 때 투영 지점이 `높이 × tan(기울기)`만큼 어긋난다.
// 브릭 중심(0.3m)으로 잡았을 때 45°에서 0.3m → 반올림하면 **한 칸**이 밀렸다.
// 증상: **클릭하는 순간** 겨눈 칸에서 브릭이 한 칸 옮겨졌다(위에서 볼 때는 정확).
{
  const w = new BrickWorld();
  const CELLS = [CELL_X, CELL_Y, CELL_Z];
  let bad = 0, n = 0;
  const tid = w.place('b2x4', 0, 30, 0, 0, '#fff', 'opaque')!;

  for (const face of FACES) {
    for (const part of PART_IDS) {
      for (const rot of ROTS) {
        const fp = anchorFromFace(w, tid, face, 0.5 * CELL_X, 30.5 * CELL_Y, 0.5 * CELL_Z, part, rot)!;
        const ax = face.axis;
        const a = [fp.anchor.x, fp.anchor.y, fp.anchor.z][ax];
        // 위쪽 면을 겨눴으면 브릭의 아래쪽이, 아래쪽 면이면 위쪽이 표면에 닿는다
        const want = (face.dir > 0 ? a : a + fp.ext[ax]) * CELLS[ax];
        n++;
        if (Math.abs(fp.planeAt - want) > 1e-9) bad++;
      }
    }
  }
  ok(bad === 0, `★ 미끄러짐 평면 = 브릭이 닿는 표면 — 위반 ${bad}/${n}`);

  // 그 평면 위에서 **겨눈 칸을 그대로 짚으면 자리가 안 변해야** 한다(클릭만 해도 옮겨지던 버그)
  const top = anchorFromFace(w, tid, { axis: 1, dir: 1 }, 0.5 * CELL_X, 30.5 * CELL_Y, 1.5 * CELL_Z, 'b2x4', 0)!;
  const same = slideAnchor(top, 0.5 * CELL_X, top.planeAt, 1.5 * CELL_Z);
  ok(same.x === top.anchor.x && same.z === top.anchor.z,
    `같은 지점을 짚으면 자리가 안 변한다 — ${top.anchor.x},${top.anchor.z} → ${same.x},${same.z}`);
}

// ── 면 판정: AABB 어느 쪽에 가까운지로 고른다 ───────────────────────────
{
  const w = new BrickWorld();
  const id = w.place('b2x2', 0, 0, 0, 0, '#fff', 'opaque')!;
  const cx = 1 * CELL_X, cz = 1 * CELL_Z; // 브릭 중앙
  const cases: [string, number, number, number, Face][] = [
    ['윗면', cx, 3 * CELL_Y + 0.001, cz, { axis: 1, dir: 1 }],
    ['밑면', cx, -0.001, cz, { axis: 1, dir: -1 }],
    ['+x면', 2 * CELL_X + 0.001, 1.5 * CELL_Y, cz, { axis: 0, dir: 1 }],
    ['−x면', -0.001, 1.5 * CELL_Y, cz, { axis: 0, dir: -1 }],
    ['+z면', cx, 1.5 * CELL_Y, 2 * CELL_Z + 0.001, { axis: 2, dir: 1 }],
    ['−z면', cx, 1.5 * CELL_Y, -0.001, { axis: 2, dir: -1 }],
  ];
  for (const [label, x, y, z, want] of cases) {
    const got = faceOf(w, id, x, y, z);
    ok(!!got && got.axis === want.axis && got.dir === want.dir,
      `면 판정 ${label} — got ${got ? `${got.axis}/${got.dir}` : 'null'}`);
  }
  ok(faceOf(w, 99999, 0, 0, 0) === null, '없는 브릭이면 null');
}

// ── 겨눈 칸은 브릭 표면을 벗어나지 않는다 (면 가장자리를 살짝 넘겨 짚어도) ──
{
  const w = new BrickWorld();
  const tid = w.place('b2x4', 4, 0, 6, 0, '#fff', 'opaque')!;
  let bad = 0;
  for (const d of [-2, -0.6, -0.1, 0, 3.4, 4.5]) {
    const fp = anchorFromFace(
      w, tid, { axis: 1, dir: 1 },
      (4 + d) * CELL_X, 3 * CELL_Y, (6 + d) * CELL_Z, 'b1x1', 0,
    )!;
    if (fp.cell[0] < 4 || fp.cell[0] > 5 || fp.cell[2] < 6 || fp.cell[2] > 9) bad++;
  }
  ok(bad === 0, `겨눈 칸이 브릭 범위 안으로 잘린다 — 위반 ${bad}`);
}

console.log(`\n브릭 배치(겨눈 칸 → 옆 칸, 보정 없음) 테스트: ${pass}/${pass + fails.length} 통과`);
if (fails.length) {
  console.log('\n실패:');
  for (const f of fails.slice(0, 12)) console.log('  ✗ ' + f);
  if (fails.length > 12) console.log(`  … 외 ${fails.length - 12}건`);
  process.exit(1);
}
