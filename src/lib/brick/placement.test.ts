// 실행: npx tsx src/lib/brick/placement.test.ts
//
// 고정하려는 불변식 (면 기준 배치의 핵심):
//   ① **가리킨 브릭을 절대 파고들지 않는다** — 새 브릭은 면 바깥에 붙는다
//   ② **면에 딱 맞닿는다** — 한 칸도 뜨지 않는다
//   ③ **미끄러짐은 평면 안에서만** — 고정 축은 드래그해도 안 변한다
//      (특히 옆면은 높이가 고정이어야 한다. 안 그러면 받쳐줄 게 없는 자리에 뜬다)
//
// 2026-07-30: 배치 기준을 **드롭(발자국이 높이를 정함) → 면**으로 바꾸면서 생긴 규칙이다.
// 드롭 시절의 불변식(restY에 놓으면 항상 배치 가능)은 더 이상 배치 경로가 아니라 제거했다.

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

interface Box { lo: number[]; hi: number[] }
function box(x: number, y: number, z: number, part: PartId, rot: Rot): Box {
  const e = extentOf(PARTS[part], rot);
  return { lo: [x, y, z], hi: [x + e.ex - 1, y + e.ey - 1, z + e.ez - 1] };
}
function overlaps(a: Box, b: Box): boolean {
  for (let i = 0; i < 3; i++) if (a.hi[i] < b.lo[i] || b.hi[i] < a.lo[i]) return false;
  return true;
}

// ── ①② 전수: 어떤 파츠·회전·면·짚은 지점에서도 파고들지 않고 딱 맞닿는다 ──
{
  let nullBad = 0, overlapBad = 0, touchBad = 0, total = 0;

  for (const target of PART_IDS) {
    for (const tRot of ROTS) {
      const w = new BrickWorld();
      const tid = w.place(target, 0, 30, 0, tRot, '#fff', 'opaque');
      if (tid === null) { nullBad++; continue; }
      const te = extentOf(PARTS[target], tRot);
      const tBox = box(0, 30, 0, target, tRot);

      for (const face of FACES) {
        // 면 위 여러 지점을 짚어 본다 (가장자리 포함)
        for (let u = 0; u < te.ex; u++) {
          for (let v = 0; v < te.ez; v++) {
            for (let hgt = 0; hgt < te.ey; hgt++) {
              const px = (u + 0.5) * CELL_X;
              const py = (30 + hgt + 0.5) * CELL_Y;
              const pz = (v + 0.5) * CELL_Z;
              for (const part of PART_IDS) {
                for (const rot of ROTS) {
                  total++;
                  const fp = anchorFromFace(w, tid, face, px, py, pz, part, rot);
                  if (!fp) { nullBad++; continue; }
                  const a = fp.anchor;
                  const nBox = box(a.x, a.y, a.z, part, rot);
                  if (overlaps(nBox, tBox)) overlapBad++;
                  const ax = face.axis;
                  const touch = face.dir > 0
                    ? nBox.lo[ax] === tBox.hi[ax] + 1
                    : nBox.hi[ax] === tBox.lo[ax] - 1;
                  if (!touch) touchBad++;
                }
              }
            }
          }
        }
      }
    }
  }
  ok(total > 10000, `전수 조합이 충분한가 (${total})`);
  ok(nullBad === 0, `앵커 계산이 항상 성공한다 — 실패 ${nullBad}`);
  ok(overlapBad === 0, `① 가리킨 브릭을 파고들지 않는다 — 위반 ${overlapBad}/${total}`);
  ok(touchBad === 0, `② 면에 딱 맞닿는다(뜨지도 파묻히지도 않음) — 위반 ${touchBad}/${total}`);
}

// ── ★ 커서는 항상 브릭 한가운데 (홀수·짝수 칸 모두) ──────────────────────
// 칸번호(floor)로 잡고 보정하는 방식은 **짝수 칸에서 반드시 어긋난다** — 2칸·4칸의 중앙은
// 칸 한가운데가 아니라 칸 경계에 있기 때문. 실제로 2×4를 놓으면 커서가 사각형 모서리에 붙어
// 브릭이 한쪽으로 뻗어 보였다(사용자 보고). 그래서 "중심이 커서에 가장 가까운 자리"로 고쳤다.
{
  const w = new BrickWorld();
  const tid = w.place('b2x8', 0, 30, 0, 0, '#fff', 'opaque')!;
  let bad = 0, n = 0, worst = 0;
  for (const part of PART_IDS) {
    for (const rot of ROTS) {
      // 면 위를 촘촘히 훑는다 (칸 한가운데뿐 아니라 경계 근처도)
      for (let u = 0; u < 2; u += 0.25) {
        for (let v = 0; v < 8; v += 0.25) {
          const px = u * CELL_X, pz = v * CELL_Z;
          const fp = anchorFromFace(w, tid, { axis: 1, dir: 1 }, px, 30.5 * CELL_Y, pz, part, rot)!;
          const e = extentOf(PARTS[part], rot);
          const cx = (fp.anchor.x + e.ex / 2) * CELL_X;
          const cz = (fp.anchor.z + e.ez / 2) * CELL_Z;
          const dx = Math.abs(cx - px), dz = Math.abs(cz - pz);
          worst = Math.max(worst, dx, dz);
          n++;
          // 격자에 맞추므로 반 칸까지는 어긋날 수 있지만 그 이상은 안 된다
          if (dx > CELL_X / 2 + 1e-9 || dz > CELL_Z / 2 + 1e-9) bad++;
        }
      }
    }
  }
  ok(bad === 0, `★ 커서가 브릭 한가운데(반 칸 이내) — 위반 ${bad}/${n}, 최대 ${worst.toFixed(3)}m`);
  ok(worst <= CELL_X / 2 + 1e-9, `최대 어긋남이 반 칸 이하 — ${worst.toFixed(3)}m`);
}

// ── 옆면은 밑면을 맞춘다 (짚은 높이와 무관하게 결과가 같다) ──────────────
// 가운데 정렬을 하면 위/아래 어디를 짚었느냐로 한 칸씩 어긋나 땅에 파묻히거나 뜬다.
{
  const w = new BrickWorld();
  const tid = w.place('b2x2', 0, 30, 0, 0, '#fff', 'opaque')!;
  const ys = new Set<number>();
  for (let hgt = 0; hgt < 3; hgt++) {
    const fp = anchorFromFace(
      w, tid, { axis: 0, dir: 1 },
      2.5 * CELL_X, (30 + hgt + 0.5) * CELL_Y, 0.5 * CELL_Z, 'b2x4', 0,
    )!;
    ys.add(fp.anchor.y);
  }
  ok(ys.size === 1 && ys.has(30), `옆면은 짚은 높이와 무관하게 밑면 정렬 — got ${[...ys]}`);
}

// ── ③ 미끄러짐: 고정 축은 절대 안 변한다 ────────────────────────────────
{
  const w = new BrickWorld();
  const tid = w.place('b2x2', 0, 30, 0, 0, '#fff', 'opaque')!;
  let bad = 0, n = 0;

  for (const face of FACES) {
    for (const part of PART_IDS) {
      for (const rot of ROTS) {
        const fp = anchorFromFace(w, tid, face, 0.5 * CELL_X, 30.5 * CELL_Y, 0.5 * CELL_Z, part, rot)!;
        const fixed = ([0, 1, 2] as FaceAxis[]).filter((a) => !fp.slide.includes(a));
        for (const d of [-40, -7, -1, 0, 1, 7, 40]) { // 사방으로 크게 끌어 본다
          const moved = slideAnchor(fp, d * CELL_X, d * CELL_Y, d * CELL_Z);
          const got = [moved.x, moved.y, moved.z];
          const base = [fp.anchor.x, fp.anchor.y, fp.anchor.z];
          n++;
          for (const a of fixed) if (got[a] !== base[a]) bad++;
        }
      }
    }
  }
  ok(bad === 0, `③ 고정 축은 드래그해도 안 변한다 — 위반 ${bad}/${n}`);

  // 옆면은 **높이가 고정 축**이어야 한다 (이게 아니면 붕 뜬 브릭이 생긴다)
  let sideBad = 0;
  for (const face of FACES) {
    const fp = anchorFromFace(w, tid, face, 0.5 * CELL_X, 30.5 * CELL_Y, 0.5 * CELL_Z, 'b1x1', 0)!;
    if (face.axis === 1) {
      if (fp.slide.length !== 2 || fp.slide.includes(1)) sideBad++;
    } else if (fp.slide.length !== 1 || fp.slide.includes(1)) sideBad++;
  }
  ok(sideBad === 0, `수평면=2축 · 옆면=수평 1축, 높이는 어느 쪽도 안 미끄러진다 — 위반 ${sideBad}`);

  // 자유 축은 실제로 따라온다 (고정만 하고 안 움직이면 드래그가 죽은 기능이다)
  const top = anchorFromFace(w, tid, { axis: 1, dir: 1 }, 0.5 * CELL_X, 30.5 * CELL_Y, 0.5 * CELL_Z, 'b1x1', 0)!;
  const far = slideAnchor(top, 9.5 * CELL_X, 0, 4.5 * CELL_Z);
  ok(far.x === 9 && far.z === 4, `자유 축은 커서를 따라온다 — got ${far.x},${far.z}`);
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

console.log(`\n브릭 배치(면 기준 + 미끄러짐) 테스트: ${pass}/${pass + fails.length} 통과`);
if (fails.length) {
  console.log('\n실패:');
  for (const f of fails.slice(0, 12)) console.log('  ✗ ' + f);
  if (fails.length > 12) console.log(`  … 외 ${fails.length - 12}건`);
  process.exit(1);
}
