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

// ── ★ 무늬 타일링 (`aTexUV`) ─────────────────────────────────────────────
//
// 잠그는 것은 딱 하나: **텍셀 밀도가 파츠 크기와 무관하다.**
// 이게 깨지면 1×1과 1×2를 나란히 놓았을 때 벽돌 줄눈 간격이 2배 차이 난다(실제로 그랬다).
// 화면에서는 "뭔가 안 맞는다"로만 보여서 원인을 짚기 어렵다 — 그래서 수치로 잠근다.
{
  /** 법선이 특정 축을 향하는 정점들의 aTexUV 범위 */
  const faceUV = (g: ReturnType<typeof brickGeometry>, axis: 0 | 1 | 2, sign: 1 | -1) => {
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    const uv = g.getAttribute('aTexUV');
    const lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
    let found = 0;
    for (let i = 0; i < p.count; i++) {
      if (n.getComponent(i, axis) * sign < 0.99) continue; // 그 면의 정점만
      found++;
      for (let k = 0; k < 2; k++) {
        const v = uv.getComponent(i, k);
        if (v < lo[k]) lo[k] = v;
        if (v > hi[k]) hi[k] = v;
      }
    }
    return { lo, hi, found };
  };

  // 모든 파츠가 aTexUV를 갖는다 — 하나라도 빠지면 그 파츠만 무늬가 뭉개진다
  for (const part of Object.values(PARTS)) {
    for (const studs of [true, false]) {
      const g = brickGeometry(part, studs, 'round');
      const uv = g.getAttribute('aTexUV');
      ok(!!uv && uv.count === g.getAttribute('position').count,
        `${part.id}(${studs ? '돌기' : '민짜'}): aTexUV가 정점 수만큼 있다`);
    }
  }

  // ★ 핵심 — 옆면 가로 타일 수 = **그 면이 걸치는 칸 수**.
  //   주의: `b1x2`는 sx=1·sz=2라 **긴 축이 Z**다. +Z면은 X(=sx칸)를, +X면은 Z(=sz칸)를 가로로 쓴다.
  for (const id of ['b1x1', 'b1x2', 'b1x4', 'b2x8'] as const) {
    const g = brickGeometry(PARTS[id], false, 'line');
    near(faceUV(g, 2, 1).hi[0] - faceUV(g, 2, 1).lo[0], PARTS[id].sx,
      `★ ${id} 앞면(+Z) 가로 = ${PARTS[id].sx}타일`);
    near(faceUV(g, 0, 1).hi[0] - faceUV(g, 0, 1).lo[0], PARTS[id].sz,
      `★ ${id} 옆면(+X) 가로 = ${PARTS[id].sz}타일`);
  }

  // ★★ 1×1과 1×2가 **같은 텍셀 밀도**인가 — 사용자가 보고한 바로 그 증상.
  //   길이가 다른 면끼리 비교해야 의미가 있다(+X면: 1칸 vs 2칸).
  {
    const density = (id: 'b1x1' | 'b1x2' | 'b2x8') => {
      const f = faceUV(brickGeometry(PARTS[id], false, 'line'), 0, 1);
      return (f.hi[0] - f.lo[0]) / (PARTS[id].sz * CELL_Z); // m당 타일 수
    };
    near(density('b1x1'), density('b1x2'), '★★ 1×1과 1×2의 텍셀 밀도가 같다 (m당 타일 수)');
    near(density('b1x1'), density('b2x8'), '★★ 1×1과 2×8의 텍셀 밀도가 같다');
    near(density('b1x1'), 1 / CELL_X, `★ 밀도 = 1칸(${CELL_X}m)당 한 장`);
  }

  // 윗면은 두 방향 모두 칸 수만큼 — 지형(2×2)도 브릭과 같은 밀도여야 한다
  {
    const g = brickGeometry(PARTS.b2x4, false, 'line');
    const f = faceUV(g, 1, 1);
    near(f.hi[0] - f.lo[0], 2, '2×4 윗면 가로 = 2타일');
    near(f.hi[1] - f.lo[1], 4, '2×4 윗면 세로 = 4타일');

    const t = faceUV(brickGeometry(PARTS.terrain, false, 'line'), 1, 1);
    near(t.hi[0] - t.lo[0], 2, '★ 지형(2×2) 윗면 = 2타일 — 브릭과 같은 밀도');
  }

  // ★ 세로는 **위쪽 기준** — 브릭은 딱 한 장, 플레이트는 위쪽 ⅓
  {
    const brickF = faceUV(brickGeometry(PARTS.b1x2, false, 'line'), 2, 1);
    near(brickF.hi[1], 1, '브릭 옆면 위 끝 = 1 (위쪽 기준)');
    near(brickF.lo[1], 0, '브릭 옆면 아래 끝 = 0 (딱 한 장)');

    const plateF = faceUV(brickGeometry(PARTS.p1x2, false, 'line'), 2, 1);
    near(plateF.hi[1], 1, '★ 플레이트도 위 끝 = 1 — 잔디 풀 띠가 위에 남는다');
    near(plateF.lo[1], 1 - 1 / 3, '★ 플레이트 옆면은 위쪽 ⅓만 (브릭과 같은 밀도)');
  }

  // 경사도 무늬를 받는다 — 쐐기엔 원래 uv 자체가 없었다
  {
    const g = brickGeometry(PARTS.s1x2, false, 'line');
    const uv = g.getAttribute('aTexUV');
    let span = 0;
    for (let i = 0; i < uv.count; i++) span = Math.max(span, Math.abs(uv.getX(i)));
    ok(span > 0.5, `★ 경사 파츠도 aTexUV가 퍼져 있다 — 최대 ${span.toFixed(2)}`);
  }

  // ★ 모든 파츠에 `uv`(면당 0~1)가 있어야 한다 — 경계선 셰이더가 이걸로 가장자리를 찾는다.
  //   없으면 `vUv`가 (0,0)으로 읽혀 **면 전체가 '선 위'로 판정돼 통째로 어두워진다**(경사면이 14% 어두웠다).
  for (const part of Object.values(PARTS)) {
    const g = brickGeometry(part, false, 'line');
    const uv = g.getAttribute('uv');
    ok(!!uv && uv.count === g.getAttribute('position').count, `${part.id}: uv가 정점 수만큼 있다`);
    if (!uv) continue;
    let lo = Infinity, hi = -Infinity, bad = 0;
    for (let i = 0; i < uv.count; i++) {
      for (let k = 0; k < 2; k++) {
        const v = uv.getComponent(i, k);
        if (v < lo) lo = v;
        if (v > hi) hi = v;
        if (v < -1e-6 || v > 1 + 1e-6) bad++;
      }
    }
    ok(bad === 0, `${part.id}: uv가 0~1 범위 안 — 벗어난 값 ${bad}개`);
    ok(hi - lo > 0.9, `★ ${part.id}: uv가 0~1로 퍼져 있다 (한 점에 뭉치면 면이 통째로 어두워진다) — ${lo}~${hi}`);
  }
}

console.log(`\n브릭 지오메트리(경사) 테스트: ${pass}/${pass + fails.length} 통과`);
if (fails.length) {
  console.log('\n실패:');
  for (const f of fails) console.log('  ✗ ' + f);
  process.exit(1);
}
