// 실행: npx tsx src/lib/brick/brickGeometry.test.ts
//
// 경사(쐐기) 파츠의 **치수와 방향**을 잠근다.
// 치수가 틀리면 격자에서 삐져나오거나 틈이 생기는데, 화면에서 미묘해서 늦게 발견된다.

import { brickGeometry, triCount } from './brickGeometry';
import { CELL_X, CELL_Y, CELL_Z } from './grid';
import { PARTS } from './parts';

let pass = 0;
const fails: string[] = [];
const ok = (cond: boolean, label: string) => { if (cond) pass++; else fails.push(label); };
const near = (a: number, b: number, label: string, eps = 1e-6) =>
  ok(Math.abs(a - b) < eps, `${label} — ${a} vs ${b}`);

/** 지오메트리의 축별 최소/최대 */
function bounds(g: ReturnType<typeof brickGeometry>) {
  const p = g.getAttribute('position');
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.count; i++) {
    for (let k = 0; k < 3; k++) {
      const v = p.getComponent(i, k);
      if (v < lo[k]) lo[k] = v;
      if (v > hi[k]) hi[k] = v;
    }
  }
  return { lo, hi };
}

/** 특정 z에서의 최대 높이 — 경사가 어느 쪽으로 내려가는지 본다 */
function maxYAt(g: ReturnType<typeof brickGeometry>, z: number, eps = 1e-6) {
  const p = g.getAttribute('position');
  let y = -Infinity;
  for (let i = 0; i < p.count; i++) {
    if (Math.abs(p.getComponent(i, 2) - z) < eps) y = Math.max(y, p.getComponent(i, 1));
  }
  return y;
}

// ── 치수 — 점유 칸(AABB)과 정확히 같아야 한다 ─────────────
for (const id of ['s1x2', 's2x2', 'si1x2'] as const) {
  const part = PARTS[id];
  const g = brickGeometry(part, true, 'line');
  const { lo, hi } = bounds(g);
  near(hi[0] - lo[0], part.sx * CELL_X, `${id} 폭`);
  near(hi[1] - lo[1], part.h * CELL_Y, `${id} 높이`);
  near(hi[2] - lo[2], part.sz * CELL_Z, `${id} 길이`);
  ok(Math.abs(lo[0] + hi[0]) < 1e-6 && Math.abs(lo[1] + hi[1]) < 1e-6 && Math.abs(lo[2] + hi[2]) < 1e-6,
    `${id} 원점 중심 — 인스턴스 좌표계와 맞는다`);
  ok(triCount(g) === 8, `${id} 삼각기둥 = 8삼각형 — ${triCount(g)}`);
}

// ── ★ 모든 면이 바깥을 향하는가 (감기 방향) ────────────────
//
//   볼록한 도형이므로, **도형 안의 한 점**에서 각 면의 무게중심으로 간 방향과 그 면의 법선은 같은 쪽이어야 한다.
//   이게 뒤집히면 뒷면 컬링에 잘려 **면이 텅 비어 보인다** — 실제로 사각면 세 장이 전부 뒤집혀 있었고,
//   치수·삼각형 수만 보던 테스트는 그걸 통과시켰다.
//
//   ⚠️ 기준점을 **원점**으로 잡으면 안 된다 — 쐐기는 **경사면이 원점을 지나서** 내적이 0이 되고,
//      멀쩡한 면이 뒤집힌 것으로 잡힌다(처음에 그렇게 짰다가 걸렀다).
//      모든 꼭짓점의 평균은 볼록 결합이라 **항상 도형 안**에 있다.
for (const id of ['s1x2', 's2x2', 'si1x2'] as const) {
  const g = brickGeometry(PARTS[id], true, 'line');
  const p = g.getAttribute('position');
  const n = g.getAttribute('normal');
  let ix = 0, iy = 0, iz = 0;
  for (let i = 0; i < p.count; i++) { ix += p.getX(i); iy += p.getY(i); iz += p.getZ(i); }
  ix /= p.count; iy /= p.count; iz /= p.count;

  let bad = 0;
  for (let t = 0; t < p.count; t += 3) {
    let cx = 0, cy = 0, cz = 0;
    for (let k = 0; k < 3; k++) { cx += p.getX(t + k); cy += p.getY(t + k); cz += p.getZ(t + k); }
    cx /= 3; cy /= 3; cz /= 3;
    const dot = (cx - ix) * n.getX(t) + (cy - iy) * n.getY(t) + (cz - iz) * n.getZ(t);
    if (dot <= 1e-9) bad++;
  }
  ok(bad === 0, `★ ${id}: 모든 면이 바깥을 향한다 — 뒤집힌 면 ${bad}장`);
}

// ── 방향 — 경사는 +Z로 내려가고, 역경사는 아래가 깎인다 ─────
{
  const part = PARTS.s1x2;
  const g = brickGeometry(part, true, 'line');
  const { lo, hi } = bounds(g);
  near(maxYAt(g, lo[2]), hi[1], '★ 경사: −Z쪽이 가장 높다');
  near(maxYAt(g, hi[2]), lo[1], '★ 경사: +Z쪽은 바닥까지 내려간다');
}

{
  const part = PARTS.si1x2;
  const g = brickGeometry(part, true, 'line');
  const { lo, hi } = bounds(g);
  near(maxYAt(g, lo[2]), hi[1], '역경사: −Z쪽도 천장까지 있다');
  near(maxYAt(g, hi[2]), hi[1], '★ 역경사: +Z쪽도 천장까지 — 깎이는 건 아랫면이다');
}

// ── 돌기 스타일과 무관 ────────────────────────────────────
{
  const a = triCount(brickGeometry(PARTS.s1x2, true, 'round'));
  const b = triCount(brickGeometry(PARTS.s1x2, false, 'line'));
  ok(a === b && a === 8, `★ 경사는 돌기 스타일·유무와 무관하게 같은 메시 — ${a}, ${b}`);
}

// ── 상자 파츠는 그대로 ────────────────────────────────────
{
  const g = brickGeometry(PARTS.b2x4, false, 'line');
  const { lo, hi } = bounds(g);
  near(hi[0] - lo[0], 2 * CELL_X, '기존 브릭 폭 무변경');
  ok(triCount(g) === 12, `기존 브릭(민짜 상자)은 12삼각형 — ${triCount(g)}`);
}

console.log(`\n브릭 지오메트리(경사) 테스트: ${pass}/${pass + fails.length} 통과`);
if (fails.length) {
  console.log('\n실패:');
  for (const f of fails) console.log('  ✗ ' + f);
  process.exit(1);
}
