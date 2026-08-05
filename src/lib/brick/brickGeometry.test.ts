// 실행: npx tsx src/lib/brick/brickGeometry.test.ts
//
// 파츠 메시의 **치수·UV·모따기**를 잠근다.
// 치수가 틀리면 격자에서 삐져나오거나 틈이 생기는데, 화면에서 미묘해서 늦게 발견된다.

import { brickGeometry, triCount } from './brickGeometry';
import { CELL_X, CELL_Y, CELL_Z } from './grid';
import { occludes, PARTS } from './parts';

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

/** 모서리(여덟 꼭짓점)에 딱 붙은 정점 수 — 0이면 모따기가 먹었다는 뜻 */
function sharpCorners(g: ReturnType<typeof brickGeometry>, eps = 1e-6) {
  const { lo, hi } = bounds(g);
  const p = g.getAttribute('position');
  let n = 0;
  for (let i = 0; i < p.count; i++) {
    let all = true;
    for (let k = 0; k < 3; k++) {
      const v = p.getComponent(i, k);
      if (Math.abs(v - lo[k]) > eps && Math.abs(v - hi[k]) > eps) { all = false; break; }
    }
    if (all) n++;
  }
  return n;
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

// ── ★ 가는 파츠(기둥·봉·패널) — `BRICK_PLAN.md` §19 ──────────────────────
//
// 칸은 정수 그대로 차지하고 **그리는 크기만** 얇다. 두 가지가 어긋나기 쉽다:
//   ① 그리는 크기가 칸을 삐져나오면 이웃 브릭을 파고든다
//   ② 조명·무늬를 **그리는 크기**로 계산하면 그 파츠만 무늬가 확대되고 밝기가 튄다
{
  const THIN = ['c1x1', 'r1x2', 'r1x4', 'w1x1', 'w1x2', 'w1x4'] as const;

  for (const id of THIN) {
    const part = PARTS[id];
    const g = brickGeometry(part, false, 'line');
    const { lo, hi } = bounds(g);
    const cell = [part.sx * CELL_X, part.h * CELL_Y, part.sz * CELL_Z];
    const drawn = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];

    // ① 칸 밖으로 안 나간다
    let inside = true;
    for (let k = 0; k < 3; k++) if (drawn[k] > cell[k] + 1e-6) inside = false;
    ok(inside, `★ ${id}: 그리는 크기가 칸 안에 들어간다 — 그림 ${drawn.map((v) => v.toFixed(2))} ⊂ 칸 ${cell.map((v) => v.toFixed(2))}`);

    // 가운데 정렬 — 한쪽으로 쏠리면 이웃과 안 맞는다
    for (let k = 0; k < 3; k++) near((lo[k] + hi[k]) / 2, 0, `${id}: 축 ${k}가 가운데 정렬`);

    // 적어도 한 축은 실제로 얇아야 '가는 파츠'다
    let anyThin = false;
    for (let k = 0; k < 3; k++) if (drawn[k] < cell[k] - 1e-6) anyThin = true;
    ok(anyThin, `★ ${id}: 적어도 한 축이 칸보다 얇다(안 그러면 그냥 상자다)`);

    // T-5: uv가 없으면 경계선 셰이더가 **면 전체를 어둡게** 만든다
    ok(g.getAttribute('uv') !== undefined, `${id}: uv가 있다 (없으면 면이 통째로 어두워진다)`);
    // T-4: 무늬 전용 UV
    ok(g.getAttribute('aTexUV') !== undefined, `${id}: aTexUV가 있다 (없으면 무늬가 뭉개진다)`);
    // 부드러운 조명 재료
    ok(g.getAttribute('aSelA') !== undefined && g.getAttribute('aSelB') !== undefined,
      `${id}: 꼭짓점 가중치가 있다`);
  }

  // ★★ ②의 핵심 — **무늬 밀도(m당 몇 장)가 모든 파츠에서 같은가.**
  //
  // ⚠️ 무늬 **범위**를 비교하면 안 된다. 기둥은 0.2m라 범위가 0.4인 게 **정상**이다
  //    (처음에 범위로 비교했다가 틀린 실패를 봤다). 같아야 하는 건 `범위 ÷ 실제 길이`다.
  //    이게 어긋나면 그 파츠만 무늬가 확대·축소돼 옆 브릭과 안 맞는다(T-4).
  const sideDensity = (id: keyof typeof PARTS) => {
    const g = brickGeometry(PARTS[id], false, 'line');
    const p = g.getAttribute('position'), n = g.getAttribute('normal'), t = g.getAttribute('aTexUV');
    let uLo = Infinity, uHi = -Infinity, zLo = Infinity, zHi = -Infinity;
    for (let i = 0; i < p.count; i++) {
      if (Math.abs(n.getX(i)) < 0.9) continue; // ±X 면만 — 이 면의 가로(u)는 Z에서 온다
      const u = t.getX(i), z = p.getZ(i);
      if (u < uLo) uLo = u; if (u > uHi) uHi = u;
      if (z < zLo) zLo = z; if (z > zHi) zHi = z;
    }
    return (uHi - uLo) / (zHi - zLo); // 무늬 장수 / m
  };
  const base = sideDensity('b1x1');
  near(base, 1 / CELL_X, '기준: 1×1 브릭은 0.5m마다 무늬 한 장');
  for (const id of ['c1x1', 'r1x2', 'w1x1', 'w1x4'] as const) {
    near(sideDensity(id), base, `${id}의 무늬 밀도가 브릭과 같다`);
  }

  // ★★★ **조명 가중치가 칸 기준인가** — 여기가 진짜 함정이다.
  //
  // 꼭짓점 가중치는 "이 정점이 칸의 여덟 모서리 중 어디에 있나"다. 얇은 파츠를 **그리는 크기**로
  // 정규화하면, 0.2m짜리 기둥이 제 혼자 **밝기 범위를 0~1 전부** 쓴다 → 칸 한가운데 서 있는데도
  // 한쪽 면은 왼쪽 끝 밝기, 반대쪽은 오른쪽 끝 밝기를 받아 **이웃 브릭과 명암이 어긋난다.**
  // 칸 기준으로 계산하면 가중치가 가운데로 몰려(0.3~0.7) 주변과 자연스럽게 이어진다.
  //
  // ⚠️ 무늬 밀도로는 이걸 **못 잡는다**(`addTexUV`의 크기 인자는 배율이 아니라 원점 이동이라서).
  //    사보타주로 확인했다 — 밀도 검사만 있을 땐 그대로 통과했다.
  const maxWeight = (id: keyof typeof PARTS) => {
    const g = brickGeometry(PARTS[id], false, 'line');
    const a = g.getAttribute('aSelA'), b = g.getAttribute('aSelB');
    let m = 0;
    for (let i = 0; i < a.count; i++) {
      for (let k = 0; k < 4; k++) m = Math.max(m, a.getComponent(i, k), b.getComponent(i, k));
    }
    return m;
  };
  ok(maxWeight('b1x1') > 0.99,
    `기준: 꽉 찬 브릭의 정점은 칸 모서리에 딱 붙는다 — ${maxWeight('b1x1').toFixed(3)}`);
  ok(maxWeight('c1x1') < 0.6,
    `★★★ 기둥의 조명 가중치가 칸 가운데로 몰린다(칸 기준 계산) — ${maxWeight('c1x1').toFixed(3)}`);
  ok(maxWeight('w1x2') < 0.9,
    `★★★ 패널도 마찬가지 — ${maxWeight('w1x2').toFixed(3)}`);

  // 얇은 파츠는 이웃을 감추면 안 된다 — 감추면 그 너머에 구멍이 뚫린다
  for (const id of THIN) ok(!occludes(id), `${id}: 이웃 면을 감추지 않는다`);

  // ── ★★ 모따기가 가는 파츠에도 걸린다 (2026-08-05 사용자 신고) ────────────
  //
  // 기본 돌기 스타일이 **모따기**인데 가는 파츠만 `BoxGeometry`를 쓰고 있어서,
  // 기둥·봉·패널만 모서리가 **날카로웠다.** 브릭 옆에 세우면 혼자 각져 보인다.
  //
  // ★ 판별은 **모서리에 딱 붙은 정점이 있는가**로 한다. 삼각형 수만 보면
  //   "메시가 바뀌었다"까지만 알고 **실제로 깎였는지는 모른다**.
  {
    const boxRef = sharpCorners(brickGeometry(PARTS.b1x1, false, 'none'));
    ok(boxRef === 0, `기준: 브릭은 모따기에서 모서리가 깎인다 — 남은 꼭짓점 ${boxRef}`);

    for (const id of THIN) {
      const beveled = brickGeometry(PARTS[id], false, 'none');
      const sharp = brickGeometry(PARTS[id], false, 'line');
      ok(sharpCorners(beveled) === 0, `★★ ${id}: 모따기에서 모서리가 깎인다 — 남은 꼭짓점 ${sharpCorners(beveled)}`);
      ok(sharpCorners(sharp) > 0, `${id}: '라인' 스타일에서는 각진 상자 그대로 — ${sharpCorners(sharp)}`);
      ok(triCount(beveled) === triCount(brickGeometry(PARTS.b1x1, false, 'none')),
        `${id}: 브릭과 같은 모따기 메시 — ${triCount(beveled)}`);

      // ⚠️ 깎아도 **칸 밖으로 나가지 않고** 그리는 크기도 안 변한다(깎는 건 안쪽으로만)
      const b = bounds(beveled), s = bounds(sharp);
      for (let k = 0; k < 3; k++) {
        near(b.hi[k] - b.lo[k], s.hi[k] - s.lo[k], `${id}: 모따기해도 축 ${k} 크기가 그대로`);
      }
    }

    // ★ 얇은 축이 0.1m(패널)라 **깎는 폭을 안 조이면 메시가 뒤집힌다** — 두께의 절반 미만이어야 한다.
    //   그 경계를 지키는지는 "폭이 그대로인가"(위)와 "면이 바깥을 향하는가"(아래)로 잠근다.
    for (const id of THIN) {
      const g = brickGeometry(PARTS[id], false, 'none');
      const p = g.getAttribute('position'), n = g.getAttribute('normal');
      let bad = 0;
      for (let i = 0; i < p.count; i++) {
        // 볼록 도형이라 중심(원점)에서 정점으로 간 방향과 법선이 같은 쪽이어야 한다
        if (p.getX(i) * n.getX(i) + p.getY(i) * n.getY(i) + p.getZ(i) * n.getZ(i) <= 0) bad++;
      }
      ok(bad === 0, `★ ${id}: 모따기한 면이 전부 바깥을 향한다(뒤집히지 않았다) — 뒤집힌 정점 ${bad}`);
    }
  }
}

console.log(`\n브릭 지오메트리(치수·UV·모따기) 테스트: ${pass}/${pass + fails.length} 통과`);
if (fails.length) {
  console.log('\n실패:');
  for (const f of fails) console.log('  ✗ ' + f);
  process.exit(1);
}
